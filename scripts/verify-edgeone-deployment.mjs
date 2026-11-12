import {strict as assert} from 'node:assert';
import {randomBytes} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
const root='.edgeone';
const config=JSON.parse(await readFile(root+'/cloud-functions/api-node/config.json','utf8'));
assert.equal(config.version,3);
for(const route of [
 '/api/admin/auth/start','/api/admin/auth/me','/api/admin/auth/logout',
 '/api/firefly/session','/api/friend-circle.json','/api/cron/friend-circle',
 '/api/firefly/content','/api/firefly/preview','/api/firefly/settings',
 '/api/firefly/gallery','/api/firefly/imagebed','/api/firefly/backup',
 '/api/firefly/activity','/api/firefly/search','/api/firefly/visibility',
 '/api/firefly/dynamic-feed','/api/firefly/dynamic-feed-public',
 '/api/firefly/capabilities','/api/gallery-public',
 '/api/gallery-image','/api/admin-content-index.json','/api/admin/private-index',
 '/api/live-content/index','/api/live-content/item','/api/live-content/history',
 '/api/live-content/export','/api/live-content/restore','/api/live-content/undo-delete',
 '/api/dynamic.json',
 '/api/imagebed/upload','/api/imagebed/list','/api/imagebed/delete'
])assert(config.routes.some(entry=>entry.dest===route),'Missing EdgeOne build-output route: '+route);
assert(config.routes.some(entry=>entry.dest==='/file/:path'),'Missing EdgeOne build-output route: /file/:path');
assert(config.routes.some(entry=>entry.dest==='/posts/:slug'),'Missing EdgeOne build-output route: /posts/:slug');
const {onRequest}=await import('../.edgeone/cloud-functions/api-node/index.mjs');
const site='https://firefly-preview.example';
const env={FIREFLY_ADMIN_PASSWORD:'local-test-password',FIREFLY_ADMIN_SESSION_KEY:randomBytes(48).toString('hex')};
async function call(path,options={},extra={}){return onRequest({request:new Request(site+path,options),env:{...env,...extra}})}
const form=await call('/api/admin/auth/start');
assert.equal(form.status,200,'EdgeOne builder index must route auth start');
const body=await form.text();
assert(body.includes('type="password"'),'Original admin should open password form');
assert(!body.includes(env.FIREFLY_ADMIN_PASSWORD),'Password must never appear in delivered HTML');
const me=await call('/api/admin/auth/me');
assert.equal(me.status,200);
assert.equal((await me.json()).authenticated,false);
const denied=await call('/api/admin/auth/start',{method:'POST',headers:{origin:site,'content-type':'application/x-www-form-urlencoded','x-real-ip':'192.0.2.11'},body:'password=nope'});
assert.equal(denied.status,401);
const passed=await call('/api/admin/auth/start',{method:'POST',headers:{origin:site,'content-type':'application/x-www-form-urlencoded','x-real-ip':'192.0.2.12'},body:'password=local-test-password'});
assert.equal(passed.status,303);assert.equal(passed.headers.get('location'),'/admin/');
const cookie=passed.headers.get('set-cookie');
assert(cookie?.includes('HttpOnly')&&cookie.includes('Secure'));
const session=await call('/api/admin/auth/me',{headers:{cookie:cookie.split(';')[0]}});
assert.equal((await session.json()).authenticated,true);
const friend=await call('/api/friend-circle.json');
assert.equal(friend.status,200);
assert((await friend.json()).article_data.length>=50);
const capabilitiesResponse=await call('/api/firefly/capabilities');
assert.equal(capabilitiesResponse.status,200);
const capabilitiesBody=await capabilitiesResponse.json();
assert.equal(capabilitiesBody.writes,false,'CMS writes must stay disabled for anonymous clients');
const authedCapabilitiesResponse=await call('/api/firefly/capabilities',{headers:{cookie:cookie.split(';')[0]}});
assert.equal((await authedCapabilitiesResponse.json()).writes,true,'Authenticated CMS writes enabled on EdgeOne');
assert.equal((await call('/api/live-content/item')).status,401,'Legacy item detail must require a session');
const runtimePost=await call('/posts/runtime-only/');
assert.notEqual(runtimePost.status,404,'Runtime /posts/:slug route must be registered');
assert.equal(runtimePost.status,503,'Runtime post must fail closed while Blob storage is unavailable');
assert.equal((await call('/api/admin-content-index.json')).status,401,'Recovered admin index must require a session');
assert.equal((await call('/api/admin/private-index')).status,401,'Private index must require a session');
const invalidFile=await call('/file/test*bad!key');
assert.equal(invalidFile.status,400,'File delivery rejects invalid characters');
const postFile=await call('/file/test.webp',{method:'POST'});
assert.equal(postFile.status,405,'File delivery allows only GET/HEAD');
const logout=await call('/api/admin/auth/logout',{method:'POST',headers:{origin:site}});
assert.equal(logout.status,200);
for(const path of ['index.html','admin/index.html','friends/index.html','_astro/AdminApp.FireflyEdgeOne.js']){
 assert((await stat(root+'/assets/'+path)).size>1000,'Missing static output: '+path);
}
console.log('EDGEONE_OUTPUT_V3_VERIFIED: '+config.routes.length+' routable APIs; login 401/303, session, logout, friend feed, read-only capabilities, session-gated legacy/admin indexes and original assets');
