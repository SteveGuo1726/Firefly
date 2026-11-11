import{build}from'esbuild';
import{mkdir,stat,readFile,writeFile}from'node:fs/promises';
import{join}from'node:path';
const out='dist/cloud-functions/api';
await mkdir(join(out,'admin/auth'),{recursive:true});
await build({
 entryPoints:{
  'admin/auth/me':'cloud-functions/api/admin/auth/me.js',
  'admin/auth/start':'cloud-functions/api/admin/auth/start.js',
  'admin/auth/logout':'cloud-functions/api/admin/auth/logout.js',
  'firefly/session':'cloud-functions/api/firefly/session.js'
 },
 outdir:out,platform:'node',format:'esm',target:'node20',bundle:true,logLevel:'warning'
});
for(const path of ['admin/auth/me.js','admin/auth/start.js','admin/auth/logout.js','firefly/session.js']){
 if((await stat(join(out,path)).catch(()=>({size:0}))).size<200)throw Error('EdgeOne admin auth route missing: '+path);
}
const original='dist/_astro/AdminApp.BvivyVgR.js';
let js=await readFile(original,'utf8');
const before='e(q)?.oauth||typeof window<"u"&&window.location.hostname==="blog.casto.top"';
if(!js.includes(before))throw Error('Original AdminApp login guard changed. Refusing fragile patch.');
js=js.replace(before,'e(q)?.oauth||typeof window<"u"');
 // On EdgeOne preview hosts show the original six admin modules without
// password. This is UI-only: no privileged cookie or GitHub token is issued.
const hdr='B(){t(q,et()),e(q)||t(G,!1)}';
const main='g(){t(h,et()),N()}';
const oldPreview='t(B,Q.has(window.location.hostname))';
for(const required of [hdr,main,oldPreview])if(!js.includes(required))throw Error('Original admin runtime changed: '+required);
js=js.replace(hdr,'B(){t(q,fireflyDisplaySession()),e(q)||t(G,!1)}');
js=js.replace(main,'g(){t(h,fireflyDisplaySession()),N()}');
js=js.replace(oldPreview,'t(B,!fireflyIsPreview()&&Q.has(window.location.hostname))');
js=js.replaceAll('we()','fireflySessionProbe()');
js+=`
function fireflyIsPreview(){
 if(typeof window==="undefined")return false;
 const host=window.location.hostname.toLowerCase();
 return host.endsWith(".edgeone.cool")||host.endsWith(".edgeone.dev")||host.endsWith(".edgeone.site")||host.endsWith(".pages.dnsoe5.com")||host.endsWith(".vercel.run")||host==="localhost"||host==="127.0.0.1"||host.endsWith(".localhost");
}
function fireflyDisplaySession(){
 if(!fireflyIsPreview())return et();
 return {login:"Preview",name:"Firefly 只读预览",avatarUrl:"",
 owner:Ye.owner,repo:Ye.repo,branch:Ye.branch,token:"",
 oauth:false,expiresAt:Date.now()+3600000,previewOnly:true};
}
function fireflySessionProbe(){return fireflyIsPreview()?Promise.resolve(null):we();}
`;
const output='AdminApp.FireflyEdgeOne.js';
await writeFile('dist/_astro/'+output,js);
const originalHtml='dist/admin/index.html';
let html=await readFile(originalHtml,'utf8');
if(!html.includes('AdminApp.BvivyVgR.js')&&!html.includes(output))throw Error('Original admin HTML no longer references expected application');
html=html.replaceAll('AdminApp.BvivyVgR.js',output);
await writeFile(originalHtml,html);
console.log('EDGEONE_ADMIN_ENTRY_RESTORED: 4 auth functions, original AdminApp OAuth probe and static page');
