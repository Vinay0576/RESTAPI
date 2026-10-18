import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadConfig} from '../src/config.js';
import {buildApp} from '../src/app.js';
let app,config;
const base='/v1/admin';
const owner='20000000-0000-4000-8000-000000000001',customer='20000000-0000-4000-8000-000000000002',yard='40000000-0000-4000-8000-000000000001';
const request=(method,url,payload,key=config.adminKey)=>app.inject({method,url,payload,headers:key?{authorization:`Bearer ${key}`}:{}});
function expect(response,status) { assert.equal(response.statusCode,status,response.body); return response.body?response.json():null; }
before(async()=>{config={...loadConfig(),rateMax:20000}; app=await buildApp(config,{logger:false});});
after(async()=>{await app?.close();});

test('all 122 source tables retain their DDL byte-for-byte',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../model/source-manifest.json',import.meta.url),'utf8'));
  for(const f of manifest.files) assert.equal(createHash('sha256').update(await readFile(new URL('../'+f.file,import.meta.url))).digest('hex'),f.sha256);
  assert.equal(app.resources.length,122);
});
test('health, Swagger UI and generated OpenAPI are available',async()=>{
  expect(await request('GET','/health/ready',undefined,null),200);
  const spec=expect(await request('GET','/openapi.json',undefined,null),200);
  assert.equal(spec.openapi,'3.0.3'); assert.ok(Object.keys(spec.paths).length>240);
  const docs=await request('GET','/docs/',undefined,null); assert.equal(docs.statusCode,200); assert.match(docs.headers['content-type'],/text\/html/);
});
test('every table has a functioning authenticated JSON list endpoint',async()=>{
  for(const r of app.resources) {
    const json=expect(await request('GET',r.path+'?limit=1'),200);
    assert.ok(Array.isArray(json.data),r.name); assert.equal(typeof json.page.total,'string',r.name);
    assert.ok(json.meta.requestId);
  }
});
test('missing and invalid API keys fail; reader cannot write',async()=>{
  expect(await request('GET',base+'/identity/accounts',undefined,null),401);
  expect(await request('GET',base+'/identity/accounts',undefined,'incorrect-key'),401);
  expect(await request('GET',base+'/identity/accounts',undefined,config.readKey),200);
  expect(await request('POST',base+'/catalogue/manufacturers',{name:'Forbidden'},config.readKey),403);
  expect(await request('POST','/v1/transactions',{operations:[]},config.readKey),403);
});
test('unknown properties, wrong types and spoofed audit fields are rejected',async()=>{
  expect(await request('POST',base+'/catalogue/manufacturers',{name:'Invalid',created_by:config.actorId}),422);
  expect(await request('POST',base+'/catalogue/manufacturers',{name:123}),422);
  expect(await request('POST',base+'/catalogue/manufacturers',{name:'Invalid',unexpected:true}),422);
  expect(await request('GET',base+'/catalogue/manufacturers?unknown=true'),422);
  expect(await request('GET',base+'/catalogue/manufacturers?limit=101'),422);
  expect(await request('GET',base+'/catalogue/manufacturers?limit=1&limit=2'),422);
});
test('create/read/patch/archive retains rows and records actor attribution',async()=>{
  const r=expect(await request('POST',base+'/catalogue/manufacturers',{name:'API test '+randomUUID()}),201);
  assert.equal(r.data.created_by,config.actorId);
  const url=base+'/catalogue/manufacturers/'+r.data.id;
  expect(await request('GET',url),200);
  expect(await request('PATCH',url,{}),422);
  const edited=expect(await request('PATCH',url,{name:'Updated API test '+randomUUID()}),200);
  assert.equal(edited.data.updated_by,config.actorId);
  expect(await request('DELETE',url),204); expect(await request('DELETE',url),204);
  const archived=expect(await request('GET',url),200); assert.ok(archived.data.archived_at);
  const query='?filter='+encodeURIComponent(JSON.stringify({id:r.data.id}));
  assert.equal(expect(await request('GET',base+'/catalogue/manufacturers'+query),200).data.length,0);
  assert.equal(expect(await request('GET',base+'/catalogue/manufacturers'+query+'&includeArchived=true'),200).data.length,1);
  expect(await request('PATCH',url,{name:'No'}),404);
  const audits=expect(await request('GET',base+'/audit/events?filter='+encodeURIComponent(JSON.stringify({object_table:'manufacturers'}))),200);
  assert.ok(audits.data.some(a=>a.request_id===r.meta.requestId));
});
test('foreign keys, uniqueness and cross-table model guards remain enforced',async()=>{
  expect(await request('POST',base+'/identity/memberships',{account_id:randomUUID(),profile_id:config.actorId,member_role:'owner'}),409);
  expect(await request('POST',base+'/catalogue/equipment-categories',{code:'excavator',name:'Duplicate '+randomUUID()}),409);
  expect(await request('POST',base+'/fleet/machines',{owner_account_id:customer,category_code:'excavator',identification_number:randomUUID(),yard_site_id:yard,lifetime_hours:'1'}),422);
});
test('composite primary keys work without hard-deleting relations',async()=>{
  const suffix=randomUUID(),role='test-role-'+suffix,cap='test-cap-'+suffix;
  expect(await request('POST','/v1/transactions',{operations:[
    {resource:'access_control.roles',method:'POST',body:{code:role,description:role}},
    {resource:'access_control.capabilities',method:'POST',body:{code:cap,description:'Test capability'}},
    {resource:'access_control.role_capabilities',method:'POST',body:{role_code:role,capability_code:cap}}
  ]}),200);
  const row=expect(await request('GET',base+'/access-control/role-capabilities/'+role+'/'+cap),200);
  assert.equal(row.data.role_code,role);
  expect(await request('DELETE',base+'/access-control/role-capabilities/'+role+'/'+cap),405);
});
test('append-only evidence rejects patch/delete and audit inserts are server-owned',async()=>{
  const id='51000000-0000-4000-8000-000000000001';
  expect(await request('PATCH',base+'/fleet/machine-rate-versions/'+id,{rate_minor:'0'}),405);
  expect(await request('DELETE',base+'/fleet/machine-rate-versions/'+id),405);
  expect(await request('POST',base+'/audit/events',{}),405);
  expect(await request('POST','/v1/transactions',{operations:[{resource:'fleet.machine_rate_versions',method:'PATCH',key:{id},body:{rate_minor:'0'}}]}),405);
});
test('filter, sorting and search never become SQL identifiers or executable expressions',async()=>{
  expect(await request('GET',base+'/catalogue/manufacturers?sort='+encodeURIComponent('name;drop table identity.accounts')),422);
  expect(await request('GET',base+'/catalogue/manufacturers?filter='+encodeURIComponent('{"name);drop table x;--":"value"}')),422);
  const data=expect(await request('GET',base+'/catalogue/manufacturers?q='+encodeURIComponent("' OR 1=1 --")),200);
  assert.equal(data.data.length,0);
  expect(await request('GET',base+'/identity/accounts?limit=1'),200);
});
test('batch failures roll back earlier writes and their audit records',async()=>{
  const id=randomUUID();
  expect(await request('POST','/v1/transactions',{operations:[
    {resource:'catalogue.manufacturers',method:'POST',body:{id,name:'Rolled back '+id}},
    {resource:'catalogue.models',method:'POST',body:{manufacturer_id:randomUUID(),category_code:'excavator',name:'Missing manufacturer'}}
  ]}),409);
  expect(await request('GET',base+'/catalogue/manufacturers/'+id),404);
  const audits=expect(await request('GET',base+'/audit/events?q='+id),200); assert.equal(audits.data.length,0);
});
function journalBatch(id,amount='10000',counter='-10000') {
  return {operations:[
    {resource:'finance.journals',method:'POST',body:{id,request_key:randomUUID(),adjustment_reason:'API test balanced adjustment'}},
    {resource:'finance.entries',method:'POST',body:{journal_id:id,ledger_account_id:'70000000-0000-4000-8000-000000000001',line_no:1,amount_minor:amount}},
    {resource:'finance.entries',method:'POST',body:{journal_id:id,ledger_account_id:'70000000-0000-4000-8000-000000000002',line_no:2,amount_minor:counter}}
  ]};
}
test('balanced journals commit atomically and exact bigint values survive JSON',async()=>{
  const id=randomUUID(),amount='9007199254740993';
  const json=expect(await request('POST','/v1/transactions',journalBatch(id,amount,'-'+amount)),200);
  assert.equal(json.data[1].data.amount_minor,amount);
  const rows=expect(await request('GET',base+'/finance/entries?filter='+encodeURIComponent(JSON.stringify({journal_id:id}))),200);
  assert.ok(rows.data.some(r=>r.amount_minor===amount));
  expect(await request('POST',base+'/finance/entries',{journal_id:id,ledger_account_id:'70000000-0000-4000-8000-000000000001',line_no:3,amount_minor:'1'}),422);
});
test('deferred unbalanced journal rejection rolls back rather than returning premature success',async()=>{
  const id=randomUUID(); expect(await request('POST','/v1/transactions',journalBatch(id,'100','-90')),422);
  expect(await request('GET',base+'/finance/journals/'+id),404);
});
test('concurrent booking confirmations cannot reserve the same machine window',async()=>{
  const machine=expect(await request('POST',base+'/fleet/machines',{owner_account_id:owner,category_code:'excavator',identification_number:'TEST-'+randomUUID(),yard_site_id:yard,lifetime_hours:'0'}),201).data;
  const start=new Date(Date.now()+86400000*10).toISOString(),end=new Date(Date.now()+86400000*10+3600000*8).toISOString();
  const bookings=[];
  for(let i=0;i<2;i++) bookings.push(expect(await request('POST',base+'/rentals/bookings',{customer_account_id:customer,supplier_account_id:owner,machine_id:machine.id,request_key:randomUUID(),starts_at:start,ends_at:end,mode:'machine_only'}),201).data);
  const outcomes=await Promise.all(bookings.map(b=>request('PATCH',base+'/rentals/bookings/'+b.id,{state:'confirmed'})));
  assert.deepEqual(outcomes.map(r=>r.statusCode).sort(),[200,409],outcomes.map(r=>r.body).join('\n'));
});
test('sensitive binary and token columns are omitted, including batch results',async()=>{
  const profile=randomUUID(),registration=randomUUID(),device=randomUUID(),push=randomUUID();
  const secret=Buffer.from('test-token-'+randomUUID()).toString('base64');
  const created=expect(await request('POST','/v1/transactions',{operations:[
    {resource:'identity.profiles',method:'POST',body:{id:profile,display_name:'API redaction test'}},
    {resource:'identity.app_registrations',method:'POST',body:{id:registration,profile_id:profile,app:'customer'}},
    {resource:'identity.device_bindings',method:'POST',body:{id:device,registration_id:registration,device_fingerprint:secret}},
    {resource:'messaging.push_devices',method:'POST',body:{id:push,device_binding_id:device,provider:'test',token_ciphertext:secret,token_hash:secret}}
  ]}),200);
  assert.ok(!JSON.stringify(created).includes(secret));
  const saved=expect(await request('GET',base+'/messaging/push-devices/'+push),200);
  assert.ok(!('token_ciphertext' in saved.data)); assert.ok(!('token_hash' in saved.data));
  expect(await request('GET',base+'/messaging/push-devices?filter='+encodeURIComponent(JSON.stringify({token_hash:secret}))),422);
  const registry=expect(await request('GET','/v1/resources'),200).data;
  const binary=registry.find(r=>r.name==='identity.phone_session_proofs');
  assert.ok(binary.columns.some(c=>c.hiddenInResponse));
  for(const r of app.resources.filter(r=>r.hidden.length)) {
    const rows=expect(await request('GET',r.path),200).data;
    for(const row of rows) for(const hidden of r.hidden) assert.ok(!(hidden in row));
  }
});
test('supplied financial view returns JSON and malformed IDs do not reach SQL',async()=>{
  expect(await request('GET',base+'/finance/booking-balances'),200);
  expect(await request('GET',base+'/fleet/machines/not-a-uuid'),422);
  expect(await request('GET','/v1/admin/public/arbitrary-table'),404);
});
