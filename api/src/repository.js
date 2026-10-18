import {quote,validate} from './model.js';
import {ApiError} from './errors.js';
function rowToJson(resource,row) {
  return Object.fromEntries(Object.entries(row).filter(([key])=>!resource.hidden.includes(key)).map(([key,value])=>
    [key,value instanceof Date?(resource.columns.find(c=>c.name===key)?.type==='date'?value.toISOString().slice(0,10):value.toISOString()):value]));
}
function keyWhere(r,key,offset=0) {
  validate(r.validators.key,key);
  return {sql:r.pk.map((name,i)=>`${quote(name)}=$${offset+i+1}`).join(' and '),values:r.pk.map(name=>key[name])};
}
function inputValues(r,body) { return Object.entries(body).map(([key,value])=>r.columns.find(c=>c.name===key).type==='bytea'&&value!==null?Buffer.from(value,'base64'):value); }
function listQuery(r,query) {
  const limit=Number(query.limit??25),offset=Number(query.offset??0),where=[],values=[];
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)
    throw new ApiError(422,'INVALID_PAGE','limit must be 1..100 and offset 0..100000.');
  let filter={};
  if(query.filter) {
    try { filter=JSON.parse(query.filter); } catch { throw new ApiError(422,'INVALID_FILTER','filter must be a JSON object.'); }
    if(!filter||Array.isArray(filter)||typeof filter!=='object') throw new ApiError(422,'INVALID_FILTER','filter must be a JSON object.');
  }
  if(Object.keys(filter).length>20) throw new ApiError(422,'INVALID_FILTER','At most 20 equality filters are supported.');
  for(const [name,value] of Object.entries(filter)) {
    const col=r.columns.find(c=>c.name===name);
    if(!col||r.hidden.includes(name)||['jsonb','json','tstzrange'].includes(col.type)||col.type.startsWith('_'))
      throw new ApiError(422,'INVALID_FILTER',`Unsupported filter field: ${name}`);
    validate(r.columnValidators[name],value);
    if(value===null) where.push(`${quote(name)} is null`);
    else { values.push(value); where.push(`${quote(name)}=$${values.length}`); }
  }
  if(r.mode==='archive'&&query.includeArchived!=='true') where.push('archived_at is null');
  if(query.q) {
    const fields=r.columns.filter(c=>c.type==='text'&&!r.hidden.includes(c.name));
    if(!fields.length) throw new ApiError(422,'SEARCH_UNSUPPORTED','This resource has no searchable text columns.');
    values.push('%'+query.q.replace(/[\\%_]/g,'\\$&')+'%');
    where.push('('+fields.map(c=>`${quote(c.name)} ilike $${values.length}`).join(' or ')+')');
  }
  const parts=query.sort?query.sort.split(','):[];
  if(parts.length>3) throw new ApiError(422,'INVALID_SORT','At most three sort fields are supported.');
  const ordering=[],seen=new Set();
  for(const part of parts) {
    const name=part.startsWith('-')?part.slice(1):part;
    const col=r.columns.find(c=>c.name===name);
    if(!col||r.hidden.includes(name)||['json','jsonb','bytea'].includes(col.type)||seen.has(name)) throw new ApiError(422,'INVALID_SORT','Unknown, repeated or unsupported sort field.');
    ordering.push(`${quote(name)} ${part.startsWith('-')?'desc':'asc'} nulls last`); seen.add(name);
  }
  for(const key of r.pk) if(!seen.has(key)) ordering.push(`${quote(key)} asc`);
  return {limit,offset,values,where:where.length?' where '+where.join(' and '):'',order:ordering.join(',')};
}
export const repository={
  async list(c,r,query) {
    const q=listQuery(r,query);
    // Count and page share the repeatable-read transaction opened by the service.
    const countArgs=[...q.values];
    // Normal pg rows preserve int8/numeric strings; jsonb_agg would lose precision on JSON.parse.
    const count=await c.query(`select count(*)::text as total from ${r.sqlName}${q.where}`,countArgs);
    const rows=await c.query(`select * from ${r.sqlName}${q.where} order by ${q.order} limit $${q.values.length+1} offset $${q.values.length+2}`,[...q.values,q.limit,q.offset]);
    return {data:rows.rows.map(row=>rowToJson(r,row)),page:{limit:q.limit,offset:q.offset,total:count.rows[0].total,
      hasMore:BigInt(q.offset+rows.rowCount)<BigInt(count.rows[0].total)}};
  },
  async get(c,r,key) {
    const w=keyWhere(r,key), result=await c.query(`select * from ${r.sqlName} where ${w.sql}`,w.values);
    if(!result.rowCount) throw new ApiError(404,'NOT_FOUND','Record not found.');
    return rowToJson(r,result.rows[0]);
  },
  async create(c,r,body) {
    validate(r.validators.create,body);
    const keys=Object.keys(body), values=inputValues(r,body);
    const sql=keys.length?`insert into ${r.sqlName} (${keys.map(quote).join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`:`insert into ${r.sqlName} default values returning *`;
    const result=await c.query(sql,values); return rowToJson(r,result.rows[0]);
  },
  async patch(c,r,key,body) {
    validate(r.validators.patch,body);
    const keys=Object.keys(body),w=keyWhere(r,key,keys.length);
    const result=await c.query(`update ${r.sqlName} set ${keys.map((name,i)=>`${quote(name)}=$${i+1}`).join(',')} where ${w.sql}${r.mode==='archive'?' and archived_at is null':''} returning *`,[...inputValues(r,body),...w.values]);
    if(!result.rowCount) throw new ApiError(404,'NOT_FOUND','Record not found or already archived.');
    return rowToJson(r,result.rows[0]);
  },
  async archive(c,r,key,actor) {
    const w=keyWhere(r,key,1);
    const result=await c.query(`update ${r.sqlName} set archived_at=clock_timestamp(),archived_by=$1 where ${w.sql} and archived_at is null returning *`,[actor,...w.values]);
    return result.rowCount?rowToJson(r,result.rows[0]):null;
  },
  async audit(c,r,method,row,requestId,changedFields) {
    if(!row) return;
    const key=Object.fromEntries(r.pk.map(k=>[k,row[k]]));
    await c.query('insert into audit.events(event_type,object_schema,object_table,object_key,request_id,changes) values($1,$2,$3,$4,$5,$6)',
      ['api.'+method.toLowerCase(),...r.name.split('.'),JSON.stringify(key),requestId,JSON.stringify({fields:changedFields})]);
  }
};
