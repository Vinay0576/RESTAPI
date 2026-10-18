import SwaggerParser from '@apidevtools/swagger-parser';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const spec=JSON.parse(await readFile(new URL('../docs/openapi.json',import.meta.url),'utf8'));
await SwaggerParser.validate(spec).catch(err=>{console.error(err.message.slice(0,2500));process.exit(1);});
const collection=JSON.parse(await readFile(new URL('../postman/equiprent.postman_collection.json',import.meta.url),'utf8'));
assert.equal(collection.info.schema,'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
let count=0;
function check(items) {
  for(const item of items) {
    if(item.item) check(item.item);
    else { assert.ok(item.request.url.startsWith('{{baseUrl}}/')); assert.ok(['GET','POST','PATCH','DELETE'].includes(item.request.method)); if(item.request.body) JSON.parse(item.request.body.raw); count++; }
  }
}
check(collection.item);
console.log(`OpenAPI validated; ${count} Postman requests passed structural checks.`);
