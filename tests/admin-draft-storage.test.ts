import assert from "node:assert/strict";
import test from "node:test";
import {draftKey,readDraft,writeDraft,clearDraft} from "../src/utils/admin/draft-storage.ts";
function memory(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),raw:m};}
test("post and dynamic drafts stay isolated per account and kind",()=>{
 const s=memory();writeDraft(s,"post","Alice",'{"body":"hello"}',{now:100});
 writeDraft(s,"dynamic","Alice",'{"body":"world"}',{now:100});
 assert.equal(readDraft(s,"post","Alice",{now:101}).snapshot,'{"body":"hello"}');
 assert.equal(readDraft(s,"dynamic","Alice",{now:101}).snapshot,'{"body":"world"}');
 assert.equal(readDraft(s,"post","Bob",{now:101}),null);
 assert.equal(draftKey("post","Alice"),draftKey("post","alice"));
});
test("expired or corrupt private drafts are discarded",()=>{
 const s=memory();writeDraft(s,"post","Alice","hello",{now:100});
 assert.equal(readDraft(s,"post","Alice",{now:100+8*24*60*60*1000}),null);
 s.setItem(draftKey("post","Alice"),"invalid-json");
 assert.equal(readDraft(s,"post","Alice"),null);
});
test("private draft size is bounded and clearing is scoped",()=>{
 const s=memory();assert.throws(()=>writeDraft(s,"post","Alice","x".repeat(1_000_001)),/1MB/);
 writeDraft(s,"post","Alice","a");writeDraft(s,"post","Bob","b");
 clearDraft(s,"post","Alice");
 assert.equal(readDraft(s,"post","Alice"),null);
 assert.equal(readDraft(s,"post","Bob")?.snapshot,"b");
});
