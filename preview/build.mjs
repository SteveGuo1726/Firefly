import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const paths=['public/index.html','public/assets/style.css','public/assets/app.js','public/assets/pixiv-feed.json'];
const [html,css,js,feed]=await Promise.all(paths.map(p=>fs.readFile(new URL(p,root),'utf8')));
const snap=JSON.parse(feed),all=Object.values(snap.channels).flat();
if(all.length<30)throw new Error('No valid Pixiv snapshot to deploy');
const files={
 '/':{body:html,type:'text/html; charset=utf-8',ttl:30},
 '/index.html':{body:html,type:'text/html; charset=utf-8',ttl:30},
 '/assets/style.css':{body:css,type:'text/css; charset=utf-8',ttl:180},
 '/assets/app.js':{body:js,type:'application/javascript; charset=utf-8',ttl:180},
 '/assets/pixiv-feed.json':{body:feed,type:'application/json; charset=utf-8',ttl:600}
};
const headers={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.pixiv.re https://i.pixiv.nl https://i.pixiv.cat https://i.pximg.net https://i-cf.pximg.net data:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
};
const parts=[
 'const FILES='+JSON.stringify(files)+';',
 'const ARTWORK_COUNT='+all.length+';',
 'const TONE_COUNT='+all.filter(x=>x.dominant_tone).length+';',
 'const HEADERS='+JSON.stringify(headers)+';',
 `const FEED_SOURCE="https://raw.githubusercontent.com/SteveGuo1726/Firefly/kira-development/public/assets/pixiv-feed.json";
async function serveLiveFeed(req,ctx){
 const key=new Request("https://kira-cf.casto.top/assets/pixiv-feed.json");
 const edge=caches.default;
 try{
  const cached=await edge.match(key);
  if(cached)return new Response(req.method==="HEAD"?null:cached.body,{headers:cached.headers});
  const upstream=await fetch(FEED_SOURCE,{headers:{"Accept":"application/json"},cf:{cacheEverything:true,cacheTtl:900}});
  if(!upstream.ok)throw new Error("feed_status_"+upstream.status);
  const body=await upstream.text();
  if(body.length>2000000)throw new Error("snapshot_size");
  const json=JSON.parse(body),arr=Object.values(json.channels||{}).flat();
  if(json.provider!=="lolicon"||json.r18!==false||arr.length<30||!Array.isArray(json.channels?.discover))throw new Error("invalid_snapshot");
  const response=new Response(body,{headers:{...HEADERS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"public,max-age=120,s-maxage=1200","X-Kira-Feed-Source":"github-cached"}});
  ctx.waitUntil(edge.put(key,response.clone()));
  return new Response(req.method==="HEAD"?null:response.body,{headers:response.headers});
 }catch(error){
  const old=FILES["/assets/pixiv-feed.json"];
  const fallback=new Response(old.body,{headers:{...HEADERS,"Content-Type":old.type,"Cache-Control":"public,max-age=60,s-maxage=120","X-Kira-Feed-Source":"bundled-fallback"}});
  ctx.waitUntil(edge.put(key,fallback.clone()));
  return new Response(req.method==="HEAD"?null:fallback.body,{headers:fallback.headers});
 }
}`,
 'export default {async fetch(req,env,ctx){const u=new URL(req.url);',
 'if(req.method!=="GET"&&req.method!=="HEAD")return new Response("Method Not Allowed",{status:405,headers:HEADERS});',
 'if(u.pathname==="/health")return new Response(JSON.stringify({ok:true,service:"kira-jump-international-preview",version:"7.5.0",safe_works:ARTWORK_COUNT,measured_palettes:TONE_COUNT}),{headers:{...HEADERS,"Content-Type":"application/json","Cache-Control":"no-store"}});',
 'if(u.pathname==="/assets/pixiv-feed.json")return serveLiveFeed(req,ctx);',
 'if(u.pathname==="/robots.txt")return new Response("User-agent: *\nDisallow: /\n",{headers:{...HEADERS,"Content-Type":"text/plain; charset=utf-8"}});',
 'const entry=FILES[u.pathname];if(!entry)return new Response("Not Found",{status:404,headers:HEADERS});',
 'return new Response(req.method==="HEAD"?null:entry.body,{headers:{...HEADERS,"Content-Type":entry.type,"Cache-Control":"public, max-age="+entry.ttl}});',
 '}};'
];
await fs.mkdir(new URL('preview/dist/',root),{recursive:true});
await fs.writeFile(new URL('preview/dist/index.mjs',root),parts.join('\n'));
console.log(JSON.stringify({version:'7.5.0',artworks:all.length,measuredColors:all.filter(x=>x.dominant_tone).length}));
