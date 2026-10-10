export class ContentLockBusyError extends Error{
 constructor(key){
  super("内容正在其他实例保存，请稍后重试："+key);
  this.name="ContentLockBusyError";
  this.code="CONTENT_LOCK_BUSY";
 }
}
/**
 * Distributed fail-closed mutation lock with atomic create-if-absent.
 * Lock expiration is informational ONLY: an expired lock is never auto-stolen
 * because Blob does not expose compare-and-delete. Manual incident recovery
 * must first quiesce writers, then remove stale locks explicitly.
 */
export function createDistributedContentLock(blob,{prefix="cms-mutation-locks/v1/",now=()=>Date.now()}={}){
 if(typeof blob?.setJSON!=="function"||typeof blob?.get!=="function"||typeof blob?.delete!=="function"){
  throw new TypeError("Strong Blob and conditional writes are required");
 }
 async function acquireKey(key){
  const lockKey=prefix+key;
  const nonce=crypto.randomUUID();
  try{
   await blob.setJSON(lockKey,{nonce,createdAt:new Date(now()).toISOString()},{onlyIfNew:true});
  }catch(error){
   const current=await blob.get(lockKey,{type:"json",consistency:"strong"});
   if(current)throw new ContentLockBusyError(key);
   throw error;
  }
  return async()=>{
   // Never silently overwrite another lock. No other healthy writer can
   // claim this key while ours exists; manual unlock must quiesce writers.
   const current=await blob.get(lockKey,{type:"json",consistency:"strong"});
   if(current?.nonce!==nonce)throw new Error("Distributed lock ownership lost");
   await blob.delete(lockKey);
  };
 }
 return {
  async acquire(keys){
   const releases=[];
   const ordered=[...new Set(keys)].sort();
   try{
    for(const key of ordered)releases.push(await acquireKey(key));
   }catch(error){
    for(const release of releases.reverse())await release();
    throw error;
   }
   return async()=>{
    for(const release of releases.reverse())await release();
   };
  },
 };
}
