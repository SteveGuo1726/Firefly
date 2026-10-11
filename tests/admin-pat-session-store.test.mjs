import test from "node:test";
import assert from "node:assert/strict";
import {createPatBlobSessions} from "../src/server/admin-auth/pat-session-store.js";

function fakeStore(){
 const data=new Map(),operations=[];
 return {
  data,operations,
  async setJSON(key,value){operations.push(["write",key]);data.set(key,value);},
  async get(key,opts){operations.push(["read",key,opts]);return data.get(key)||null;},
  async delete(key){operations.push(["delete",key]);data.delete(key);},
 };
}
test("PAT cookie sessions work with EdgeOne basic Blob writes; OAuth CAS remains separate",async()=>{
 const blob=fakeStore(),svc=createPatBlobSessions({blob});
 const created=await svc.createSession({login:"SteveGuo1726",userId:123});
 assert.ok(/^[A-Za-z0-9_-]{32,}$/.test(created.token));
 assert.equal(blob.data.size,1);
 const key=[...blob.data.keys()][0];
 assert.ok(key.startsWith("pat-session:"));
 assert.ok(!key.includes(created.token));
 assert.equal((await svc.verifySession(created.token)).login,"SteveGuo1726");
 assert.equal(blob.operations.find(op=>op[0]==="read")[2].consistency,"strong");
 await svc.revokeSession(created.token);
 assert.equal(await svc.verifySession(created.token),null);
 assert.equal(blob.data.size,0);
});
test("PAT sessions reject impersonation and malformed token without Blob reads",async()=>{
 const blob=fakeStore(),svc=createPatBlobSessions({blob});
 await assert.rejects(svc.createSession({login:"attacker",userId:123}),/identity/);
 await assert.rejects(svc.createSession({login:"SteveGuo1726",userId:0}),/identity/);
 assert.equal(await svc.verifySession("bad"),null);
 assert.equal(blob.operations.length,0);
});
test("PAT sessions use an 8h server TTL and cannot be revived",async()=>{
 const blob=fakeStore();let now=0;
 const svc=createPatBlobSessions({blob,clock:()=>now,ttlMs:1000});
 const issued=await svc.createSession({login:"SteveGuo1726",userId:123});
 now=500;assert.ok(await svc.verifySession(issued.token));
 now=1000;assert.equal(await svc.verifySession(issued.token),null);
});
