import {getStore} from "@edgeone/pages-blob";
import {edgeOneAtomicAuthStore,assertEdgeOneAtomicWrites} from "./edgeone-store.js";
import {createAdminSessionService} from "./session-service.js";
import {readAdminSessionId} from "./controller.js";

let cachedBlob=null;
const routes=new Set([
 "/api/admin/gallery/state",
 "/api/admin/gallery/manifest",
 "/api/admin/gallery/delete-album",
 "/api/admin/imagebed/list",
 "/api/admin/imagebed/upload",
 "/api/admin/imagebed/delete",
 "/api/admin/imagebed/rename",
 "/api/admin/gallery/rename-album",
]);
const allowedMethods=new Set(["GET","POST","PUT"]);

export async function proxyGalleryManagement(request,{env=process.env,fetcher=fetch,storeFactory=()=>cachedBlob||(cachedBlob=getStore({name:"firefly-auth-live",consistency:"strong"}))}={}){
 const url=new URL(request.url);
 if(!routes.has(url.pathname)||!allowedMethods.has(request.method))return new Response("Not Found",{status:404});
 if(request.method!=="GET"&&request.headers.get("Origin")!==url.origin){
  return new Response("Forbidden",{status:403});
 }
 if(!env.FIREFLY_OAUTH_CLIENT_ID||!env.FIREFLY_OAUTH_CLIENT_SECRET||!env.FIREFLY_OAUTH_CALLBACK_URL ||
    !env.FIREFLY_GALLERY_SERVICE_SECRET||env.FIREFLY_GALLERY_SERVICE_SECRET.length<32){
  return new Response("OAuth gallery proxy is not configured",{status:503});
 }
 const raw=storeFactory();
 await assertEdgeOneAtomicWrites(raw);
 const sessionStore=edgeOneAtomicAuthStore(raw);
 const service=createAdminSessionService({store:sessionStore,adminLogin:env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726"});
 const identity=await service.verifySession(readAdminSessionId(request));
 if(!identity)return new Response("Unauthorized",{status:401});
 const upstreamBase=new URL(env.FIREFLY_GALLERY_API_ORIGIN||"https://gallery-api.casto.top");
 if(upstreamBase.protocol!=="https:"||upstreamBase.username||upstreamBase.password||upstreamBase.search||upstreamBase.hash){
  return new Response("Invalid gallery API configuration",{status:503});
 }
 const upstream=new URL(url.pathname+url.search,upstreamBase);
 const headers=new Headers();
 const contentType=request.headers.get("Content-Type");
 if(contentType)headers.set("Content-Type",contentType);
 // This is server-to-server. Browser Origin is verified above and never forwarded.
 headers.set("X-Firefly-Service-Key",env.FIREFLY_GALLERY_SERVICE_SECRET);
 const response=await fetcher(upstream.toString(),{
  method:request.method,headers,
  body:request.method==="GET"?undefined:request.body,
  ...(request.method==="GET"?{}:{duplex:"half"}),
  redirect:"manual",
 });
 // Do not propagate redirects, Set-Cookie, CORS or provider authentication data.
 if(response.status>=300&&response.status<400)return new Response("Gallery proxy redirect refused",{status:502});
 const resultHeaders=new Headers({
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
 });
 resultHeaders.set("Content-Type",response.headers.get("Content-Type")||"application/json; charset=utf-8");
 return new Response(response.body,{status:response.status,headers:resultHeaders});
}
