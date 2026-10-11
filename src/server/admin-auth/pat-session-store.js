import { randomOpaque, sha256Base64Url } from "./oauth-core.js";

/**
 * PAT-backed admin sessions are identified by 384-bit unpredictable tokens.
 * Unlike the OAuth one-time state exchange, they require no conditional
 * create-if-absent and work on EdgeOne's documented Blob strong reads/writes.
 * OAuth transactions MUST keep their separate atomic anti-replay store.
 */
export function createPatBlobSessions({
 blob,adminLogin="SteveGuo1726",clock=()=>Date.now(),ttlMs=8*60*60*1000,
}={}){
 if(!blob||typeof blob.get!=="function"||typeof blob.setJSON!=="function"||typeof blob.delete!=="function")
  throw new Error("EdgeOne Blob persistence required");
 const keyFor=async token=>"pat-session:"+await sha256Base64Url(token);
 const validToken=token=>typeof token==="string"&&/^[A-Za-z0-9_-]{32,}$/.test(token);
 return {
  async createSession({login,userId}){
   if(typeof login!=="string"||login.toLowerCase()!==adminLogin.toLowerCase()||
      !Number.isSafeInteger(userId)||userId<=0)throw Error("Admin identity mismatch");
   const token=randomOpaque(48),expiresAt=clock()+ttlMs;
   await blob.setJSON(await keyFor(token),{login,userId,expiresAt});
   return {token,expiresAt};
  },
  async verifySession(token){
   if(!validToken(token))return null;
   const entry=await blob.get(await keyFor(token),{type:"json",consistency:"strong"});
   if(!entry||typeof entry.login!=="string"||entry.login.toLowerCase()!==adminLogin.toLowerCase()||
     !Number.isSafeInteger(entry.userId)||entry.userId<=0)return null;
   if(!Number.isFinite(entry.expiresAt)||entry.expiresAt<=clock())return null;
   return {login:entry.login,userId:entry.userId,expiresAt:entry.expiresAt};
  },
  async revokeSession(token){
   if(validToken(token))await blob.delete(await keyFor(token));
  },
 };
}
