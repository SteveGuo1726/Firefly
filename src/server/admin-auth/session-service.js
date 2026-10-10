import {randomOpaque,sha256Base64Url,validateOAuthCallback} from "./oauth-core.js";

/** Store must supply atomic create-if-absent and take-and-delete for OAuth state.
 * A KV get+delete pair is NOT sufficient to enforce single use across regions.
 */
export function createAdminSessionService({store,clock=()=>Date.now(),adminLogin="SteveGuo1726",sessionTtlMs=8*60*60*1000,stateTtlMs=5*60*1000}){
 if(!store || typeof store.putIfAbsent!=="function" || typeof store.take!=="function" || typeof store.get!=="function" || typeof store.delete!=="function"){
  throw new Error("Atomic transaction store required");
 }
 const transactionKey=async state=>"oauth-state:"+await sha256Base64Url(state);
 const sessionKey=async token=>"oauth-session:"+await sha256Base64Url(token);
 return {
  async createTransaction({redirectUri}){
   if(!redirectUri || !/^https:\/\//.test(redirectUri))throw new Error("HTTPS callback required");
   const state=randomOpaque(32),issuedAt=clock();
   const key=await transactionKey(state);
   const inserted=await store.putIfAbsent(key,{issuedAt,redirectUri},stateTtlMs);
   if(!inserted)throw new Error("OAuth transaction collision");
   return {state,redirectUri};
  },
  async consumeTransaction(state){
   if(!state || typeof state!=="string")return null;
   const entry=await store.take(await transactionKey(state));
   if(!entry || !validateOAuthCallback({expectedState:state,receivedState:state,issuedAt:entry.issuedAt,now:clock(),maxAgeMs:stateTtlMs}))return null;
   return entry;
  },
  async createSession({login,userId}){
   if(typeof login!=="string" || login.toLowerCase()!==adminLogin.toLowerCase() || !Number.isSafeInteger(userId) || userId<=0){
    throw new Error("GitHub admin identity mismatch");
   }
   const token=randomOpaque(48),expiresAt=clock()+sessionTtlMs;
   const record={login,userId,expiresAt,createdAt:clock()};
   if(!await store.putIfAbsent(await sessionKey(token),record,sessionTtlMs))throw new Error("Session collision");
   return {token,expiresAt};
  },
  async verifySession(token){
   if(typeof token!=="string"|| !/^[A-Za-z0-9_-]{32,}$/.test(token))return null;
   const key=await sessionKey(token),record=await store.get(key);
   if(!record || record.expiresAt<=clock() || record.login.toLowerCase()!==adminLogin.toLowerCase()){
    if(record)await store.delete(key);
    return null;
   }
   return {login:record.login,userId:record.userId,expiresAt:record.expiresAt};
  },
  async revokeSession(token){
   if(typeof token!=="string"|| !/^[A-Za-z0-9_-]{32,}$/.test(token))return;
   await store.delete(await sessionKey(token));
  },
 };
}
