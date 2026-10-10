/**
 * EdgeOne Blob storage bridge for the authenticated CMS.
 *
 * Blob supports conditional onlyIfNew writes. We use a permanent one-time
 * claim marker to prevent replay, rather than an unsafe get+delete sequence.
 * Logical TTL is enforced by session-service (Blob has no documented key TTL).
 */
export function edgeOneAtomicAuthStore(blob){
 if(!blob || typeof blob.get!=="function" || typeof blob.setJSON!=="function" || typeof blob.delete!=="function"){
  throw new TypeError("EdgeOne Blob store with conditional writes required");
 }
 const strongGet=key=>blob.get(key,{type:"json",consistency:"strong"});
 const create=async(key,value)=>{
  try{
   await blob.setJSON(key,value,{onlyIfNew:true});
   return true;
  }catch(error){
   // Distinguish a genuine duplicate from an outage: never accept a failed write
   // unless the object is already present under strong consistency.
   const existing=await strongGet(key);
   if(existing !== null && existing !== undefined)return false;
   throw error;
  }
 };
 return {
  async get(key){return strongGet(key);},
  async delete(key){await blob.delete(key);},
  async putIfAbsent(key,value){return create(key,value);},
  async take(key){
   const value=await strongGet(key);
   if(value===null||value===undefined)return null;
   const claimed=await create(key+":consumed",{at:Date.now()});
   if(!claimed)return null;
   return value;
  },
 };
}
