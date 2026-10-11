import {getStore} from "@edgeone/pages-blob";
import {edgeOneAtomicAuthStore,assertEdgeOneAtomicWrites} from "../../../../src/server/admin-auth/edgeone-store.js";
import {createAdminSessionService} from "../../../../src/server/admin-auth/session-service.js";
import {createGitHubAdminAuthController} from "../../../../src/server/admin-auth/controller.js";
import {createPatSessionController} from "../../../../src/server/admin-auth/pat-session.js";

let cachedAuthBlob=null;

/**
 * Production accepts a one-time same-origin PAT-to-HttpOnly-session exchange.
 * OAuth only starts when its server secrets and exact HTTPS callback are supplied.
 * Never persist the submitted PAT in server-side storage.
 */
export default async function onRequest(context){
 const request=context.request;
 const clientId=process.env.FIREFLY_OAUTH_CLIENT_ID||"";
 const clientSecret=process.env.FIREFLY_OAUTH_CLIENT_SECRET||"";
 const callbackUrl=process.env.FIREFLY_OAUTH_CALLBACK_URL||"";
 try{
  const raw=cachedAuthBlob||(cachedAuthBlob=getStore({name:"firefly-auth-live",consistency:"strong"}));
  await assertEdgeOneAtomicWrites(raw);
  const store=edgeOneAtomicAuthStore(raw);
  const sessions=createAdminSessionService({store,adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726"});
  const pathname=new URL(request.url).pathname;
  const pat=createPatSessionController({sessions});
  if(pathname==="/api/admin/auth/pat-login")return pat.login(request);
  const oauthReady=Boolean(clientId&&clientSecret&&callbackUrl);
  if(pathname==="/api/admin/auth/me" && !oauthReady)return pat.me(request);
  if(pathname==="/api/admin/auth/logout" && !oauthReady)return pat.logout(request);
  if(!oauthReady)return new Response(JSON.stringify({error:"GitHub OAuth is not configured"}),{
   status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
  });
  const auth=createGitHubAdminAuthController({clientId,clientSecret,callbackUrl,sessionService:sessions});
  if(pathname==="/api/admin/auth/start" && request.method==="GET")return auth.start(request);
  if(pathname==="/api/admin/auth/callback" && request.method==="GET")return auth.callback(request);
  if(pathname==="/api/admin/auth/me" && request.method==="GET")return auth.me(request);
  if(pathname==="/api/admin/auth/logout" && request.method==="POST")return auth.logout(request);
  return new Response("Not Found",{status:404,headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("[Firefly OAuth] request failed",error instanceof Error?error.name:"Error");
  return new Response("Authentication unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
