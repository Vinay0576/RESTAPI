import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const client=new pg.Client({host:process.env.PGHOST||'127.0.0.1',port:Number(process.env.PGPORT||55440),
  database:process.env.POSTGRES_DB||'equiprent_model',user:process.env.POSTGRES_USER||'postgres',password:process.env.POSTGRES_PASSWORD});
await client.connect();
try {
  await client.query('select pg_advisory_lock(871923410)');
  await client.query('create schema if not exists api_admin; create table if not exists api_admin.migrations(name text primary key, sha256 text not null, applied_at timestamptz not null default now())');
  const dir=new URL('../db/migrations/',import.meta.url);
  for (const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) {
    const raw=await readFile(new URL(file,dir),'utf8'), hash=createHash('sha256').update(raw).digest('hex');
    const old=await client.query('select sha256 from api_admin.migrations where name=$1',[file]);
    if (old.rowCount) { if(old.rows[0].sha256!==hash) throw new Error(`Applied migration changed: ${file}`); continue; }
    // Source migrations are wrapped in BEGIN/COMMIT. Record checksum in the same transaction.
    const sql=raw.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
    await client.query('begin');
    try { await client.query(sql); await client.query('insert into api_admin.migrations(name,sha256) values($1,$2)',[file,hash]); await client.query('commit'); }
    catch(err) { await client.query('rollback'); throw err; }
    console.log(`Applied ${file}`);
  }
  if (!process.env.API_DB_PASSWORD || process.env.API_DB_PASSWORD.length<32) throw new Error('API_DB_PASSWORD must be at least 32 characters.');
  const {rows}=await client.query("select format('alter role equiprent_api password %L', $1::text) as command",[process.env.API_DB_PASSWORD]);
  await client.query(rows[0].command);
  console.log('Migrations complete; runtime role password configured.');
} finally { await client.end(); }
