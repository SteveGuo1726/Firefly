import assert from "node:assert/strict";
import test from "node:test";
import {createPreviewController} from "../src/utils/admin/preview-controller";

const sleep=(n=10)=>new Promise(resolve=>setTimeout(resolve,n));
test("latest article wins even when older render completes last",async()=>{
 const pending=new Map<string,(html:string)=>void>();
 const seen:string[]=[];
 const ctrl=createPreviewController(
  ({source})=>new Promise<string>(resolve=>pending.set(source,resolve)),
  {onReady:html=>seen.push(html),onBusy:()=>{},onFailure:()=>{}},0,
 );
 ctrl.schedule({source:"old"},true);
 await sleep();
 ctrl.schedule({source:"new"},true);
 await sleep();
 pending.get("new")!("NEW");
 await sleep();
 pending.get("old")!("OLD");
 await sleep();
 assert.deepEqual(seen,["NEW"]);
 ctrl.clear();
});
test("switching during debounce cancels the old preview",async()=>{
 const rendered:string[]=[];
 const ready:string[]=[];
 const ctrl=createPreviewController(
  async ({source})=>{rendered.push(source);return "<p>"+source+"</p>";},
  {onReady:html=>ready.push(html),onBusy:()=>{},onFailure:()=>{}},20,
 );
 ctrl.schedule({source:"first"});
 await sleep(4);
 ctrl.schedule({source:"second"});
 await sleep(40);
 assert.deepEqual(rendered,["second"]);
 assert.deepEqual(ready,["<p>second</p>"]);
 ctrl.clear();
});
test("cache deduplicates rendering by content and MDX mode",async()=>{
 let renders=0;
 const ready:string[]=[];
 const ctrl=createPreviewController(
  async({source,isMdx})=>{renders++;return (isMdx?"mdx:":"md:")+source;},
  {onReady:html=>ready.push(html),onBusy:()=>{},onFailure:()=>{}},0,
 );
 ctrl.schedule({source:"article"},true);
 await sleep();
 ctrl.schedule({source:"article"},true);
 await sleep();
 assert.equal(renders,1);
 ctrl.schedule({source:"article",isMdx:true},true);
 await sleep();
 assert.equal(renders,2);
 assert.deepEqual(ready,["md:article","md:article","mdx:article"]);
 ctrl.clear();
});
test("save reuses in-flight preview and failures never leak stale errors",async()=>{
 let rejected:((error:Error)=>void)|null=null;
 const failures:string[]=[];
 const ctrl=createPreviewController(
  ({source})=>source==="bad"?new Promise<string>((_,reject)=>{rejected=reject;}):Promise.resolve("ok"),
  {onReady:()=>{},onBusy:()=>{},onFailure:error=>failures.push(error)},0,
 );
 ctrl.schedule({source:"bad"},true);
 await sleep();
 ctrl.schedule({source:"ok"},true);
 rejected!(new Error("stale"));
 await sleep();
 assert.deepEqual(failures,[]);
 assert.equal(await ctrl.renderNow({source:"ok"}),"ok");
 ctrl.clear();
});
test("clear stops pending work and purges rendered cache",async()=>{
 let count=0;
 const ready:string[]=[];
 const ctrl=createPreviewController(
  async()=>{count++;return "render "+count;},
  {onReady:html=>ready.push(html),onBusy:()=>{},onFailure:()=>{}},0,
 );
 ctrl.schedule({source:"x"},true);
 await sleep();
 ctrl.clear();
 ctrl.schedule({source:"x"},true);
 await sleep();
 assert.deepEqual(ready,["render 1","render 2"]);
});
