import assert from "node:assert/strict";
import { test } from "node:test";
import { planLiveRevisionGc } from "../src/server/live-content/revision-gc.js";

test("GC requires archival receipts, protects current pointers and newest", () => {
 const now = Date.parse("2026-10-10T00:00:00Z");
 const ids = Array.from({length:5},(_,i) => "00000000-0000-4000-8000-" + String(i+1).padStart(12,"0"));
 const revisions = ids.map((id,i) => ({
  key:"v3/items/posts/example/" + id + ".json",
  createdAt:new Date(now-(i+40)*86400000).toISOString()
 }));
 const archived = new Set(revisions.map(x=>x.key));
 const active = new Set([revisions[4].key]);
 const selected = planLiveRevisionGc({revisions,activePointers:active,archivedRevisionKeys:archived,now,minAgeDays:30,keepLatest:2});
 assert.deepEqual(selected,[revisions[2].key,revisions[3].key].sort());
 assert.deepEqual(planLiveRevisionGc({revisions,activePointers:active,activePointers:active,archivedRevisionKeys:new Set(),now,keepLatest:2}),[]);
});

test("GC ignores recent, future, nonrevision keys", () => {
 const now = Date.parse("2026-10-10T00:00:00Z");
 const revisions = [
  {key:"v3/items/dynamics/demo/00000000-0000-4000-8000-000000000001.json",createdAt:"2026-10-09T00:00:00Z"},
  {key:"v3/items/dynamics/demo/00000000-0000-4000-8000-000000000002.json",createdAt:"2027-10-01T00:00:00Z"},
  {key:"v3/pointers/dynamics/demo.json",createdAt:"2025-01-01T00:00:00Z"}
 ];
 assert.deepEqual(planLiveRevisionGc({revisions,activePointers:new Set(),archivedRevisionKeys:new Set(revisions.map(x=>x.key)),now,keepLatest:1}),[]);
 assert.throws(()=>planLiveRevisionGc({revisions,activePointers:new Set(),archivedRevisionKeys:new Set(),keepLatest:0}),RangeError);
 assert.throws(()=>planLiveRevisionGc({revisions,archivedRevisionKeys:new Set()}),TypeError);
});
