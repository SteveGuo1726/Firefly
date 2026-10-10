import {getStore} from "@edgeone/pages-blob";
import {edgeOneAtomicAuthStore,assertEdgeOneAtomicWrites} from "../../../../src/server/admin-auth/edgeone-store.js";
import {createAdminSessionService} from "../../../../src/server/admin-auth/session-service.js";
import {createGitHubAdminAuthController} from "../../../../src/server/admin-auth/controller.js";

/**
 * Explicitly disabled until OAuth server secrets and an exact HTTPS callback
 * are supplied. This route never reads GitHub PATs from browser storage.
 */
export default async function onRequest(context){
 const request=context.request;
 const clientId=process.env.FIREFLY_OAUTH_CLIENT_ID||"";
 const clientSecret=process.env.FIREFLY_OAUTH_CLIENT_SECRET||"";
 const callbackUrl=process.env.FIREFLY_OAUTH_CALLBACK_URL||"";
 if(!clientId||!clientSecret||!callbackUrl){
  return new Response(JSON.stringify({error:"GitHub OAuth is not configured"}),{
   status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
  });
 }
 try{
  const raw=getStore({name:"firefly-auth-live",consistency:"strong"});
  await assertEdgeOneAtomicWrites(raw);
  const store=edgeOneAtomicAuthStore(raw);
  const sessions=createAdminSessionService({store,adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726"});
  const auth=createGitHubAdminAuthController({clientId,clientSecret,callbackUrl,sessionService:sessions});
  const pathname=new URL(request.url).pathname;
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
