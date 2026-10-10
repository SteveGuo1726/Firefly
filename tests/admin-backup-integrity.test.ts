import assert from "node:assert/strict";
import test from "node:test";
import { validateLiveContentBackup } from "../src/utils/admin/backup-integrity";

function fixture() {
 const item = {
  schemaVersion:3,kind:"post",id:"article",path:"src/content/posts/article.md",
  revision:"11111111-1111-4111-8111-111111111111",source:"Private source",deleted:false,
 };
 return {schemaVersion:3,exportedAt:"2026-10-10T00:00:00Z",posts:[item],dynamics:[],history:[{...item}]};
}

test("backup validator accepts complete snapshots and reports tombstones", () => {
 const data = fixture();
 data.posts.push({
  schemaVersion:3,kind:"post",id:"gone",path:"src/content/posts/gone.md",
  revision:"22222222-2222-4222-8222-222222222222",source:"",deleted:true,
 });
 assert.deepEqual(validateLiveContentBackup(data),{currentCount:2,deletedCount:1,historyCount:1});
});

test("backup validator rejects missing history and missing source", () => {
 const data=fixture();
 data.history=[];
 assert.throws(()=>validateLiveContentBackup(data),/历史版本缺失/);
 const malformed=fixture();
 delete (malformed.history[0] as {source?:string}).source;
 assert.throws(()=>validateLiveContentBackup(malformed),/正文缺失/);
});

test("backup validator refuses duplicate IDs, revision collisions and mismatches", () => {
 const dup=fixture(); dup.posts.push({...dup.posts[0]});
 assert.throws(()=>validateLiveContentBackup(dup),/ID 重复/);
 const versions=fixture(); versions.history.push({...versions.history[0]});
 assert.throws(()=>validateLiveContentBackup(versions),/历史版本重复/);
 const body=fixture(); body.history[0].source="tampered";
 assert.throws(()=>validateLiveContentBackup(body),/不匹配/);
});

test("backup validator rejects unsupported format and path traversal", () => {
 assert.throws(()=>validateLiveContentBackup({schemaVersion:2,posts:[],dynamics:[],history:[]}),/schemaVersion=3/);
 const data=fixture(); data.posts[0].path="src/content/posts/../escape.md";
 assert.throws(()=>validateLiveContentBackup(data),/路径/);
});
