import assert from "node:assert/strict";
import test from "node:test";
import {
 newAuthorizationTransaction,githubAuthorizationUrl,validateOAuthCallback,
 exchangeGitHubCode,adminSessionCookie,clearAdminSessionCookie,constantTimeEqual,
} from "../src/server/admin-auth/oauth-core.js";

test("OAuth state and nonce are unpredictable and unique",async()=>{
 const a=await newAuthorizationTransaction(),b=await newAuthorizationTransaction();
 assert.notEqual(a.state,b.state);
 assert.notEqual(a.verifier,b.verifier);
 assert.match(a.challenge,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(a.state.length>=32);
});
test("GitHub OAuth URL rejects insecure remote redirect and uses exact state",()=>{
 assert.throws(()=>githubAuthorizationUrl({clientId:"abc",state:"nonce",redirectUri:"http://evil.test/callback"}),/HTTPS/);
 const url=new URL(githubAuthorizationUrl({clientId:"abc",state:"nonce",redirectUri:"https://admin.example.com/callback"}));
 assert.equal(url.hostname,"github.com");
 assert.equal(url.searchParams.get("state"),"nonce");
 assert.equal(url.searchParams.get("redirect_uri"),"https://admin.example.com/callback");
});
test("OAuth callback rejects mismatched stale and future transactions",()=>{
 const now=Date.now();
 assert.equal(validateOAuthCallback({expectedState:"a",receivedState:"a",issuedAt:now-60000,now}),true);
 assert.equal(validateOAuthCallback({expectedState:"a",receivedState:"b",issuedAt:now,now}),false);
 assert.equal(validateOAuthCallback({expectedState:"a",receivedState:"a",issuedAt:now-999999,now}),false);
 assert.equal(validateOAuthCallback({expectedState:"a",receivedState:"a",issuedAt:now+999,now}),false);
 assert.equal(constantTimeEqual("a","ab"),false);
});
test("GitHub code exchange is server-side and never returns a cookie bearer",async()=>{
 let seen;
 const exchange=await exchangeGitHubCode({
  clientId:"id",clientSecret:"secret",code:"code",redirectUri:"https://admin.example.com/callback",
  fetcher:async(url,init)=>{
   seen={url,init};
   return new Response(JSON.stringify({access_token:"private",scope:"read:user",token_type:"bearer"}),{status:200});
  },
 });
 assert.equal(exchange.accessToken,"private");
 assert.equal(seen.url,"https://github.com/login/oauth/access_token");
 assert.match(seen.init.body.toString(),/client_secret=secret/);
 const cookie=adminSessionCookie("A".repeat(48));
 assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
 assert.doesNotMatch(cookie,/private|secret/);
 assert.match(clearAdminSessionCookie(),/Max-Age=0/);
});
test("OAuth exchange refuses GitHub error responses and missing code",async()=>{
 await assert.rejects(exchangeGitHubCode({clientId:"a",clientSecret:"b",code:"",redirectUri:"https://a.test/cb"}),/incomplete/);
 await assert.rejects(exchangeGitHubCode({
  clientId:"a",clientSecret:"b",code:"c",redirectUri:"https://a.test/cb",
  fetcher:async()=>new Response(JSON.stringify({error:"bad_verification_code"}),{status:200}),
 }),/failed/);
 assert.throws(()=>adminSessionCookie("short"),/Invalid session/);
});
