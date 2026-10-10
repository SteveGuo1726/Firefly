import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSessionService} from "../src/server/admin-auth/session-service.js";
function memoryStore(){
 const items=new Map();
 return {
  async putIfAbsent(key,value){if(items.has(key))return false;items.set(key,value);return true;},
  async take(key){const value=items.get(key);items.delete(key);return value??null;},
  async get(key){return items.get(key)??null;},
  async delete(key){items.delete(key);},
  keys:()=>[...items.keys()],
 };
}
test("session service rejects nonatomic storage",()=>{
 assert.throws(()=>createAdminSessionService({store:{get(){},delete(){}}}),/Atomic/);
});
test("OAuth transaction is consumed exactly once and stores no raw state",async()=>{
 const store=memoryStore(),svc=createAdminSessionService({store});
 const tx=await svc.createTransaction({redirectUri:"https://blog.example.com/admin/callback"});
 assert.equal(store.keys().some(k=>k.includes(tx.state)),false);
 assert.ok(await svc.consumeTransaction(tx.state));
 assert.equal(await svc.consumeTransaction(tx.state),null);
});
test("expired transactions are rejected",async()=>{
 const store=memoryStore();let now=100000;
 const svc=createAdminSessionService({store,clock:()=>now,stateTtlMs:100});
 const tx=await svc.createTransaction({redirectUri:"https://blog.example.com/callback"});
 now+=101;
 assert.equal(await svc.consumeTransaction(tx.state),null);
});
test("admin session verifies identity, expires, revokes and hashes storage keys",async()=>{
 const store=memoryStore();let now=100;
 const svc=createAdminSessionService({store,clock:()=>now,sessionTtlMs:500});
 await assert.rejects(svc.createSession({login:"attacker",userId:1}),/mismatch/);
 const {token}=await svc.createSession({login:"SteveGuo1726",userId:1234});
 assert.equal(store.keys().some(k=>k.includes(token)),false);
 assert.equal((await svc.verifySession(token)).userId,1234);
 await svc.revokeSession(token);
 assert.equal(await svc.verifySession(token),null);
 const next=await svc.createSession({login:"steveguo1726",userId:1234});
 now+=501;
 assert.equal(await svc.verifySession(next.token),null);
});
