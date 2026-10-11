import assert from "node:assert/strict";
import test from "node:test";
import previewWorker from "../worker/blog-preview.ts";
import { buildPreviewPrivatePostIndex,publicPreviewIndexFallback } from "../src/server/preview-private-index.js";
import {
 authorizePreviewSession,previewLogin,previewMe,previewLogout,previewMutationOriginAllowed,correctPreviewRequestOrigin,
} from "../src/server/preview-auth.js";

const ORIGIN="https://firefly-blog-preview.example.workers.dev";
function store(){
 const data=new Map();
 return {
  data,
  async get(key){return data.get(key)||null},
  async put(key,value){data.set(key,value)},
  async delete(key){data.delete(key)},
 };
}
function env(){
 return {
  FIREFLY_PREVIEW_ADMIN_PASSWORD:"test-case-only-password-ABC123",
  FIREFLY_PREVIEW_SESSION_KEY:"test-key-long-enough-for-hmac-without-real-credentials-123456789",
  LIVE_CONTENT_PREVIEW:store(),
 };
}
function request(path="/api/preview-admin/login",method="POST",password="",headers={}){
 return new Request(ORIGIN+path,{
  method,headers:{"Origin":ORIGIN,"Content-Type":"application/json",...headers},
  ...(method==="POST"?{body:JSON.stringify({password})}:{}),
 });
}
test("preview login creates HttpOnly, Secure, same-site scoped session",async()=>{
 const secret=env();
 const invalid=await previewLogin(request(undefined,"POST","wrong"),secret);
 assert.equal(invalid.status,401);
 assert.equal(invalid.headers.get("Set-Cookie"),null);
 const successful=await previewLogin(request(undefined,"POST",secret.FIREFLY_PREVIEW_ADMIN_PASSWORD),secret);
 assert.equal(successful.status,200);
 const cookie=successful.headers.get("Set-Cookie");
 assert.match(cookie,/__Host-firefly-admin=v1\./);
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/Secure/);
 assert.match(cookie,/SameSite=Strict/);
 const sessionRequest=new Request(ORIGIN+"/api/admin/auth/me",{headers:{Cookie:cookie.split(";")[0]}});
 assert.equal((await authorizePreviewSession(sessionRequest,secret)).ok,true);
 assert.deepEqual((await previewMe(sessionRequest,secret)).status,200);
 assert.equal((await (await previewMe(sessionRequest,secret)).json()).authenticated,true);
});
test("preview session rejects forged cookie and missing configuration",async()=>{
 const secret=env();
 const good=await previewLogin(request(undefined,"POST",secret.FIREFLY_PREVIEW_ADMIN_PASSWORD),secret);
 const raw=good.headers.get("Set-Cookie").split(";")[0];
 const changeAt=raw.lastIndexOf(".")+5;
 const forged=raw.slice(0,changeAt)+(raw[changeAt]==="X"?"Y":"X")+raw.slice(changeAt+1);
 assert.equal((await authorizePreviewSession(new Request(ORIGIN,{headers:{Cookie:forged}}),secret)).ok,false);
 assert.equal((await authorizePreviewSession(new Request(ORIGIN,{headers:{Cookie:raw}}),{})).ok,false);
 const absent=await previewLogin(request(),{});
 assert.equal(absent.status,503);
});
test("preview login rejects cross-origin posts and throttles repeated errors",async()=>{
 const secret=env();
 const cross=await previewLogin(request(undefined,"POST","guess",{Origin:"https://malicious.example"}),secret);
 assert.equal(cross.status,403);
 for(let i=0;i<6;i++)assert.equal((await previewLogin(request(undefined,"POST","wrong"),secret)).status,401);
 const denied=await previewLogin(request(undefined,"POST",secret.FIREFLY_PREVIEW_ADMIN_PASSWORD),secret);
 assert.equal(denied.status,429);
 assert.equal(denied.headers.get("Retry-After"),"900");
});
test("preview logout clears browser session and requires Origin",async()=>{
 const res=await previewLogout(new Request(ORIGIN+"/api/admin/auth/logout",{method:"POST",headers:{Origin:ORIGIN}}));
 assert.equal(res.status,200);
 assert.match(res.headers.get("Set-Cookie"),/Max-Age=0/);
 assert.equal((await previewLogout(new Request(ORIGIN+"/api/admin/auth/logout",{
  method:"POST",headers:{Origin:"https://malicious.example"},
 }))).status,403);
 assert.equal(previewMutationOriginAllowed(new Request(ORIGIN+"/api/live-content/item",{method:"POST"})),false);
 assert.equal(previewMutationOriginAllowed(new Request(ORIGIN+"/api/live-content/item",{method:"GET"})),true);
});


