/**
 * EdgeOne Blob integration probe. Does not deploy anything.
 * Requires a dedicated NON-PRODUCTION store and explicit environment credentials.
 * Run: EDGEONE_PROJECT_ID=... EDGEONE_API_TOKEN=... EDGEONE_PROBE_STORE=firefly-live-poc pnpm exec tsx scripts/probe-edgeone-blob.ts
 */
import { getStore } from "@edgeone/pages-blob";
import { randomUUID } from "node:crypto";
import { createLiveContentService } from "../src/server/live-content/service.js";
const projectId=process.env.EDGEONE_PROJECT_ID?.trim();
const token=process.env.EDGEONE_API_TOKEN?.trim();
const name=process.env.EDGEONE_PROBE_STORE?.trim();
if (!projectId || !token || !name) throw new Error("Required: EDGEONE_PROJECT_ID, EDGEONE_API_TOKEN and EDGEONE_PROBE_STORE.");
if (!/^(?:firefly[-_]live[-_]poc|firefly[-_]content[-_]test|firefly[-_]blob[-_]preview)$/.test(name)) {
 throw new Error("Refusing to touch an unapproved store; use a dedicated firefly-live-poc/test/preview namespace.");
}
const store=getStore({name,projectId,token,consistency:"strong"});
const prefix="__firefly_probe__/"+randomUUID()+"/";
const first=prefix+"first.json";
const second=prefix+"second.json";
const clean=new Set<string>();
try {
 clean.add(first);
 await store.setJSON(first,{phase:1,sentinel:"firefly-isolated-probe"},{onlyIfNew:true});
 const read=await store.get(first,{type:"json",consistency:"strong"});
 if ((read as {phase?:number}|null)?.phase !== 1) throw new Error("Strong consistency read-after-write failed.");
 clean.add(second);
 await store.setJSON(second,{phase:2});
 const result=await store.list({prefix,consistency:"strong"});
 if (!result.blobs?.some((x:{key:string})=>x.key===first) || !result.blobs?.some((x:{key:string})=>x.key===second)) throw new Error("Prefix listing did not include both test objects.");
 await store.setJSON(first,{phase:3});
 const updated=await store.get(first,{type:"json",consistency:"strong"});
 if ((updated as {phase?:number}|null)?.phase!==3) throw new Error("Strong consistency update verification failed.");
 console.log("EDGEONE_BLOB_PROBE_PASS read/write/list/strong-consistency",JSON.stringify({name,objects:2}));

 // Exercise the REAL v3 service against the EdgeOne SDK, scoped to this run's
 // random prefix; even an unexpectedly broad list cannot expose production keys.
 const serviceStore={
  async getJSON(key:string){return store.get(prefix+"service/"+key,{type:"json",consistency:"strong"});},
  async setJSON(key:string,value:unknown){
   const scoped=prefix+"service/"+key;
   clean.add(scoped);
   await store.setJSON(scoped,value);
  },
  async listKeys(start:string){
   const response=await store.list({prefix:prefix+"service/"+start,consistency:"strong"});
   return response.blobs.map((item:{key:string})=>item.key.slice((prefix+"service/").length));
  },
  async deleteKey(key:string){await store.delete(prefix+"service/"+key);},
 };
 const service=createLiveContentService({
  store:serviceStore,provider:"edgeone-blob-test",storeName:name,
  region:()=> "edgeone-probe",
  authorize:async()=>({ok:true}),
 });
 const headers={Authorization:"Bearer isolated-test-token","Content-Type":"application/json"};
 const kind="post", id="edgeone-probe";
 const path="src/content/posts/edgeone-probe.md";
 const invoke=(url:string,init?:RequestInit)=>service(new Request("https://probe.invalid/api/live-content"+url,init));
 const put=async (newId:string,source:string,options:Record<string,unknown>={})=>{
  const response=await invoke("/item",{method:"PUT",headers,body:JSON.stringify({
   kind,id:newId,path:"src/content/posts/"+newId+".md",
   source,meta:{title:source,html:"<p>safe-test</p>",draft:false},
   baseGitSha:"",baseGitBranch:"ai/preview-test",...options,
  })});
  return {status:response.status,body:await response.json()};
 };
 const created=await put(id,"first");
 if(created.status!==200||!created.body.revision)throw new Error("v3 create failed: "+JSON.stringify(created));
 const firstRevision=created.body.revision;
 const publicItem=await invoke("/item?kind=post&id="+id);
 const firstBody=await publicItem.json();
 if(publicItem.status!==200||firstBody.meta?.title!=="first"||"source" in firstBody)throw new Error("v3 public item failed or leaked source");
 const index=await invoke("/index?kind=post");
 const publicIndex=await index.json();
 if(!publicIndex.entries?.some((e:{id:string})=>e.id===id))throw new Error("v3 index missing new item");
 const stale=await put(id,"stale",{expectedRevision:"outdated"});
 if(stale.status!==409)throw new Error("v3 stale update was not rejected");
 const updatedRevisionResponse=await put(id,"second",{expectedRevision:firstRevision});
 if(updatedRevisionResponse.status!==200||updatedRevisionResponse.body.revision===firstRevision)throw new Error("v3 revision update failed");
 const currentRevision=updatedRevisionResponse.body.revision;
 const renamed=await put("edgeone-probe-renamed","renamed",{
  previousId:id,previousPath:path,expectedRevision:currentRevision,
 });
 if(renamed.status!==200)throw new Error("v3 rename failed: "+JSON.stringify(renamed));
 const oldResponse=await invoke("/item?kind=post&id="+id);
 if(oldResponse.status!==410)throw new Error("v3 old path remains visible after rename");
 const newResponse=await invoke("/item?kind=post&id=edgeone-probe-renamed");
 if(newResponse.status!==200)throw new Error("v3 renamed item missing");
 const deletion=await invoke("/item?kind=post&id=edgeone-probe-renamed",{
  method:"DELETE",headers,body:JSON.stringify({
   path:"src/content/posts/edgeone-probe-renamed.md",expectedRevision:renamed.body.revision,
  }),
 });
 if(deletion.status!==200)throw new Error("v3 delete failed");
 const deleted=await invoke("/item?kind=post&id=edgeone-probe-renamed");
 if(deleted.status!==410)throw new Error("v3 tombstone not visible");
 console.log("EDGEONE_LIVE_V3_PASS create/index/public-safety/409/update/rename/tombstone",JSON.stringify({name}));

 const draft=await put("edgeone-probe-draft","hidden",{
  meta:{title:"Hidden draft",html:"<p>private</p>",draft:true},
 });
 if(draft.status!==200)throw new Error("v3 draft create failed");
 const draftPublic=await invoke("/item?kind=post&id=edgeone-probe-draft");
 if(draftPublic.status!==410)throw new Error("v3 draft content was public");
 const draftsIndex=await (await invoke("/index?kind=post")).json();
 if(draftsIndex.entries?.some((e:{id:string})=>e.id==="edgeone-probe-draft"))throw new Error("v3 draft leaked in public index");
 const dynamicResponse=await invoke("/item",{
  method:"PUT",headers,body:JSON.stringify({
   kind:"dynamic",id:"edgeone-probe-dynamic",path:"src/content/dynamic/edgeone-probe-dynamic.md",
   source:"dynamic source",meta:{published:"2026-10-10 00:00:00",html:"<p>dynamic</p>",images:[]},
  }),
 });
 if(dynamicResponse.status!==200)throw new Error("v3 dynamic create failed");
 const dynamicIndex=await (await invoke("/index?kind=dynamic")).json();
 if(!dynamicIndex.entries?.some((e:{id:string})=>e.id==="edgeone-probe-dynamic"))throw new Error("v3 dynamic absent");
 const staleDeletion=await invoke("/item?kind=post&id=edgeone-probe-draft",{
  method:"DELETE",headers,body:JSON.stringify({path:"src/content/posts/edgeone-probe-draft.md",expectedRevision:"outdated"}),
 });
 if(staleDeletion.status!==409)throw new Error("v3 stale delete not rejected");
 console.log("EDGEONE_LIVE_PRIVACY_PASS draft/index/dynamic/stale-delete",JSON.stringify({name}));

 // Same-instance race: two requests share a revision; exactly one may commit.
 const concurrencyBase=await put("edgeone-race","base");
 if(concurrencyBase.status!==200)throw new Error("v3 race setup failed");
 const baseRevision=concurrencyBase.body.revision;
 const [raceA,raceB]=await Promise.all([
  put("edgeone-race","race-a",{expectedRevision:baseRevision}),
  put("edgeone-race","race-b",{expectedRevision:baseRevision}),
 ]);
 if([raceA.status,raceB.status].sort().join(",")!=="200,409")throw new Error("v3 same-instance race was not serialized");
 const raced=await invoke("/item?kind=post&id=edgeone-race");
 const racedItem=await raced.json();
 if(!["race-a","race-b"].includes(racedItem.meta?.title))throw new Error("v3 raced content wrong");
 console.log("EDGEONE_LIVE_CONCURRENCY_PASS same-instance revision contention",JSON.stringify({name}));



} finally {
 let cleanupError:unknown=null;
 for (const key of clean) {
  try {await store.delete(key); if(await store.get(key,{type:"json",consistency:"strong"})!==null) throw new Error("Deletion verification failed.");}
  catch(e){cleanupError=e;console.error("EDGEONE_PROBE_CLEANUP_FAILED",key,e);}
 }
 if(!cleanupError){
  try{
   const remaining=await store.list({prefix,consistency:"strong"});
   if(remaining.blobs?.length)throw new Error(`Probe left ${remaining.blobs.length} Blob object(s) behind`);
   console.log("EDGEONE_PROBE_CLEANUP_PASS",JSON.stringify({name,removed:clean.size}));
  }catch(e){cleanupError=e;}
 }
 if(cleanupError) throw cleanupError;
}
