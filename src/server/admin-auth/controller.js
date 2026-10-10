import {githubAuthorizationUrl,exchangeGitHubCode,adminSessionCookie,clearAdminSessionCookie} from "./oauth-core.js";

const cookieName="__Host-firefly-admin";
export function readAdminSessionId(request){
 const raw=request.headers.get("Cookie")||"";
 const cookie=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith(cookieName+"="));
 return cookie ? cookie.slice(cookieName.length+1) : "";
}
function noStore(response){
 response.headers.set("Cache-Control","no-store, private");
 response.headers.set("X-Content-Type-Options","nosniff");
 response.headers.set("Referrer-Policy","no-referrer");
 return response;
}
export function createGitHubAdminAuthController({
 clientId,clientSecret,callbackUrl,sessionService,allowedLogin="SteveGuo1726",fetcher=fetch
}){
 if(!clientId||!clientSecret||!callbackUrl||!sessionService)throw new Error("GitHub OAuth server configuration is required");
 const callback=new URL(callbackUrl);
 if(callback.protocol!=="https:" || callback.username || callback.password || callback.hash)throw new Error("HTTPS OAuth callback required");
 const origin=callback.origin;
 const redirect=(path,headers={})=>noStore(new Response(null,{status:303,headers:{Location:new URL(path,origin).toString(),...headers}}));
 const failure=()=>redirect("/admin/?auth=failed");
 return {
  async start(request){
   if(new URL(request.url).origin!==origin)return new Response("Origin mismatch",{status:403});
   const tx=await sessionService.createTransaction({redirectUri:callback.toString()});
   const authorize=githubAuthorizationUrl({
    clientId,redirectUri:callback.toString(),state:tx.state,scope:"read:user",codeChallenge:tx.challenge
   });
   return noStore(new Response(null,{status:302,headers:{Location:authorize}}));
  },
  async callback(request){
   const url=new URL(request.url);
   if(url.origin!==origin || url.pathname!==callback.pathname)return new Response("OAuth callback mismatch",{status:403});
   if(url.searchParams.has("error"))return failure();
   const state=url.searchParams.get("state"),code=url.searchParams.get("code");
   if(!state || !code || code.length>1024)return failure();
   const tx=await sessionService.consumeTransaction(state);
   if(!tx || tx.redirectUri!==callback.toString() || !tx.verifier)return failure();
   try{
    const result=await exchangeGitHubCode({
     clientId,clientSecret,code,redirectUri:callback.toString(),codeVerifier:tx.verifier,
     fetcher,signal:AbortSignal.timeout(10000)
    });
    const identityResponse=await fetcher("https://api.github.com/user",{
     headers:{Authorization:"Bearer "+result.accessToken,Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28"},
     signal:AbortSignal.timeout(10000),
    });
    if(!identityResponse.ok)return failure();
    const identity=await identityResponse.json();
    if(String(identity?.login||"").toLowerCase()!==allowedLogin.toLowerCase() ||
       !Number.isSafeInteger(identity.id) || identity.id<=0)return failure();
    const session=await sessionService.createSession({login:identity.login,userId:identity.id});
    return redirect("/admin/?auth=success",{"Set-Cookie":adminSessionCookie(session.token)});
   }catch{return failure();}
  },
  async me(request){
   const user=await sessionService.verifySession(readAdminSessionId(request));
   return noStore(new Response(JSON.stringify({authenticated:Boolean(user),user:user?{login:user.login,userId:user.userId}:null}),{
    status:200,headers:{"Content-Type":"application/json; charset=utf-8"}
   }));
  },
  async logout(request){
   if(request.method!=="POST")return new Response("Method Not Allowed",{status:405});
   if(request.headers.get("Origin")!==origin)return new Response("Forbidden",{status:403});
   await sessionService.revokeSession(readCookie(request));
   return redirect("/admin/?auth=logged-out",{"Set-Cookie":clearAdminSessionCookie()});
  },
 };
}
