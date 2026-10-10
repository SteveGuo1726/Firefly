import assert from "node:assert/strict";
import test from "node:test";
import {fetchGitContentSource,invalidateGitContentCache} from "../src/utils/admin/github-content-reader";
import type {GitHubAdminSession} from "../src/utils/admin/github-session";

const session=(login="owner"):GitHubAdminSession=>({
 login,name:login,avatarUrl:"",token:"token-for-test",owner:"someowner",
 repo:"somerepo",branch:"ai/preview-test",expiresAt:Date.now()+3600000,
});
test("GitHub article switching shares requests and caches per session",async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const content=Buffer.from("---\ntitle: Sample\n---\nHello","utf8").toString("base64");
 globalThis.fetch=async(url,init)=>{
  requests++;
  assert.match(String(url),/api.github.com/);
  assert.equal((init as RequestInit).headers && typeof (init as RequestInit).headers,"object");
  await new Promise(resolve=>setTimeout(resolve,10));
  return Response.json({sha:"abc123",content});
 };
 try {
  const user=session();
  const path="src/content/posts/article.md";
  const [a,b]=await Promise.all([
   fetchGitContentSource(user,path),fetchGitContentSource(user,path),
  ]);
  assert.deepEqual(a,b);
  assert.equal(requests,1);
  assert.deepEqual(await fetchGitContentSource(user,path),a);
  assert.equal(requests,1);
  await fetchGitContentSource(session("another"),path);
  assert.equal(requests,2);
  invalidateGitContentCache(user,path);
  await fetchGitContentSource(user,path);
  assert.equal(requests,3);
 }finally{globalThis.fetch=original;}
});
test("GitHub content source rejects traversal before networking",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error("unexpected network call");};
 try{
  const user=session();
  for(const path of ["../../secrets",".env","src/content/posts/../secret.md",
   "src/content/posts/secret.txt","src/content/posts/unsafe\\name.md"]) {
   await assert.rejects(fetchGitContentSource(user,path),/不安全/);
  }
 }finally{globalThis.fetch=original;}
});
test("failed GitHub downloads are not reused from cache",async()=>{
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  return calls===1?Response.json({message:"unavailable"},{status:503}):
   Response.json({sha:"ok",content:Buffer.from("working").toString("base64")});
 };
 try {
  const user=session();
  const path="src/content/dynamic/2026-10-10.md";
  await assert.rejects(fetchGitContentSource(user,path));
  assert.deepEqual(await fetchGitContentSource(user,path),{sha:"ok",source:"working"});
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
