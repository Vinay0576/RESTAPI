import pg from 'pg';
import {ApiError} from './errors.js';
export function createDatabase(config) {
  const pool=new pg.Pool(config.db);
  // Avoid unhandled idle-client errors; request-level failures receive sanitized responses.
  pool.on('error',()=>{});
  async function transaction(callback,{readOnly=false,repeatableRead=false}={}) {
    const client=await pool.connect();
    try {
      await client.query('begin'+(repeatableRead?' isolation level repeatable read':'')+(readOnly?' read only':''));
      await client.query('set local role service_role');
      await client.query("select set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','10000',true),set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:config.authUserId})]);
      const principal=await client.query('select id from identity.profiles where id=$1 and auth_user_id=$2 and deactivated_at is null',[config.actorId,config.authUserId]);
      if(!principal.rowCount) throw new ApiError(503,'API_ACTOR_UNAVAILABLE','Local API audit actor is unavailable.');
      const result=await callback(client);
      await client.query('commit'); // deferred ledger checks must succeed BEFORE responding
      return result;
    } catch(err) { await client.query('rollback').catch(()=>{}); throw err; }
    finally { client.release(); }
  }
  return {pool,transaction,close:()=>pool.end()};
}
