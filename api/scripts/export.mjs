import {writeFile,mkdir} from 'node:fs/promises';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {describeResource} from '../src/model.js';
const config=loadConfig(),app=await buildApp(config,{logger:false});
const out=new URL('../',import.meta.url);
const write=async(path,data,mode=0o644)=>writeFile(new URL(path,out),JSON.stringify(data,null,2)+'\n',{mode});
const fixture={
  'identity.profiles':{id:config.actorId},'identity.accounts':{id:'20000000-0000-4000-8000-000000000001'},
  'geography.regions':{code:'IN-TG-HYD'},'geography.sites':{id:'40000000-0000-4000-8000-000000000001'},
  'catalogue.equipment_categories':{code:'excavator'},'catalogue.manufacturers':{id:'30000000-0000-4000-8000-000000000001'},
  'catalogue.models':{id:'31000000-0000-4000-8000-000000000001'},'catalogue.attachment_categories':{code:'bucket'},
  'catalogue.attachments':{id:'32000000-0000-4000-8000-000000000001'},'fleet.machines':{id:'50000000-0000-4000-8000-000000000001'},
  'fleet.machine_rate_versions':{id:'51000000-0000-4000-8000-000000000001'},
  'rentals.bookings':{id:'60000000-0000-4000-8000-000000000001'},'finance.currencies':{code:'INR'},
  'finance.ledger_accounts':{id:'70000000-0000-4000-8000-000000000001'},
  'messaging.notifications':{id:'82000000-0000-4000-8000-000000000001'}};
const fk={owner_account_id:fixture['identity.accounts'].id,supplier_account_id:fixture['identity.accounts'].id,
  customer_account_id:'20000000-0000-4000-8000-000000000002',account_id:fixture['identity.accounts'].id,
  profile_id:config.actorId,recipient_profile_id:config.actorId,manufacturer_id:fixture['catalogue.manufacturers'].id,
  machine_id:fixture['fleet.machines'].id,yard_site_id:fixture['geography.sites'].id,model_id:fixture['catalogue.models'].id,
  booking_id:fixture['rentals.bookings'].id,currency_code:'INR',region_code:'IN-TG-HYD'};
function example(r,key,schema) {
  if(fk[key]) return fk[key];
  const line=r.lines.find(l=>l.startsWith(key+' '));
  const choices=line?.match(/\bin \(([^)]+)\)/)?.[1]?.match(/'([^']+)'/g);
  if(choices?.length) return choices[0].slice(1,-1);
  if(schema.format==='uuid') return '{{$guid}}';
  if(schema.format==='date-time') return new Date(Date.now()+86400000).toISOString();
  if(schema.format==='date') return new Date(Date.now()+86400000).toISOString().slice(0,10);
  if(schema.type==='boolean') return false;
  if(schema.type==='integer'||schema.type==='number') return 1;
  if(schema.type==='object') return {};
  if(schema.type==='array') return [];
  if(schema.pattern?.includes('[0-9]')) return '1';
  if(r.columns.find(c=>c.name===key)?.type==='bytea') return 'ZGVtbw==';
  return 'replace-with-valid-'+key;
}
const apiRequest=(name,method,path,body,description='')=>({name,request:{method,header:body?[{key:'Content-Type',value:'application/json'}]:[],
  url:'{{baseUrl}}'+path,description,...(body?{body:{mode:'raw',raw:JSON.stringify(body,null,2),options:{raw:{language:'json'}}}}:{})},response:[]});
