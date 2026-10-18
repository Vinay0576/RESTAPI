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
import {normalizeError} from './errors.js';
import {errors,noQuery} from './http/schemas.js';
import {registerModules} from './modules/register.js';

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
    await registerModules(app,{resources,service,db});
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
