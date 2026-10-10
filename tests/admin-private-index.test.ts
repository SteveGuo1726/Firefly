import assert from "node:assert/strict";
import test from "node:test";
import { fetchPrivatePostIndex } from "../src/utils/admin/private-content-index";
const session={owner:"SteveGuo1726",repo:"Firefly",branch:"ai/preview-test",oauth:true,token:""} as any;
const originalFetch=globalThis.fetch;
test("private index includes draft without publishing it in public static list",async()=>{
 const calls:string[]=[];
 globalThis.fetch=(async(input:RequestInfo|URL)=>{
  const url=String(input);calls.push(url);
  if(url.includes("/git/trees/"))return Response.json({truncated:false,tree:[
   {path:"src/content/posts/public.md",type:"blob"},
   {path:"src/content/posts/private.md",type:"blob"},
   {path:"src/content/posts/not-a-post.txt",type:"blob"}
  ]});
  if(url.includes("private.md"))return Response.json({sha:"testsha",content:Buffer.from("---\ntitle: Private draft\ndraft: true\npublished: 2026-10-01\n---\nSecret").toString("base64")});
  throw Error("unexpected "+url);
 }) as typeof fetch;
 try{
  const posts=await fetchPrivatePostIndex(session,[{id:"public",path:"src/content/posts/public.md",title:"Public",description:"",published:"2026-10-01",updated:"",category:"",tags:[],draft:false,pinned:false,image:""}]);
  assert.equal(posts.length,2);
  assert.equal(posts.find(x=>x.id==="private")?.draft,true);
  assert.equal(calls.filter(x=>x.includes("/contents/")).length,1);
 }finally{globalThis.fetch=originalFetch;}
});
test("truncated GitHub tree must fail instead of silently hiding drafts",async()=>{
 globalThis.fetch=(async()=>Response.json({truncated:true,tree:[]})) as typeof fetch;
 try{await assert.rejects(fetchPrivatePostIndex(session,[]),/文件树不完整/);}
 finally{globalThis.fetch=originalFetch;}
});
