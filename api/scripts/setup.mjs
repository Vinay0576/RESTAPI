import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
const secret = () => randomBytes(32).toString('hex');
const password=secret(), apiPassword=secret(), admin=secret(), read=secret();
const content=`POSTGRES_DB=equiprent_model
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${password}
API_DB_PASSWORD=${apiPassword}
API_ADMIN_KEY=${admin}
API_READ_KEY=${read}
API_PORT=3100
PG_PORT=55440
PGHOST=127.0.0.1
PGPORT=55440
PGDATABASE=equiprent_model
PGUSER=equiprent_api
PGPASSWORD=${apiPassword}
HOST=127.0.0.1
PORT=3100
LOG_LEVEL=info
DB_POOL_MAX=10
`;
try {
  await writeFile(new URL('../.env',import.meta.url),content,{flag:'wx',mode:0o600});
} catch (err) {
  if (err.code==='EEXIST') { console.log('.env already exists; credentials preserved. Use npm run export to refresh Postman files.'); process.exit(0); }
  throw err;
}
await mkdir(new URL('../postman/',import.meta.url),{recursive:true});
await writeFile(new URL('../postman/local.postman_environment.json',import.meta.url),JSON.stringify({
  name:'EquipRent local (private credentials)',_postman_variable_scope:'environment',
  values:[{key:'baseUrl',value:'http://localhost:3100',enabled:true},
    {key:'apiKey',value:admin,type:'secret',enabled:true},{key:'readKey',value:read,type:'secret',enabled:true}]
},null,2)+'\n',{mode:0o600});
console.log('Created .env and private Postman environment with random local credentials. Values were not printed.');
