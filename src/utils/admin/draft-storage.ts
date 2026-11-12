/** Private admin-only tab draft. Never store tokens or secrets in this record. */
const PREFIX="firefly:admin-draft:v1:";
type DraftStorage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void};
export function draftKey(kind:string,login:string){
 if(!["post","dynamic"].includes(kind)||!(/^[A-Za-z0-9-]{1,64}$/.test(String(login))))throw new Error("Invalid draft owner or kind");
 return PREFIX+login.toLowerCase()+":"+kind;
}
export function readDraft(storage:DraftStorage,kind:string,login:string,{now=Date.now(),ttlMs=7*24*60*60*1000}={}){
 const key=draftKey(kind,login);
 try{
  const raw=storage.getItem(key);
  if(!raw)return null;
  const draft=JSON.parse(raw);
  if(!draft || draft.kind!==kind || draft.login.toLowerCase()!==login.toLowerCase() ||
   typeof draft.snapshot!=="string" || !Number.isFinite(draft.updatedAt) ||
   draft.updatedAt>now || now-draft.updatedAt>ttlMs){
   storage.removeItem(key);return null;
  }
  return draft;
 }catch{return null;}
}
export function writeDraft(storage:DraftStorage,kind:string,login:string,snapshot:string,{now=Date.now()}={}){
 if(typeof snapshot!=="string"||snapshot.length>1_000_000)throw new Error("Draft exceeds 1MB");
 const key=draftKey(kind,login);
 storage.setItem(key,JSON.stringify({kind,login,snapshot,updatedAt:now}));
}
export function clearDraft(storage:DraftStorage,kind:string,login:string){
 storage.removeItem(draftKey(kind,login));
}