test("preview Worker connects a valid signed session to real KV backup access", async () => {
 const db=store();
 db.list=async()=>({keys:[],list_complete:true});
 const variables={...env(),LIVE_CONTENT_PREVIEW:db};
 const login=await previewWorker.fetch(request(undefined,"POST",variables.FIREFLY_PREVIEW_ADMIN_PASSWORD),variables,{});
 assert.equal(login.status,200);
 const cookie=login.headers.get("Set-Cookie").split(";")[0];
 const protectedUrl=ORIGIN+"/api/live-content/export";
 const anonymous=await previewWorker.fetch(new Request(protectedUrl),variables,{});
 assert.equal(anonymous.status,401);
 const authorized=await previewWorker.fetch(new Request(protectedUrl,{headers:{Cookie:cookie}}),variables,{});
 assert.equal(authorized.status,200);
 const backup=await authorized.json();
 assert.deepEqual(backup.posts,[]);
 assert.deepEqual(backup.dynamics,[]);
 assert.deepEqual(backup.history,[]);
 const privateIndex=await previewWorker.fetch(new Request(ORIGIN+"/api/admin/private-index"),variables,{});
 assert.equal(privateIndex.status,401);
});


test("browser-safe private index parses GitHub frontmatter without Node fs",async()=>{
 const content=["---","title: Test title","description: Describes the article","published: 2026-10-10","draft: true","pinned: false","tags: [one, two]","category: engineering","---","hello"].join("\n");
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes("/git/trees/"))return Response.json({truncated:false,tree:[
   {path:"src/content/posts/example.md",type:"blob"},
   {path:"src/content/posts/../bad.md",type:"blob"},
  ]});
  if(url.includes("/contents/"))return Response.json({
   content:Buffer.from(content,"utf8").toString("base64"),
  });
  throw new Error("unexpected request");
 };
 const result=await buildPreviewPrivatePostIndex({fetcher});
 assert.equal(result.posts.length,1);
 assert.equal(result.posts[0].title,"Test title");
 assert.equal(result.posts[0].draft,true);
 assert.deepEqual(result.posts[0].tags,["one","two"]);
 assert.equal(urls.length,2);
});
test("preview private index fails closed on truncated GitHub tree",async()=>{
 await assert.rejects(buildPreviewPrivatePostIndex({fetcher:async()=>Response.json({
  truncated:true,tree:[],
 })}),/incomplete/);
});


test("preview accepts privacy-browser origin omissions only with trusted fetch metadata and same-origin Referer",()=>{
 const base=ORIGIN+"/api/preview-admin/login";
 const good=new Request(base,{method:"POST",headers:{"Sec-Fetch-Site":"same-origin","Referer":ORIGIN+"/admin/?section=posts"}});
 assert.equal(correctPreviewRequestOrigin(good),true);
 const nullOrigin=new Request(base,{method:"POST",headers:{"Origin":"null","Sec-Fetch-Site":"same-origin","Referer":ORIGIN+"/admin/"}});
 assert.equal(correctPreviewRequestOrigin(nullOrigin),true);
 const hostile=new Request(base,{method:"POST",headers:{"Origin":"https://evil.example","Sec-Fetch-Site":"same-origin","Referer":ORIGIN+"/admin/"}});
 assert.equal(correctPreviewRequestOrigin(hostile),false);
 const badReferer=new Request(base,{method:"POST",headers:{"Sec-Fetch-Site":"same-origin","Referer":"https://evil.example/"}});
 assert.equal(correctPreviewRequestOrigin(badReferer),false);
 const noFetchSite=new Request(base,{method:"POST",headers:{"Referer":ORIGIN+"/admin/"}});
 assert.equal(correctPreviewRequestOrigin(noFetchSite),false);
});


test("preview public fallback excludes draft and protected entries and marks incomplete index",()=>{
 const result=publicPreviewIndexFallback({posts:[
  {id:"safe",path:"src/content/posts/safe.md",title:"Safe",draft:false,protected:false},
  {id:"draft",path:"src/content/posts/draft.md",draft:true},
  {id:"secret",path:"src/content/posts/secret.md",protected:true},
  {id:"password",path:"src/content/posts/pw.md",password:"sensitive"},
  {id:"escape",path:"src/content/posts/../secret.md"},
 ]});
 assert.equal(result.limited,true);
 assert.equal(result.source,"preview-public-index-fallback");
 assert.deepEqual(result.posts.map(x=>x.id),["safe"]);
});
test("preview worker falls back to public ASSETS index when GitHub is unavailable",async()=>{
 const config=env();
 const login=await previewWorker.fetch(request(undefined,"POST",config.FIREFLY_PREVIEW_ADMIN_PASSWORD),config,{});
 assert.equal(login.status,200);
 const cookie=login.headers.get("Set-Cookie").split(";")[0];
 config.ASSETS={fetch:async()=>Response.json({posts:[
  {id:"visible",path:"src/content/posts/visible.md",title:"Visible"},
  {id:"hidden",path:"src/content/posts/hidden.md",draft:true},
 ]})};
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response("rate-limited",{status:403});
 try{
  const response=await previewWorker.fetch(new Request(ORIGIN+"/api/admin/private-index",{headers:{Cookie:cookie}}),config,{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.limited,true);
  assert.deepEqual(data.posts.map(x=>x.id),["visible"]);
 }finally{globalThis.fetch=oldFetch;}
});
