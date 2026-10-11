/** Server-only GitHub OAuth primitives. No frontend imports, no persistent token storage.
 * This does NOT activate OAuth without server endpoints and configured secrets.
 */
const encoder = new TextEncoder();
const bytesToBase64Url = (bytes) => {
 let binary="";
 for(const byte of bytes) binary+=String.fromCharCode(byte);
 return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
};
export function randomOpaque(length=32){
 if(!Number.isInteger(length)||length<16||length>128)throw new Error("Invalid nonce size");
 const bytes=new Uint8Array(length);
 crypto.getRandomValues(bytes);
 return bytesToBase64Url(bytes);
}
export async function sha256Base64Url(value){
 const buffer=await crypto.subtle.digest("SHA-256",encoder.encode(value));
 return bytesToBase64Url(new Uint8Array(buffer));
}
export async function newAuthorizationTransaction(){
 const verifier=randomOpaque(48);
 return {state:randomOpaque(32),verifier,challenge:await sha256Base64Url(verifier)};
}
function checkHttps(url,{allowLocalhost=false}={}){
 const value=new URL(url);
 if(value.username||value.password||value.hash)throw new Error("Invalid OAuth callback URL");
 if(value.protocol!=="https:"&&!(allowLocalhost&&value.protocol==="http:"&&["localhost","127.0.0.1"].includes(value.hostname))){
  throw new Error("OAuth callback must use HTTPS");
 }
 return value.toString();
}
export function githubAuthorizationUrl({clientId,redirectUri,state,scope="",codeChallenge="",allowLocalhost=false}){
 if(!clientId||!state)throw new Error("Missing OAuth client or state");
 const redirect=checkHttps(redirectUri,{allowLocalhost});
 const target=new URL("https://github.com/login/oauth/authorize");
 target.searchParams.set("client_id",clientId);
 target.searchParams.set("redirect_uri",redirect);
 target.searchParams.set("state",state);
 if(scope)target.searchParams.set("scope",scope);
 if(codeChallenge){
  if(!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))throw new Error("Invalid PKCE S256 challenge");
  target.searchParams.set("code_challenge",codeChallenge);
  target.searchParams.set("code_challenge_method","S256");
 }
 return target.toString();
}
export function constantTimeEqual(a,b){
 if(typeof a!=="string"||typeof b!=="string")return false;
 const left=encoder.encode(a),right=encoder.encode(b);
 let mismatch=left.length^right.length;
 for(let i=0;i<Math.max(left.length,right.length);i++)mismatch|=(left[i]||0)^(right[i]||0);
 return mismatch===0;
}
export function validateOAuthCallback({expectedState,receivedState,issuedAt,now=Date.now(),maxAgeMs=5*60*1000}){
 if(!expectedState||!receivedState||!constantTimeEqual(expectedState,receivedState))return false;
 return Number.isFinite(issuedAt)&&issuedAt<=now&&now-issuedAt<=maxAgeMs;
}
export async function exchangeGitHubCode({clientId,clientSecret,code,redirectUri,codeVerifier="",fetcher=fetch,signal}){
 if(!clientId||!clientSecret||!code)throw new Error("OAuth code exchange configuration incomplete");
 checkHttps(redirectUri,{allowLocalhost:true});
 if(codeVerifier && !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier))throw new Error("Invalid PKCE verifier");
 const response=await fetcher("https://github.com/login/oauth/access_token",{
  method:"POST",signal,
  headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirectUri,...(codeVerifier?{code_verifier:codeVerifier}:{})}),
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||typeof payload.access_token!=="string"||!payload.access_token){
  throw new Error("GitHub OAuth token exchange failed");
 }
 return {accessToken:payload.access_token,scope:String(payload.scope||""),tokenType:String(payload.token_type||"")};
}
export function adminSessionCookie(sessionId,{maxAge=8*60*60}={}){
 if(!/^[A-Za-z0-9_-]{32,}$/.test(sessionId))throw new Error("Invalid session id");
 return `__Host-firefly-admin=${sessionId}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearAdminSessionCookie=()=> "__Host-firefly-admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
