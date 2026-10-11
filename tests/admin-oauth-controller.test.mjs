import assert from "node:assert/strict";
import test from "node:test";
import {edgeOneAtomicAuthStore} from "../src/server/admin-auth/edgeone-store.js";
import {createAdminSessionService} from "../src/server/admin-auth/session-service.js";
import {createGitHubAdminAuthController} from "../src/server/admin-auth/controller.js";

function mockBlob(){
 const data=new Map();
 return {
  data,
  async get(key){return data.has(key)?structuredClone(data.get(key)):null;},
  async setJSON(key,value,options){
   if(options?.onlyIfNew&&data.has(key))throw new Error("already exists");
   data.set(key,structuredClone(value));
  },
  async delete(key){data.delete(key);},
 };
}
test("EdgeOne conditional auth store consumes a login state at most once",async()=>{
 const blob=mockBlob(),store=edgeOneAtomicAuthStore(blob);
 assert.equal(await store.putIfAbsent("x",{a:1}),true);
 assert.equal(await store.putIfAbsent("x",{a:2}),false);
 const [one,two]=await Promise.all([store.take("x"),store.take("x")]);
 assert.equal([one,two].filter(Boolean).length,1);
 assert.equal(blob.data.has("x:consumed"),true);
});
test("OAuth controller performs PKCE login, session profile and CSRF-protected logout",async()=>{
 const store=edgeOneAtomicAuthStore(mockBlob());
 const sessions=createAdminSessionService({store});
 const callbackUrl="https://blog.example.com/api/admin/auth/callback";
 let sawVerifier=false;
 const fetcher=async(url,opts)=>{
  if(url.includes("access_token")){
   const data=new URLSearchParams(opts.body);
   sawVerifier=Boolean(data.get("code_verifier"));
   return new Response(JSON.stringify({access_token:"server-only-oauth-token",token_type:"bearer"}),{status:200});
  }
  assert.equal(opts.headers.Authorization,"Bearer server-only-oauth-token");
  return new Response(JSON.stringify({id:1234,login:"SteveGuo1726"}),{status:200});
 };
 const auth=createGitHubAdminAuthController({
  clientId:"test-client",clientSecret:"server-secret",callbackUrl,sessionService:sessions,fetcher
 });
 const start=await auth.start(new Request("https://blog.example.com/api/admin/auth/start"));
 assert.equal(start.status,302);
 const authorize=new URL(start.headers.get("Location"));
 const state=authorize.searchParams.get("state");
 const stateCookie=start.headers.get("Set-Cookie").split(";")[0];
 assert.equal(authorize.searchParams.get("code_challenge_method"),"S256");
 assert.equal(authorize.searchParams.get("code_challenge")?.length,43);
 const response=await auth.callback(new Request(callbackUrl+"?state="+encodeURIComponent(state)+"&code=example",{headers:{Cookie:stateCookie}}));
 assert.equal(response.status,303);
 assert.equal(sawVerifier,true);
 assert.match(response.headers.get("Set-Cookie"),/HttpOnly; Secure; SameSite=Lax/);
 const cookie=response.headers.get("Set-Cookie").split(";")[0];
 const me=await auth.me(new Request("https://blog.example.com/api/admin/auth/me",{headers:{Cookie:cookie}}));
 assert.equal((await me.json()).user.login,"SteveGuo1726");
 const replay=await auth.callback(new Request(callbackUrl+"?state="+encodeURIComponent(state)+"&code=example"));
 assert.match(replay.headers.get("Location"),/auth=failed/);
 const denied=await auth.logout(new Request("https://blog.example.com/api/admin/auth/logout",{
  method:"POST",headers:{Cookie:cookie,Origin:"https://attacker.example"}
 }));
 assert.equal(denied.status,403);
 const logout=await auth.logout(new Request("https://blog.example.com/api/admin/auth/logout",{
  method:"POST",headers:{Cookie:cookie,Origin:"https://blog.example.com"}
 }));
 assert.equal(logout.status,303);
 assert.ok(logout.headers.get("Set-Cookie").includes("__Host-firefly-admin=; Path=/; Max-Age=0"));
 const after=await auth.me(new Request("https://blog.example.com/api/admin/auth/me",{headers:{Cookie:cookie}}));
 assert.equal((await after.json()).authenticated,false);
});
test("OAuth rejects unexpected login identity and forged callback origin",async()=>{
 const sessions=createAdminSessionService({store:edgeOneAtomicAuthStore(mockBlob())});
 const callbackUrl="https://blog.example.com/api/admin/auth/callback";
 const auth=createGitHubAdminAuthController({
  clientId:"client",clientSecret:"secret",callbackUrl,sessionService:sessions,
  fetcher:async(url)=>new Response(JSON.stringify(url.includes("access_token")?{access_token:"tok"}:{id:1,login:"intruder"}),{status:200}),
 });
 const start=await auth.start(new Request("https://blog.example.com/api/admin/auth/start"));
 const state=new URL(start.headers.get("Location")).searchParams.get("state");
 const stateCookie=start.headers.get("Set-Cookie").split(";")[0];
 const forged=await auth.callback(new Request("https://evil.example.com/api/admin/auth/callback?state="+state+"&code=x",{headers:{Cookie:stateCookie}}));
 assert.equal(forged.status,403);
 const denied=await auth.callback(new Request(callbackUrl+"?state="+state+"&code=x",{headers:{Cookie:stateCookie}}));
 assert.match(denied.headers.get("Location"),/auth=failed/);
 assert.equal(denied.headers.get("Set-Cookie"),null);
});