const asserted=(item,status,extra=[])=>({...item,event:[{listen:'test',script:{type:'text/javascript',exec:[`pm.test("HTTP ${status}", () => pm.response.to.have.status(${status}));`,...extra]}}]});
try {
  await mkdir(new URL('docs/',out),{recursive:true}); await mkdir(new URL('postman/',out),{recursive:true});
  const spec=app.swagger();
  await write('docs/openapi.json',spec);
  await write('docs/resources.json',app.resources.map(describeResource));
  const quick=[
    asserted({...apiRequest('01 — Readiness','GET','/health/ready'),request:{method:'GET',url:'{{baseUrl}}/health/ready',auth:{type:'noauth'}}},200),
    asserted(apiRequest('02 — Browse all 122 resources','GET','/v1/resources'),200),
    asserted(apiRequest('03 — Read seeded machines','GET','/v1/admin/fleet/machines?limit=10'),200),
    asserted(apiRequest('04 — Filter requested bookings','GET','/v1/admin/rentals/bookings?filter='+encodeURIComponent('{"state":"requested"}')),200),
    asserted(apiRequest('05 — Create manufacturer','POST','/v1/admin/catalogue/manufacturers',{name:'Postman demo {{$guid}}'}),201,
      ['pm.collectionVariables.set("demoManufacturerId", pm.response.json().data.id);']),
    asserted(apiRequest('06 — Read created manufacturer','GET','/v1/admin/catalogue/manufacturers/{{demoManufacturerId}}'),200),
    asserted(apiRequest('07 — Update manufacturer','PATCH','/v1/admin/catalogue/manufacturers/{{demoManufacturerId}}',{name:'Updated Postman demo {{$guid}}'}),200),
    asserted(apiRequest('08 — Archive manufacturer','DELETE','/v1/admin/catalogue/manufacturers/{{demoManufacturerId}}'),204),
    asserted(apiRequest('09 — Read retained archived row','GET','/v1/admin/catalogue/manufacturers/{{demoManufacturerId}}'),200,
      ['pm.test("Archive retained", () => pm.expect(pm.response.json().data.archived_at).to.be.a("string"));']),
    asserted(apiRequest('10 — Derived finance view','GET','/v1/admin/finance/booking-balances'),200)
  ];
  const ledger=asserted(apiRequest('11 — Atomic balanced journal','POST','/v1/transactions',{operations:[
    {resource:'finance.journals',method:'POST',body:{id:'{{journalId}}',request_key:'{{$guid}}',adjustment_reason:'Postman demo balanced journal'}},
    {resource:'finance.entries',method:'POST',body:{journal_id:'{{journalId}}',ledger_account_id:'70000000-0000-4000-8000-000000000001',line_no:1,amount_minor:'10000'}},
    {resource:'finance.entries',method:'POST',body:{journal_id:'{{journalId}}',ledger_account_id:'70000000-0000-4000-8000-000000000002',line_no:2,amount_minor:'-10000'}}
  ]}),200);
  ledger.event.unshift({listen:'prerequest',script:{type:'text/javascript',exec:['pm.collectionVariables.set("journalId", pm.variables.replaceIn("{{$guid}}"));']}});
  quick.push(ledger);
  const folders=new Map(),variables=[{key:'baseUrl',value:'http://localhost:3100'},{key:'apiKey',value:''},{key:'demoManufacturerId',value:''},{key:'journalId',value:''}];
  for(const r of app.resources) {
    if(!folders.has(r.domain)) folders.set(r.domain,{name:r.domain,item:[]});
    const keys=r.pk.map(key=>{
      const variable=r.name.replace('.','_')+'_'+key;
      variables.push({key:variable,value:fixture[r.name]?.[key]||''});
      return '{{'+variable+'}}';
    });
    const itemPath=r.path+'/'+keys.join('/');
    const description=r.purpose+'\n\n'+r.access+'\nThis endpoint uses the privileged local data API, not end-user RLS. Set any empty key variables and foreign keys before using write requests. Database CHECKs, FKs, triggers and retention remain authoritative.';
    const entries=[apiRequest('List / search','GET',r.path+'?limit=25&offset=0',undefined,description),apiRequest('Get by primary key','GET',itemPath,undefined,description)];
    if(!r.readOnly) {
      const body=Object.fromEntries((r.createSchema.required??[]).map(key=>[key,example(r,key,r.createSchema.properties[key])]));
      entries.push(apiRequest('Create — complete required references first','POST',r.path,body,description));
    }
    if(r.mode!=='append') {
      const key=Object.keys(r.patchSchema.properties)[0];
      entries.push(apiRequest('Patch — choose fields to change','PATCH',itemPath,key?{[key]:example(r,key,r.patchSchema.properties[key])}:{},description));
    }
    if(r.mode==='archive') entries.push(apiRequest('Archive (retains row)','DELETE',itemPath,undefined,description));
    folders.get(r.domain).item.push({name:r.name,description,item:entries});
  }
  const collection={info:{name:'EquipRent — complete normalized model API',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description:'Run the Quickstart folder in order against the local demo database. The complete resource catalogue contains editable request templates: populate keys/FKs before executing its writes. Admin key is privileged database maintenance, not a customer login.'},
    auth:{type:'bearer',bearer:[{key:'token',value:'{{apiKey}}',type:'string'}]},variable:variables,
    item:[{name:'Quickstart — runnable seeded examples',item:quick},...folders.values()]};
  await write('postman/equiprent.postman_collection.json',collection);
  await write('postman/environment.example.json',{name:'EquipRent local (fill keys)',_postman_variable_scope:'environment',values:[
    {key:'baseUrl',value:'http://localhost:3100',enabled:true},{key:'apiKey',value:'',type:'secret',enabled:true},{key:'readKey',value:'',type:'secret',enabled:true}]});
  await write('postman/local.postman_environment.json',{name:'EquipRent local (private credentials)',_postman_variable_scope:'environment',values:[
    {key:'baseUrl',value:`http://localhost:${process.env.API_PORT||3100}`,enabled:true},{key:'apiKey',value:config.adminKey,type:'secret',enabled:true},{key:'readKey',value:config.readKey,type:'secret',enabled:true}]},0o600);
  const paths=Object.values(spec.paths),operations=paths.reduce((n,p)=>n+Object.keys(p).filter(k=>['get','post','patch','delete'].includes(k)).length,0);
  await write('docs/coverage.json',{tables:app.resources.length,businessSchemas:new Set(app.resources.map(r=>r.domain)).size,
    derivedViews:1,documentedOperations:operations,quickstartRequests:quick.length,sourceModelDate:'2026-10-18',implementationDate:'2026-10-19',
    scope:'Local privileged database REST API, not production marketplace workflows.'});
  console.log(`Exported OpenAPI (${operations} operations), 122 resource definitions and Postman collection. Private credentials kept in ignored environment file.`);
} finally {await app.close();}
