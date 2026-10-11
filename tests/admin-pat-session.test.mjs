import test from "node:test";
import assert from "node:assert/strict";
import { createPatSessionController } from "../src/server/admin-auth/pat-session.js";

const ORIGIN="https://blog.casto.top";
const PAT="github_pat_"+"a".repeat(55);
function request(path,body,origin=ORIGIN){
 return new Request(ORIGIN+path,{method:"POST",headers:{"Origin":origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
}
function setup({login="SteveGuo1726",canWrite=true,failAPI=false}={}){
 const calls=[];const sessions={
  async createSession(user){calls.push({op:"session",user});return {token:"a".repeat(60)};},
  async verifySession(value){calls.push({op:"verify",value});return value==="a".repeat(60)?{login:"SteveGuo1726",userId:123}:null;},
  async revokeSession(value){calls.push({op:"revoke",value});},
 };
 const fetcher=async(url,options)=>{
  calls.push({op:"fetch",url,token:options.headers.Authorization});
  if(failAPI)return new Response("failed",{status:403});
  if(url.endsWith("/user"))return Response.json({login,id:123});
  return Response.json({permissions:{push:canWrite}});
 };
 return {controller:createPatSessionController({sessions,fetcher}),calls};
}
test("PAT exchange verifies account and repo write permission, then sets an HttpOnly cookie",async()=>{
 const {controller,calls}=setup();
 const r=await controller.login(request("/api/admin/auth/pat-login",{token:PAT}));
 assert.equal(r.status,200);
 assert.match(r.headers.get("Set-Cookie"),/__Host-firefly-admin=[A-Za-z0-9_-]+; Path=\/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax/);
 assert.equal(r.headers.get("Cache-Control"),"private, no-store");
 assert.equal((await r.json()).authenticated,true);
 assert.equal(calls.filter(c=>c.op==="fetch").length,2);
 assert.equal(calls.filter(c=>c.op==="session").length,1);
 assert.ok(!r.headers.get("Set-Cookie").includes(PAT));
});
test("PAT login blocks cross-site POSTs, non-production hosts and anonymous clients",async()=>{
 const {controller,calls}=setup();
 const bad=await controller.login(request("/api/admin/auth/pat-login",{token:PAT},"https://evil.test"));
 assert.equal(bad.status,403);
 assert.equal(calls.length,0);
 const preview=new Request("https://v1-preview.casto.top/api/admin/auth/pat-login",{method:"POST",headers:{Origin:"https://v1-preview.casto.top", "Content-Type":"application/json"},body:JSON.stringify({token:PAT})});
 assert.equal((await controller.login(preview)).status,403);
 assert.equal(calls.length,0);
});
test("PAT session rejects non-owner and non-writer without issuing a cookie",async()=>{
 for(const opts of [{login:"attacker"},{canWrite:false},{failAPI:true}]){
  const {controller,calls}=setup(opts);
  const r=await controller.login(request("/api/admin/auth/pat-login",{token:PAT}));
  assert.equal(r.status,403);
  assert.equal(r.headers.get("Set-Cookie"),null);
  assert.equal(calls.some(c=>c.op==="session"),false);
 }
});
test("PAT credential validation rejects malformed and overlong data before GitHub",async()=>{
 const {controller,calls}=setup();
 for(const token of ["", "sk_test_"+"a".repeat(45), "ghp_short", "github_pat_"+"x".repeat(2000)]){
  const r=await controller.login(request("/api/admin/auth/pat-login",{token}));
  assert.equal(r.status,400);
 }
 assert.equal(calls.length,0);
});
test("PAT auth /me only exposes session identity, and logout invalidates it",async()=>{
 const {controller,calls}=setup();
 const cookie="__Host-firefly-admin="+"a".repeat(60);
 const me=await controller.me(new Request(ORIGIN+"/api/admin/auth/me",{headers:{Cookie:cookie}}));
 assert.equal(me.status,200);
 assert.equal(me.headers.get("X-Firefly-OAuth"),"disabled");
 assert.deepEqual(await me.json(),{authenticated:true,user:{login:"SteveGuo1726",userId:123}});
 const logout=await controller.logout(new Request(ORIGIN+"/api/admin/auth/logout",{method:"POST",headers:{Origin:ORIGIN,Cookie:cookie}}));
 assert.equal(logout.status,200);
 assert.match(logout.headers.get("Set-Cookie"),/Max-Age=0/);
 assert.ok(calls.some(c=>c.op==="revoke"));
 const crossSite=await controller.logout(new Request(ORIGIN+"/api/admin/auth/logout",{method:"POST",headers:{Origin:"https://evil.test",Cookie:cookie}}));
 assert.equal(crossSite.status,403);
});