test("OAuth callback rejects state replay from a different browser even if state URL is known",async()=>{
 const sessions=createAdminSessionService({store:edgeOneAtomicAuthStore(mockBlob())});
 const callbackUrl="https://blog.example.com/api/admin/auth/callback";
 const auth=createGitHubAdminAuthController({
  clientId:"client",clientSecret:"secret",callbackUrl,sessionService:sessions,
  fetcher:async()=>{throw new Error("must not call GitHub without browser cookie");},
 });
 const start=await auth.start(new Request("https://blog.example.com/api/admin/auth/start"));
 const state=new URL(start.headers.get("Location")).searchParams.get("state");
 const response=await auth.callback(new Request(callbackUrl+"?state="+state+"&code=x"));
 assert.match(response.headers.get("Location"),/auth=failed/);
 assert.equal(response.headers.get("Set-Cookie"),null);
});

test("OAuth must refuse old Blob adapters that ignore conditional onlyIfNew writes",async()=>{
 const {assertEdgeOneAtomicWrites}=await import("../src/server/admin-auth/edgeone-store.js");
 const values=new Map();
 const unsafeBlob={
  async setJSON(key,value){values.set(key,value);},
  async get(key){return values.get(key)||null;},
  async delete(key){values.delete(key);},
 };
 await assert.rejects(assertEdgeOneAtomicWrites(unsafeBlob),/conditional writes unavailable/);
});

test("private index parses YAML arrays and drafts without exposing bodies",async()=>{
 const {buildPrivatePostIndex}=await import("../src/server/admin-auth/private-index.js");
 const raw=Buffer.from('---\\ntitle: "A: quoted title"\\ndraft: true\\ntags: [one, two]\\npublished: 2026-10-10\\n---\\nSecret'.replaceAll('\\n','\n')).toString("base64");
 const fetcher=async url=>new Response(JSON.stringify(url.includes("/git/trees/")?{tree:[{type:"blob",path:"src/content/posts/draft.md"}],truncated:false}:{content:raw}),{status:200});
 const result=await buildPrivatePostIndex({token:"test",owner:"owner",repo:"repo",branch:"ai/preview-test",fetcher});
 assert.equal(result.posts[0].draft,true);
 assert.equal(result.posts[0].title,"A: quoted title");
 assert.deepEqual(result.posts[0].tags,["one","two"]);
 assert.equal("source" in result.posts[0],false);
});
