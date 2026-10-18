import {repository} from './repository.js';
import {ApiError} from './errors.js';
export function createService(db,config,resources) {
  const byName=new Map(resources.map(r=>[r.name,r]));
  async function mutate(c,r,method,key,body,requestId) {
    if(r.readOnly||(method==='PATCH'&&r.mode==='append')||(method==='DELETE'&&r.mode!=='archive'))
      throw new ApiError(405,'OPERATION_NOT_ALLOWED','This operation is not permitted by the resource retention policy.');
    let row;
    if(method==='POST') row=await repository.create(c,r,body);
    else if(method==='PATCH') row=await repository.patch(c,r,key,body);
    else if(method==='DELETE') row=await repository.archive(c,r,key,config.actorId);
    else throw new ApiError(422,'INVALID_OPERATION','Only POST, PATCH and DELETE batch operations are supported.');
    await repository.audit(c,r,method,row,requestId,Object.keys(body||{}));
    return row;
  }
  return {
    list:(r,q)=>db.transaction(c=>repository.list(c,r,q),{readOnly:true,repeatableRead:true}),
    get:(r,key)=>db.transaction(c=>repository.get(c,r,key),{readOnly:true}),
    write:(r,method,key,body,requestId)=>db.transaction(c=>mutate(c,r,method,key,body,requestId)),
    batch:async(operations,requestId)=>db.transaction(async c=>{
      const results=[];
      for(let i=0;i<operations.length;i++) {
        const op=operations[i],r=byName.get(op.resource);
        if(!r) throw new ApiError(422,'UNKNOWN_RESOURCE','Unknown resource.',{index:i});
        if(op.method==='POST'&&(op.key!==undefined||op.body===undefined) || op.method==='PATCH'&&(op.key===undefined||op.body===undefined) || op.method==='DELETE'&&(op.key===undefined||op.body!==undefined))
          throw new ApiError(422,'INVALID_OPERATION','POST requires body only; PATCH requires key and body; DELETE requires key only.',{index:i});
        try { const data=await mutate(c,r,op.method,op.key,op.body,requestId); results.push({index:i,resource:r.name,status:op.method==='POST'?201:op.method==='DELETE'?204:200,data}); }
        catch(err) { err.batchIndex=i; throw err; }
      }
      return results;
    })
  };
}
