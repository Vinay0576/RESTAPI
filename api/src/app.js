import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './db.js';
import {loadResources,describeResource} from './model.js';
import {createService} from './services.js';
import {authHook} from './auth.js';
import {ApiError,normalizeError} from './errors.js';
import {errors,noQuery,listQuery,resourceSchemas} from './http/schemas.js';
import {contractsRoutes,CONTRACT_RESOURCE} from './modules/finance/contracts.routes.js';

export async function buildApp(config,{logger=true}={}) {
  const app=Fastify({bodyLimit:1024*1024,genReqId:()=>randomUUID(),requestIdHeader:false,
    logger:logger?{level:config.logLevel,redact:['req.headers.authorization'],serializers:{req:r=>({method:r.method,url:r.url?.split('?')[0],remoteAddress:r.ip})}}:false,
    ajv:{customOptions:{removeAdditional:false,coerceTypes:false,useDefaults:false,allErrors:true}}});
  const db=createDatabase(config);
  app.addHook('onClose',()=>db.close());
  try {
    const resources=await loadResources(db),service=createService(db,config,resources);
    app.decorate('resources',resources); app.decorate('database',db);
    await app.register(helmet,{contentSecurityPolicy:false});
    await app.register(rateLimit,{max:config.rateMax,timeWindow:'1 minute'});
    await app.register(swagger,{openapi:{openapi:'3.0.3',info:{title:'EquipRent normalized model data API',version:'1.0.0',
      description:'Local privileged database API for the 122-table proposal. Not a production marketplace workflow API. Every /v1 route requires an admin or read-only API key. All writes require the admin key. DELETE archives only; append-only records cannot be edited/deleted. Decimal and bigint fields are JSON strings.'},
      servers:[{url:'/',description:'Current API host'}],components:{securitySchemes:{apiKey:{type:'http',scheme:'bearer',description:'Local admin or read-only API key from .env; not a customer session.'}}},security:[{apiKey:[]}]}});
    const authenticate=authHook(config);
    app.addHook('onRequest',async(request,reply)=>{
      reply.header('X-Request-Id',request.id);
      if(request.routeOptions.url?.startsWith('/docs')) return;
      await authenticate(request);
      if(request.url.startsWith('/v1')) reply.header('Cache-Control','no-store');
    });
    app.setErrorHandler((err,request,reply)=>{
      const normalized=normalizeError(err);
      if(normalized.status>=500) request.log.error({code:err.code??normalized.code,requestId:request.id},'Request failed');
      if(normalized.status===401) reply.header('WWW-Authenticate','Bearer');
      reply.code(normalized.status).send({error:{code:normalized.code,message:normalized.message,
        ...(normalized.details?{details:normalized.details}:{})},requestId:request.id});
    });
    app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:{code:'ROUTE_NOT_FOUND',message:'Endpoint not found.'},requestId:request.id}));
    app.get('/health/live',{config:{public:true},schema:{hide:true}},async()=>({status:'ok'}));
    app.get('/health/ready',{config:{public:true},schema:{hide:true}},async()=>{
      await db.transaction(c=>c.query('select 1'),{readOnly:true}); return {status:'ready',resources:resources.length};
    });
    app.get('/openapi.json',{config:{public:true},schema:{hide:true}},async()=>app.swagger());
    await app.register(swaggerUI,{routePrefix:'/docs'});
    app.get('/v1/resources',{schema:{tags:['Metadata'],summary:'List all model resources, schemas, keys and constraints',querystring:noQuery,response:errors}},async request=>({data:resources.map(describeResource),meta:{requestId:request.id}}));
    app.get('/v1/admin/finance/booking-balances',{schema:{tags:['finance'],summary:'Read the supplied derived booking balance view',
      description:'Derived financial projection, not payout or release eligibility. Exact amounts remain strings.',
      querystring:{type:'object',properties:{limit:listQuery.properties.limit,offset:listQuery.properties.offset,booking_id:{type:'string',format:'uuid'}},additionalProperties:false},response:errors}},async request=>{
      const limit=Number(request.query.limit??25),offset=Number(request.query.offset??0);
      if(limit<1||limit>100||offset>100000) throw new ApiError(422,'INVALID_PAGE','limit must be 1..100 and offset 0..100000.');
      const rows=await db.transaction(c=>c.query('select * from finance.booking_balances where ($1::uuid is null or booking_id=$1) order by booking_id limit $2 offset $3',[request.query.booking_id??null,limit,offset]),{readOnly:true});
      return {data:rows.rows,page:{limit,offset},meta:{requestId:request.id}};
    });
    await app.register(contractsRoutes,{resource:resources.find(r=>r.name===CONTRACT_RESOURCE),service});
    for(const r of resources) {
      // Contracts are registered by their dedicated finance module.
      if(r.name===CONTRACT_RESOURCE) continue;
      const {base,one,list}=resourceSchemas(r);
      app.get(r.path,{schema:{...base,summary:`List ${r.name}`,querystring:listQuery,response:{...errors,200:list}}},
        async request=>({...await service.list(r,request.query),meta:{requestId:request.id}}));
      app.get(r.itemPath,{schema:{...base,summary:`Get ${r.name}`,params:r.keySchema,querystring:noQuery,response:{...errors,200:one}}},
        async request=>({data:await service.get(r,request.params),meta:{requestId:request.id}}));
      if(!r.readOnly) app.post(r.path,{schema:{...base,summary:`Create ${r.name}`,body:r.createSchema,querystring:noQuery,response:{...errors,201:one}}},
        async(request,reply)=>{
          const data=await service.write(r,'POST',undefined,request.body,request.id);
          reply.code(201).header('Location',r.path+'/'+r.pk.map(k=>encodeURIComponent(data[k])).join('/'));
          return {data,meta:{requestId:request.id}};
        });
      if(r.mode!=='append') app.patch(r.itemPath,{schema:{...base,summary:`Update ${r.name}`,params:r.keySchema,querystring:noQuery,body:r.patchSchema,response:{...errors,200:one}}},
        async request=>({data:await service.write(r,'PATCH',request.params,request.body,request.id),meta:{requestId:request.id}}));
      if(r.mode==='archive') app.delete(r.itemPath,{schema:{...base,summary:`Archive ${r.name}`,params:r.keySchema,querystring:noQuery,response:{...errors,204:{type:'null'}}}},
        async(request,reply)=>{ await service.write(r,'DELETE',request.params,undefined,request.id); reply.code(204).send(); });
      const unsupported=[];
      if(r.mode==='append') unsupported.push('PATCH');
      if(r.mode!=='archive') unsupported.push('DELETE');
      unsupported.push('PUT');
      app.route({method:unsupported,url:r.itemPath,schema:{hide:true},handler:async()=>{throw new ApiError(405,'OPERATION_NOT_ALLOWED','This resource does not support replacement, hard deletion or append-only mutation.');}});
      if(r.readOnly) app.post(r.path,{schema:{hide:true}},async()=>{throw new ApiError(405,'OPERATION_NOT_ALLOWED','Audit events are generated by the API.');});
    }
    app.post('/v1/transactions',{schema:{tags:['Transactions'],summary:'Apply up to 25 model writes atomically',
      description:'Admin only. Includes audit records in the same transaction. All writes and deferred ledger checks must pass before commit. Supply explicit UUIDs to link newly created rows. No SQL or arbitrary RPCs accepted.',
      querystring:noQuery,body:{type:'object',properties:{operations:{type:'array',minItems:1,maxItems:25,items:{type:'object',properties:{
        resource:{type:'string',enum:resources.map(r=>r.name)},method:{type:'string',enum:['POST','PATCH','DELETE']},
        key:{type:'object',additionalProperties:true},body:{type:'object',additionalProperties:true}},required:['resource','method'],additionalProperties:false}}},required:['operations'],additionalProperties:false},response:errors}},
      async request=>({data:await service.batch(request.body.operations,request.id),meta:{requestId:request.id}}));
    await app.ready();
    return app;
  } catch(err) { await app.close(); throw err; }
}
