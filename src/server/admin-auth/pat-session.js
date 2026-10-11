import { adminSessionCookie, clearAdminSessionCookie } from "./oauth-core.js";
import { readAdminSessionId } from "./controller.js";

// A GitHub fine-grained PAT is sent once over same-origin HTTPS to exchange for
// an HttpOnly admin session. Never persist it in the server's Blob store.
const ORIGIN = "https://blog.casto.top";
const REPOSITORY = "SteveGuo1726/Firefly";
const ADMIN = "SteveGuo1726";
function json(value, status=200, headers={}) {
 return new Response(JSON.stringify(value), {
  status, headers: {
   "Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"private, no-store",
   "Referrer-Policy":"no-referrer",
   "X-Content-Type-Options":"nosniff",...headers,
  },
 });
}
function allowed(request) {
 const url=new URL(request.url);
 return url.origin===ORIGIN && request.headers.get("Origin")===ORIGIN;
}
export function createPatSessionController({sessions,fetcher=fetch}={}) {
 if(!sessions)throw new Error("Admin session service required");
 return {
  async login(request) {
   if(request.method!=="POST")return json({error:"Method Not Allowed"},405);
   if(!allowed(request))return json({error:"Forbidden"},403);
   if(!/^application\/json\b/i.test(request.headers.get("Content-Type")||""))
    return json({error:"JSON content type required"},415);
   const body=await request.text();
   if(body.length>2048)return json({error:"Invalid credentials"},400);
   let token;
   try{token=JSON.parse(body)?.token?.trim();}catch{}
   if(typeof token!=="string"||!/^(?:github_pat_|ghp_)[A-Za-z0-9_]{20,500}$/.test(token))
    return json({error:"Invalid GitHub token"},400);
   const headers={
    Authorization:"Bearer "+token,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"Firefly-EdgeOne-Admin",
   };
   const userResponse=await fetcher("https://api.github.com/user",{
    headers,signal:AbortSignal.timeout(10000),cache:"no-store",
   });
   if(!userResponse.ok)return json({error:"GitHub identity verification failed"},403);
   const user=await userResponse.json();
   if(String(user?.login||"").toLowerCase()!==ADMIN.toLowerCase()||
      !Number.isSafeInteger(user?.id)||user.id<=0)
    return json({error:"Account is not authorized"},403);
   const repoResponse=await fetcher("https://api.github.com/repos/"+REPOSITORY,{
    headers,signal:AbortSignal.timeout(10000),cache:"no-store",
   });
   if(!repoResponse.ok)return json({error:"GitHub repository verification failed"},403);
   const repo=await repoResponse.json();
   if(repo?.permissions?.push!==true)
    return json({error:"Repository Contents write permission required"},403);
   const session=await sessions.createSession({login:user.login,userId:user.id});
   return json({authenticated:true,user:{login:user.login,userId:user.id}},200,{
    "Set-Cookie":adminSessionCookie(session.token),
   });
  },
  async me(request) {
   if(request.method!=="GET")return json({error:"Method Not Allowed"},405);
   const user=await sessions.verifySession(readAdminSessionId(request));
   return json({authenticated:Boolean(user),user:user?{login:user.login,userId:user.userId}:null},200,{
    "X-Firefly-OAuth":"disabled",
   });
  },
  async logout(request) {
   if(request.method!=="POST")return json({error:"Method Not Allowed"},405);
   if(!allowed(request))return json({error:"Forbidden"},403);
   await sessions.revokeSession(readAdminSessionId(request));
   return json({ok:true},200,{"Set-Cookie":clearAdminSessionCookie()});
  },
 };
}
