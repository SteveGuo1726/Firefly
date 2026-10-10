import type { GitHubAdminSession } from "@/utils/admin/github-session";

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(value: string): string {
	const binary=atob(value.replace(/\n/g,""));
	const bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

// Per-login-session, in-memory cache only: no token or draft is written to
// disk/localStorage. Short expiry avoids using stale Git baselines indefinitely.
type CachedSource = {value:{source:string;sha:string};expiresAt:number};
type GitContentCache = {ready:Map<string,CachedSource>;running:Map<string,Promise<{source:string;sha:string}>>};
const contentBySession=new WeakMap<GitHubAdminSession,GitContentCache>();
const MAX_CACHED_FILES=8;
const CACHE_MS=45_000;
function cacheFor(session:GitHubAdminSession):GitContentCache{
 let value=contentBySession.get(session);
 if(!value){value={ready:new Map(),running:new Map()};contentBySession.set(session,value);}
 return value;
}
function validContentPath(path:string):boolean{
 return /^src\/content\/(?:posts|dynamic)\/[a-zA-Z0-9][a-zA-Z0-9_.\/-]*\.mdx?$/.test(path)
  && !path.includes("..") && !path.includes("\\");
}
export function invalidateGitContentCache(session:GitHubAdminSession,path?:string):void{
 const cache=contentBySession.get(session);
 if(!cache)return;
 if(path)cache.ready.delete(path);
 else cache.ready.clear();
}

export async function fetchGitContentSource(
 session:GitHubAdminSession,
 path:string,
):Promise<{source:string;sha:string}>{
 if(!validContentPath(path))throw new Error("拒绝读取不安全的 GitHub 内容路径。");
 const scoped=cacheFor(session);
 const cached=scoped.ready.get(path);
 if(cached && cached.expiresAt>Date.now()){
  scoped.ready.delete(path);scoped.ready.set(path,cached);
  return cached.value;
 }
 scoped.ready.delete(path);
 const inProgress=scoped.running.get(path);
 if(inProgress)return inProgress;
 const promise=(async()=>{
  // Cloudflare staging can read from the same origin, avoiding direct
  // browser-to-GitHub latency and connectivity failures on mainland networks.
  if(session.oauth && typeof window!=="undefined" &&
    window.location.hostname==="firefly-blog-preview.guojunyang666666.workers.dev"){
   const response=await fetch("/api/admin/content-source?path="+encodeURIComponent(path),{
    credentials:"same-origin",cache:"no-store",
   });
   const payload=await response.json().catch(()=>null);
   if(!response.ok || typeof payload?.source!=="string" || typeof payload?.sha!=="string")
    throw new Error(payload?.error||"预览站文章源码 API 暂时不可用。");
   return {source:payload.source,sha:payload.sha};
  }
  const response=await fetch(
   "https://api.github.com/repos/"+encodeURIComponent(session.owner)+
   "/"+encodeURIComponent(session.repo)+"/contents/"+encodePath(path)+
   "?ref="+encodeURIComponent(session.branch),
   {headers:{
    Accept:"application/vnd.github+json",
    ...(session.oauth?{}:{Authorization:"Bearer "+session.token}),
    "X-GitHub-Api-Version":"2022-11-28",
   }},
  );
  const payload=await response.json();
  if(!response.ok||!payload?.content||!payload?.sha){
   throw new Error(payload?.message||"读取 GitHub 源文件失败："+response.status);
  }
  const value={source:decodeBase64Utf8(payload.content),sha:String(payload.sha)};
  if(value.source.length<=150_000){
   scoped.ready.set(path,{value,expiresAt:Date.now()+CACHE_MS});
   while(scoped.ready.size>MAX_CACHED_FILES)
    scoped.ready.delete(scoped.ready.keys().next().value!);
  }
  return value;
 })();
 scoped.running.set(path,promise);
 try{return await promise;}
 finally{if(scoped.running.get(path)===promise)scoped.running.delete(path);}
}
