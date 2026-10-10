/**
 * Preview-only, server-side password session. This must never be mounted on
 * production Worker routes or used to authenticate production storage.
 */
const COOKIE = "__Host-firefly-admin";
const SESSION_SECONDS = 2 * 60 * 60;
const LOGIN_ATTEMPT_WINDOW = 15 * 60;
const MAX_ATTEMPTS = 6;
const enc = new TextEncoder();

function response(data, status = 200, extra = {}) {
 return new Response(JSON.stringify(data), {
  status, headers: {
   "Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer",
   ...extra,
  },
 });
}
export function correctPreviewRequestOrigin(request) {
 try {
  const expected=new URL(request.url).origin;
  const origin=request.headers.get("Origin");
  // An explicit cross-origin Origin is never permitted.
  if(origin && origin!=="null")return origin===expected;
  // Some embedded browsers and privacy extensions omit Origin or send "null".
  // Accept only when both Fetch Metadata and Referer prove same-origin.
  if(request.headers.get("Sec-Fetch-Site")!=="same-origin")return false;
  const referer=request.headers.get("Referer");
  return Boolean(referer && new URL(referer).origin===expected);
 } catch {return false;}
}
function cookieValue(request) {
 return (request.headers.get("Cookie") || "")
  .split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1) || "";
}
function base64Url(bytes) {
 let raw="";
 for(const value of bytes)raw+=String.fromCharCode(value);
 return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function base64UrlDecode(value) {
 if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
 try {
  const padded=value.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(padded+"=".repeat((4-padded.length%4)%4)),c=>c.charCodeAt(0));
 } catch { return null; }
}
async function sessionKey(env) {
 const secret=env?.FIREFLY_PREVIEW_SESSION_KEY;
 if(typeof secret!=="string" || secret.length < 32)return null;
 return crypto.subtle.importKey("raw",enc.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
function isConfigured(env) {
 return typeof env?.FIREFLY_PREVIEW_ADMIN_PASSWORD==="string" &&
  env.FIREFLY_PREVIEW_ADMIN_PASSWORD.length>=10;
}
async function fixedTimeMatch(a,b) {
 const [ha,hb]=await Promise.all([a,b].map(x=>crypto.subtle.digest("SHA-256",enc.encode(x))));
 const left=new Uint8Array(ha),right=new Uint8Array(hb);
 let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
async function attemptKey(request) {
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const data=await crypto.subtle.digest("SHA-256",enc.encode(ip));
 return "preview-admin/login-attempts/"+base64Url(new Uint8Array(data)).slice(0,24);
}
async function issueSession(env) {
 const key=await sessionKey(env);
 if(!key)return null;
 const exp=Math.floor(Date.now()/1000)+SESSION_SECONDS;
 const random=base64Url(crypto.getRandomValues(new Uint8Array(16)));
 const data="v1."+exp+"."+random;
 const sig=base64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(data))));
 return data+"."+sig;
}
export async function authorizePreviewSession(request,env) {
 if(!isConfigured(env))return {ok:false};
 const key=await sessionKey(env);
 if(!key)return {ok:false};
 const raw=cookieValue(request);
 const match=/^(v1)\.(\d{10})\.([a-zA-Z0-9_-]{20,24})\.([a-zA-Z0-9_-]{40,48})$/.exec(raw);
 if(!match)return {ok:false};
 const expiry=Number(match[2]),now=Math.floor(Date.now()/1000);
 if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+SESSION_SECONDS)return {ok:false};
 const signature=base64UrlDecode(match[4]);
 if(!signature)return {ok:false};
 const ok=await crypto.subtle.verify("HMAC",key,signature,enc.encode(match[1]+"."+match[2]+"."+match[3]));
 return ok?{ok:true,login:"SteveGuo1726",preview:true}:{ok:false};
}
export async function previewLogin(request,env) {
 if(request.method!=="POST")return response({error:"Method Not Allowed"},405,{Allow:"POST"});
 if(!correctPreviewRequestOrigin(request))return response({error:"请求来源无效。"},403);
 if(!isConfigured(env)||!(await sessionKey(env))||!env?.LIVE_CONTENT_PREVIEW) {
  return response({error:"预览管理登录未配置。"},503);
 }
 if(Number(request.headers.get("Content-Length")||0)>512)return response({error:"请求过大。"},413);
 const key=await attemptKey(request);
 try {
  const record=JSON.parse(await env.LIVE_CONTENT_PREVIEW.get(key)||"null") || {count:0};
  if(record.count>=MAX_ATTEMPTS)return response({error:"登录尝试过多，请稍后再试。"},429,{"Retry-After":"900"});
  const body=await request.json().catch(()=>null);
  const submitted=typeof body?.password==="string"&&body.password.length<=100?body.password:"";
  if(!await fixedTimeMatch(submitted,env.FIREFLY_PREVIEW_ADMIN_PASSWORD)) {
   await env.LIVE_CONTENT_PREVIEW.put(key,JSON.stringify({count:record.count+1}),{expirationTtl:LOGIN_ATTEMPT_WINDOW});
   return response({error:"预览密码错误。"},401);
  }
  const token=await issueSession(env);
  if(!token)return response({error:"无法建立预览会话。"},503);
  await env.LIVE_CONTENT_PREVIEW.delete(key);
  return response({authenticated:true,scope:"preview-live-content"},200,{
   "Set-Cookie":COOKIE+"="+token+"; Path=/; Max-Age="+SESSION_SECONDS+"; HttpOnly; Secure; SameSite=Strict",
  });
 } catch {return response({error:"登录服务暂时不可用。"},503);}
}
export async function previewMe(request,env) {
 if(request.method!=="GET")return response({error:"Method Not Allowed"},405,{Allow:"GET"});
 const valid=await authorizePreviewSession(request,env);
 return response(valid.ok?{
  authenticated:true,user:{login:"SteveGuo1726"},scope:"preview-live-content"
 }:{authenticated:false});
}
export async function previewLogout(request) {
 if(request.method!=="POST")return response({error:"Method Not Allowed"},405,{Allow:"POST"});
 if(!correctPreviewRequestOrigin(request))return response({error:"请求来源无效。"},403);
 return response({authenticated:false},200,{
  "Set-Cookie":COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
 });
}
export function previewMutationOriginAllowed(request) {
 const method=request.method.toUpperCase();
 return !["POST","PUT","PATCH","DELETE"].includes(method)||correctPreviewRequestOrigin(request);
}
