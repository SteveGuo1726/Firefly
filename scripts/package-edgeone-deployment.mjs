/**
 * EdgeOne Makers Build Output API v3.
 *
 * IMPORTANT: a Node route file copied to dist/cloud-functions/api is NOT an
 * api-node Build Output API bundle, so the prior deployment returned 404.
 * EdgeOne's recognized artifact is .edgeone/cloud-functions/api-node/
 * alongside .edgeone/assets/.
 */
import {build} from 'esbuild';
import {cp,mkdir,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const target=resolve('.edgeone');
const assets=join(target,'assets');
const api=join(target,'cloud-functions','api-node');
await rm(target,{recursive:true,force:true});
await mkdir(assets,{recursive:true});
await mkdir(api,{recursive:true});
await cp('dist',assets,{recursive:true,filter:source=>!source.includes('/cloud-functions/')&&!source.endsWith('/cloud-functions')});
// Isolate API sources in the single supported index.mjs; no runtime imports
// from the working tree, pnpm workspace or Vercel sandbox.
const entries={
  '/api/admin/auth/start':'./cloud-functions/api/admin/auth/start.js',
  '/api/admin/auth/me':'./cloud-functions/api/admin/auth/me.js',
  '/api/admin/auth/logout':'./cloud-functions/api/admin/auth/logout.js',
  '/api/firefly/session':'./cloud-functions/api/firefly/session.js',
  '/api/firefly/content':'./cloud-functions/api/firefly/content.js',
  '/api/firefly/preview':'./cloud-functions/api/firefly/preview.js',
  '/api/firefly/settings':'./cloud-functions/api/firefly/settings.js',
  '/api/firefly/gallery':'./cloud-functions/api/firefly/gallery.js',
  '/api/firefly/imagebed':'./cloud-functions/api/firefly/imagebed.js',
  '/api/firefly/backup':'./cloud-functions/api/firefly/backup.js',
  '/api/firefly/activity':'./cloud-functions/api/firefly/activity.js',
  '/api/firefly/search':'./cloud-functions/api/firefly/search.js',
  '/api/firefly/visibility':'./cloud-functions/api/firefly/visibility.js',
  '/api/firefly/dynamic-feed':'./cloud-functions/api/firefly/dynamic-feed.js',
  '/api/firefly/dynamic-feed-public':'./cloud-functions/api/firefly/dynamic-feed-public.js',
  '/api/firefly/capabilities':'./cloud-functions/api/firefly/capabilities.js',
  '/api/admin-content-index.json':'./cloud-functions/api/admin-content-index.json.js',
  '/api/admin/private-index':'./cloud-functions/api/admin/private-index.js',
  '/api/live-content/index':'./cloud-functions/api/live-content.js',
  '/api/live-content/item':'./cloud-functions/api/live-content.js',
  '/api/live-content/export':'./cloud-functions/api/live-content.js',
  '/api/live-content/history':'./cloud-functions/api/live-content.js',
  '/api/live-content/restore':'./cloud-functions/api/live-content.js',
  '/api/live-content/undo-delete':'./cloud-functions/api/live-content.js',
  '/api/dynamic.json':'./cloud-functions/api/dynamic.json.js',
  '/api/gallery-public':'./cloud-functions/api/gallery-public.js',
  '/api/gallery-image':'./cloud-functions/api/gallery-image.js',
  '/api/friend-circle.json':'./cloud-functions/api/friend-circle.json.js',
  '/api/cron/friend-circle':'./cloud-functions/api/cron/friend-circle.js',
};
const imports=Object.values(entries).map((p,i)=>'import {onRequest as fn'+i+'} from '+JSON.stringify(p)+';').join('\n')+'\nimport {onRequest as postFn} from "./cloud-functions/posts/[[...slug]].js";\nimport {onRequest as fileFn} from "./cloud-functions/file/[[...path]].js";';
const dispatch=Object.keys(entries).map((p,i)=>'  '+JSON.stringify(p)+': fn'+i+',').join('\n');
const source=`${imports}
const routes={
${dispatch}
};
export async function onRequest(context){
 const path=new URL(context.request.url).pathname.replace(/\\/$/, '') || '/';
 const postMatch=path.match(/^\\/posts\\/([^/]+)\\/?$/);
 if(postMatch)return postFn({...context,params:{...(context.params||{}),slug:decodeURIComponent(postMatch[1])}});
 const fileMatch=path.match(/^\\/file\\/(.+)$/);
 if(fileMatch)return fileFn({...context,params:{...(context.params||{}),path:decodeURIComponent(fileMatch[1])}});
 const run=routes[path];
 if(!run)return new Response('Not Found',{status:404});
 return run(context);
}
export default onRequest;
`;
await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'firefly-api-node-router.mjs',loader:'js'},
 outfile:join(api,'index.mjs'),platform:'node',format:'esm',target:'node20',bundle:true,legalComments:'none',logLevel:'warning'});
const config={version:3,routes:[...Object.keys(entries).map(path=>({src:'^'+path.replaceAll('.','\\.')+'/?$',dest:path})),
 {src:'^/posts/([^/]+)/?$',dest:'/posts/:slug'},
 {src:'^/file/(.+)$',dest:'/file/:path'}]};
await writeFile(join(api,'config.json'),JSON.stringify(config,null,2)+'\n');
if((await stat(join(api,'index.mjs'))).size<8000)throw Error('Missing full API Node bundle');
for(const file of ['index.html','admin/index.html','friends/index.html']){
 if((await stat(join(assets,file)).catch(()=>({size:0}))).size<1000)throw Error('Original static output missing: '+file);
}
console.log('EDGEONE_OUTPUT_V3: '+config.routes.length+' registered API routes (including runtime /posts/:slug); static assets + api-node bundle');
