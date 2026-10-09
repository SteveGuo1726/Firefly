/**
 * EdgeOne Blob integration probe. Does not deploy anything.
 * Requires a dedicated NON-PRODUCTION store and explicit environment credentials.
 * Run: EDGEONE_PROJECT_ID=... EDGEONE_API_TOKEN=... EDGEONE_PROBE_STORE=firefly-live-poc pnpm exec tsx scripts/probe-edgeone-blob.ts
 */
import { getStore } from "@edgeone/pages-blob";
import { randomUUID } from "node:crypto";
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
 await store.setJSON(first,{phase:1,sentinel:"firefly-isolated-probe"},{onlyIfNew:true});
 clean.add(first);
 const read=await store.get(first,{type:"json",consistency:"strong"});
 if ((read as {phase?:number}|null)?.phase !== 1) throw new Error("Strong consistency read-after-write failed.");
 await store.setJSON(second,{phase:2});
 clean.add(second);
 const result=await store.list({prefix,consistency:"strong"});
 if (!result.blobs?.some((x:{key:string})=>x.key===first) || !result.blobs?.some((x:{key:string})=>x.key===second)) throw new Error("Prefix listing did not include both test objects.");
 await store.setJSON(first,{phase:3});
 const updated=await store.get(first,{type:"json",consistency:"strong"});
 if ((updated as {phase?:number}|null)?.phase!==3) throw new Error("Strong consistency update verification failed.");
 console.log("EDGEONE_BLOB_PROBE_PASS read/write/list/strong-consistency",JSON.stringify({name,objects:2}));
} finally {
 let cleanupError:unknown=null;
 for (const key of clean) {
  try {await store.delete(key); if(await store.get(key,{type:"json",consistency:"strong"})!==null) throw new Error("Deletion verification failed.");}
  catch(e){cleanupError=e;console.error("EDGEONE_PROBE_CLEANUP_FAILED",key,e);}
 }
 if(cleanupError) throw cleanupError;
}
