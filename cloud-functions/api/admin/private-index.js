import {getStore} from "@edgeone/pages-blob";
import {edgeOneAtomicAuthStore,assertEdgeOneAtomicWrites} from "../../../src/server/admin-auth/edgeone-store.js";
import {createAdminSessionService} from "../../../src/server/admin-auth/session-service.js";
import {createPatBlobSessions} from "../../../src/server/admin-auth/pat-session-store.js";
import {buildPrivatePostIndex} from "../../../src/server/admin-auth/private-index.js";
export default async function onRequest(context){
 const request=context.request;
 if(request.method!=="GET")return new Response("Method Not Allowed",{status:405});
 const origin=request.headers.get("Origin");
 if(origin&&origin!==new URL(request.url).origin)return new Response("Forbidden",{status:403});
 const token=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("__Host-firefly-admin="))?.split("=")[1]||"";
 try{
  const blob=getStore({name:"firefly-auth-live",consistency:"strong"});
  const pat=createPatBlobSessions({blob,adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726"});
  let user=await pat.verifySession(token);
  if(!user && process.env.FIREFLY_OAUTH_CLIENT_ID && process.env.FIREFLY_OAUTH_CLIENT_SECRET && process.env.FIREFLY_OAUTH_CALLBACK_URL){
   await assertEdgeOneAtomicWrites(blob);
   const sessions=createAdminSessionService({store:edgeOneAtomicAuthStore(blob),adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726"});
   user=await sessions.verifySession(token);
  }
  if(!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{"Cache-Control":"no-store","Content-Type":"application/json"}});
  const owner=process.env.FIREFLY_GITHUB_OWNER||"SteveGuo1726";
  const repo=process.env.FIREFLY_GITHUB_REPO||"Firefly";
  const branch=process.env.FIREFLY_GITHUB_BRANCH||"master";
  const githubToken=process.env.FIREFLY_GITHUB_CONTENT_READ_TOKEN||"";
  const result=await buildPrivatePostIndex({token:githubToken,owner,repo,branch});
  return new Response(JSON.stringify(result),{headers:{"Cache-Control":"private, no-store","Content-Type":"application/json","Vary":"Cookie"}});
 }catch(error){
  console.error("[Firefly private index]",error);
  return new Response(JSON.stringify({error:"Private content index unavailable"}),{status:503,headers:{"Cache-Control":"no-store","Content-Type":"application/json"}});
 }
}
