export function loadConfig(env=process.env) {
  const int=(name,fallback,min,max)=>{
    const n=Number(env[name]??fallback);
    if(!Number.isInteger(n)||n<min||n>max) throw new Error(`Invalid ${name}`);
    return n;
  };
  const adminKey=env.API_ADMIN_KEY, readKey=env.API_READ_KEY;
  if(!adminKey||adminKey.length<32||!readKey||readKey.length<32||adminKey===readKey)
    throw new Error('Distinct API_ADMIN_KEY and API_READ_KEY of at least 32 characters required. Run npm run setup.');
  return {adminKey,readKey,host:env.HOST||'127.0.0.1',port:int('PORT',3100,1,65535),
    logLevel:env.LOG_LEVEL||'info',rateMax:int('RATE_LIMIT_MAX',600,1,100000),
    authUserId:'90000000-0000-4000-8000-000000000001', actorId:'10000000-0000-4000-8000-000000000001',
    db:{host:env.PGHOST||'127.0.0.1',port:int('PGPORT',55440,1,65535),
        database:env.PGDATABASE||'equiprent_model',user:env.PGUSER||'equiprent_api',password:env.PGPASSWORD,
        max:int('DB_POOL_MAX',10,1,50),connectionTimeoutMillis:5000,idleTimeoutMillis:30000,
        application_name:'equiprent-model-api'}};
}
