import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=['public/index.html','public/assets/style.css','public/assets/app.js','public/assets/pixiv-feed.json'];
const [html,css,js,source]=await Promise.all(files.map(x=>fs.readFile(new URL(x,root),'utf8')));
const snap=JSON.parse(source);
if(!snap?.channels?.discover?.length)throw Error('Missing verified gallery snapshot');
const types={
 '/':{data:html,type:'text/html; charset=utf-8',ttl:60},
 '/index.html':{data:html,type:'text/html; charset=utf-8',ttl:60},
 '/assets/style.css':{data:css,type:'text/css; charset=utf-8',ttl:600},
 '/assets/app.js':{data:js,type:'application/javascript; charset=utf-8',ttl:600},
 '/assets/pixiv-feed.json':{data:source,type:'application/json; charset=utf-8',ttl:1800}
};
const src='const FILES='+JSON.stringify(types)+';\nconst WORKS='+JSON.stringify(Object.values(snap.channels).reduce((n,a)=>n+a.length,0))+';\n'+
`const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.pixiv.re https://i.pixiv.cat https://i.pximg.net https://i-cf.pximg.net https://i.pixiv.moe data:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export default {async fetch(req){const u=new URL(req.url);let path=u.pathname;const common={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':CSP};if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:common});if(path==='/health')return new Response(JSON.stringify({ok:true,service:'kira-jump-international-preview',version:'6.0',pixiv_snapshot_count:WORKS}),{headers:{...common,'Content-Type':'application/json','Cache-Control':'no-store'}});if(path==='/robots.txt')return new Response('User-agent: *\\nDisallow: /\\n',{headers:{...common,'Content-Type':'text/plain'}});const file=FILES[path];if(!file)return new Response('Not Found',{status:404,headers:common});return new Response(req.method==='HEAD'?null:file.data,{headers:{...common,'Content-Type':file.type,'Cache-Control':'public, max-age='+file.ttl}})}};`;
await fs.mkdir(new URL('preview/dist/',root),{recursive:true});
await fs.writeFile(new URL('preview/dist/index.mjs',root),src);
console.log('KIRA preview built',src.length,'bytes, 5 routes');
