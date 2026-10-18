import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const collection=JSON.parse(await readFile(new URL('../postman/equiprent.postman_collection.json',import.meta.url),'utf8'));
const env=JSON.parse(await readFile(new URL('../postman/local.postman_environment.json',import.meta.url),'utf8'));
const variables=Object.fromEntries(env.values.map(v=>[v.key,v.value]));
const render=s=>s.replace(/\{\{([^}]+)\}\}/g,(_,key)=>key==='$guid'?randomUUID():variables[key]??(()=>{throw new Error('Missing variable '+key);})());
const results=[];
for(const item of collection.item[0].item) {
  if(item.name.includes('Atomic balanced journal')) variables.journalId=randomUUID();
  const req=item.request,body=req.body?render(req.body.raw):undefined;
  const response=await fetch(render(req.url),{method:req.method,headers:{authorization:'Bearer '+variables.apiKey,...(body?{'content-type':'application/json'}:{})},body,signal:AbortSignal.timeout(10000)});
  const text=await response.text(),json=text?JSON.parse(text):null;
  const expected=Number(item.event.find(e=>e.listen==='test').script.exec[0].match(/HTTP (\d+)/)[1]);
  if(response.status!==expected) throw new Error(`${item.name}: expected ${expected}, got ${response.status}; ${JSON.stringify(json?.error)}`);
  if(item.name.includes('Create manufacturer')) variables.demoManufacturerId=json.data.id;
  if(item.name.includes('retained archived')&&!json.data.archived_at) throw new Error('Archive flag missing');
  results.push({request:item.name,status:response.status});
  console.log(`${response.status} ${item.name}`);
}
await writeFile(new URL('../docs/http-verification.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),
  scope:'Exported Postman Quickstart requests executed over HTTP; Postman application not automated.',results},null,2)+'\n');
console.log(`Passed ${results.length} HTTP quickstart requests.`);
