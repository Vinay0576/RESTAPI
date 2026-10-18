import {readFile} from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {ApiError} from './errors.js';
export const quote=name=>'"'+name.replaceAll('"','""')+'"';
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
const controlled=new Set(['created_at','created_by','updated_at','updated_by','archived_at','archived_by','created_txid']);
export function columnSchema(column,{output=false}={}) {
  const t=column.type;
  let s;
  if(t==='uuid') s={type:'string',format:'uuid'};
  else if(t==='bool') s={type:'boolean'};
  else if(['int2','int4'].includes(t)) s={type:'integer',minimum:t==='int2'?-32768:-2147483648,maximum:t==='int2'?32767:2147483647};
  else if(['int8','xid8'].includes(t)) s={type:'string',pattern:'^-?[0-9]+$',maxLength:20,description:'Exact integer encoded as a JSON string to avoid precision loss.'};
  else if(t==='numeric') s={type:'string',pattern:'^-?[0-9]+(?:\\.[0-9]+)?$',maxLength:100,description:'Exact decimal encoded as a JSON string.'};
  else if(['float4','float8'].includes(t)) s={type:'number'};
  else if(['timestamptz','timestamp'].includes(t)) s={type:'string',format:'date-time'};
  else if(t==='date') s={type:'string',format:'date'};
  else if(t==='bytea') s={type:'string',pattern:'^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',maxLength:65536,description:'Base64 input; omitted from responses.'};
  else if(['json','jsonb'].includes(t)) s={type:'object',additionalProperties:true,description:'JSON object; database constraints remain authoritative.'};
  else if(t.startsWith('_')) s={type:'array',items:{type:'string'},maxItems:1000};
  else s={type:'string',maxLength:10000};
  if(column.nullable) s={...s,nullable:true};
  return s;
}
export async function loadResources(db) {
  const model=JSON.parse(await readFile(new URL('../model/model.json',import.meta.url),'utf8'));
  const names=model.tables.map(t=>t.name);
  const metadata=await db.transaction(async c=>{
    const columns=await c.query(`select n.nspname||'.'||cl.relname as resource,a.attname as name,t.typname as type,
      pg_catalog.format_type(a.atttypid,a.atttypmod) as sql_type,not a.attnotnull as nullable,
      pg_get_expr(d.adbin,d.adrelid) as default_value,a.attidentity as identity,a.attgenerated as generated
      from pg_attribute a join pg_class cl on cl.oid=a.attrelid join pg_namespace n on n.oid=cl.relnamespace
      join pg_type t on t.oid=a.atttypid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname||'.'||cl.relname=any($1) and a.attnum>0 and not a.attisdropped order by a.attnum`,[names]);
    const constraints=await c.query(`select n.nspname||'.'||cl.relname as resource,co.conname as name,co.contype as type,
      pg_get_constraintdef(co.oid) as definition,
      array(select a.attname::text from unnest(co.conkey) with ordinality as k(num,ord)
        join pg_attribute a on a.attrelid=co.conrelid and a.attnum=k.num order by k.ord) as columns
      from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace
      where n.nspname||'.'||cl.relname=any($1)`,[names]);
    return {columns:columns.rows,constraints:constraints.rows};
  },{readOnly:true});
  const ajv=new Ajv({allErrors:true,coerceTypes:false,removeAdditional:false,useDefaults:false}); addFormats(ajv);
  const resources=model.tables.map(table=>{
    const columns=metadata.columns.filter(c=>c.resource===table.name);
    const constraints=metadata.constraints.filter(c=>c.resource===table.name);
    const pk=constraints.find(c=>c.type==='p')?.columns;
    if(!columns.length||!pk?.length) throw new Error(`Incomplete deployed model: ${table.name}`);
    const [domain,name]=table.name.split('.');
    const path=`/v1/admin/${domain.replaceAll('_','-')}/${name.replaceAll('_','-')}`;
    const writable=columns.filter(c=>!controlled.has(c.name)&&!c.identity&&!c.generated);
    const createSchema=object(Object.fromEntries(writable.map(c=>[c.name,columnSchema(c)])),writable.filter(c=>!c.nullable&&!c.default_value).map(c=>c.name));
    const patchSchema={...object(Object.fromEntries(writable.filter(c=>!pk.includes(c.name)).map(c=>[c.name,columnSchema(c)]))),minProperties:1};
    const hidden=columns.filter(c=>c.type==='bytea'||/token|secret|fingerprint/i.test(c.name)).map(c=>c.name);
    const responseSchema=object(Object.fromEntries(columns.filter(c=>!hidden.includes(c.name)).map(c=>[c.name,columnSchema(c,{output:true})])));
    const keySchema=object(Object.fromEntries(pk.map(k=>[k,columnSchema(columns.find(c=>c.name===k))])),pk);
    const validators={create:ajv.compile(createSchema),patch:ajv.compile(patchSchema),key:ajv.compile(keySchema)};
    const columnValidators=Object.fromEntries(columns.map(c=>[c.name,ajv.compile(columnSchema(c))]));
    return {...table,domain,path,itemPath:path+pk.map(k=>`/:${k}`).join(''),pk,columns,constraints,hidden,
      createSchema,patchSchema,responseSchema,keySchema,validators,columnValidators,
      sqlName:[domain,name].map(quote).join('.'),readOnly:table.name==='audit.events'};
  });
  if(resources.length!==122) throw new Error('Expected all 122 model tables.');
  return resources;
}
export function validate(validator,value) {
  if(!validator(value)) throw new ApiError(422,'VALIDATION_FAILED','Request failed validation.',validator.errors.map(e=>({path:e.instancePath,keyword:e.keyword,message:e.message})));
}
export function describeResource(r) {
  return {name:r.name,purpose:r.purpose,retention:r.mode,sourceAccess:r.access,path:r.path,
    itemPath:r.itemPath.replace(/:([a-z_]+)/g,'{$1}'),primaryKey:r.pk,
    operations:r.readOnly?['GET']:['GET','POST',...(r.mode==='append'?[]:['PATCH']),...(r.mode==='archive'?['DELETE (archives only)']:[])],
    columns:r.columns.map(c=>({...c,serverManaged:controlled.has(c.name)||!!c.identity||!!c.generated,hiddenInResponse:r.hidden.includes(c.name)})),
    constraints:r.constraints,createSchema:r.readOnly?null:r.createSchema,patchSchema:r.mode==='append'?null:r.patchSchema};
}
