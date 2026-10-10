const SAMPLE="https://img.casto.top/file/posts/mmdcasto1.png";
const PAGE="<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\">\n<title>Firefly 国内三网 · 线路实验</title>\n<style>\n:root{color-scheme:light dark;font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif}\nbody{max-width:800px;margin:24px auto;padding:0 16px;line-height:1.6}\nh1{font-size:1.6rem}h2{font-size:1.13rem}\nsmall,.muted{opacity:.72}\ninput,select,button{font:inherit;padding:9px;border:1px solid #888;border-radius:8px}\nbutton{cursor:pointer;background:#2859b9;color:white;border:0}\nbutton:disabled{opacity:.5;cursor:wait}\n.card{border:1px solid #aaa5;border-radius:14px;padding:14px;margin:15px 0}\n.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}\ntable{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;border-bottom:1px solid #aaa5;padding:8px 5px}\ntd:nth-child(2),td:nth-child(3){font-variant-numeric:tabular-nums}\npre{font-size:.79rem;white-space:pre-wrap;overflow-wrap:anywhere;background:#8882;padding:12px;border-radius:8px}\n</style>\n</head><body>\n<h1>Firefly · 国内访问线路实验</h1>\n<p>仅针对 <strong>公开测试图片</strong>，比较当前图床与 Cloudflare Worker 缓存出口。两条线路获取的是同一张约 1.7 MiB 的原图，<strong>不修改上传文件、不涉及生产配置</strong>。</p>\n<section class=\"card\">\n  <h2>一、设置测量环境</h2>\n  <div class=\"controls\">\n    <label>运营商 <select id=\"carrier\"><option>未知</option><option>中国移动</option><option>中国联通</option><option>中国电信</option><option>中国广电</option><option>其他</option></select></label>\n    <label>城市（选填） <input id=\"city\" placeholder=\"例：上海\" maxlength=\"30\"></label>\n  </div>\n  <p class=\"muted\">浏览器测速来自你当前的网络。不要用境外服务器数据替代中国大陆实测；如开启 VPN，请注明或不要参与。测速只在你的浏览器里执行，报告不会自动上传。</p>\n  <div class=\"controls\"><button id=\"run\">开始比较（各两次）</button><button id=\"copy\" type=\"button\" disabled>复制脱敏结果</button></div>\n  <p id=\"state\" role=\"status\">未开始，测速不会在后台自动进行。</p>\n</section>\n<section class=\"card\">\n <h2>二、实际结果</h2>\n <table><thead><tr><th>候选线路</th><th>加载耗时</th><th>成功率</th></tr></thead><tbody id=\"rows\"><tr><td colspan=\"3\">暂无数据</td></tr></tbody></table>\n <p class=\"muted\">耗时是浏览器 &lt;img&gt; 资源加载到 onload 的总时间，含 DNS、握手、首包和传输；不等于 TTFB。每轮生成短暂随机参数绕过浏览器缓存，Cloudflare 实验 Worker 使用固定的缓存键。样本量很小，仅供线路初筛。</p>\n</section>\n<section class=\"card\"><h2>三、对照端点</h2>\n<p><a href=\"https://img.casto.top/file/posts/mmdcasto1.png\" target=\"_blank\" rel=\"noopener noreferrer\">现有图床原图入口</a> · <a href=\"/sample.png\" target=\"_blank\" rel=\"noopener noreferrer\">Cloudflare 缓存实验入口</a> · <a href=\"/health\" target=\"_blank\" rel=\"noopener noreferrer\">状态检查</a></p>\n<p><small>不会测试登录、草稿、相册私有图、Token。没有外部分析 SDK，没有上报接口。此页不等于已接入中国大陆节点，也不进行 DNS 分流。</small></p>\n<pre id=\"report\">等待测量。</pre></section>\n<script>\n(function(){\n\"use strict\";\nconst paths=[\n {id:\"original\",name:\"现有 img.casto.top\",url:\"https://img.casto.top/file/posts/mmdcasto1.png\"},\n {id:\"cf_worker\",name:\"CF Worker 试验缓存\",url:location.origin+\"/sample.png\"}\n];\nconst state=document.getElementById(\"state\"),rows=document.getElementById(\"rows\"),report=document.getElementById(\"report\");\nconst run=document.getElementById(\"run\"),copy=document.getElementById(\"copy\");\nlet latest=null;\nfunction imageLoad(url){\n return new Promise(resolve=>{\n  const image=new Image();\n  const start=performance.now();\n  const timeout=setTimeout(function(){image.onload=null;image.onerror=null;image.src=\"\";resolve({ok:false,ms:null,reason:\"12s timeout\"});},12000);\n  const done=(ok)=>{clearTimeout(timeout);const time=Math.round(performance.now()-start);image.onload=null;image.onerror=null;resolve({ok:ok,ms:ok?time:null,reason:ok?\"\":\"load error\"})};\n  image.onload=function(){done(true)};\n  image.onerror=function(){done(false)};\n  const token=Date.now().toString(36)+\"-\"+Math.random().toString(36).slice(2,9);\n  image.src=url+(url.includes(\"?\")?\"&\":\"?\")+\"client_probe=\"+token;\n });\n}\nfunction median(v){if(!v.length)return null;const a=v.slice().sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2);}\nrun.addEventListener(\"click\",async function(){\n run.disabled=true;copy.disabled=true;latest=null;\n const results={};\n paths.forEach(p=>results[p.id]=[]);\n try{\n  for(let round=0;round<2;round++){\n   const batch=round===0?paths:[...paths].reverse();\n   for(const path of batch){\n    state.textContent=\"第 \"+(round+1)+\"/2 轮：正在测 \"+path.name+\"...\";\n    results[path.id].push(await imageLoad(path.url));\n   }\n  }\n  latest={\n   schema:\"firefly-route-probe-v1\",date:new Date().toISOString(),\n   carrier:document.getElementById(\"carrier\").value,\n   city:document.getElementById(\"city\").value.trim().slice(0,30),\n   userAgentHint:\"browser\", // no IP address, device fingerprint or tokens\n   routes:paths.map(p=>{const samples=results[p.id];return {\n    id:p.id,success:samples.filter(x=>x.ok).length,total:samples.length,\n    medianMs:median(samples.filter(x=>x.ok).map(x=>x.ms)),samples:samples\n   }})\n  };\n  rows.innerHTML=\"\";\n  latest.routes.forEach(route=>{\n   const tr=document.createElement(\"tr\");\n   [route.id,route.medianMs===null?\"超时/失败\":route.medianMs+\" ms\",route.success+\"/\"+route.total].forEach(value=>{\n    const td=document.createElement(\"td\");td.textContent=value;tr.appendChild(td);\n   });\n   rows.appendChild(tr);\n  });\n  report.textContent=JSON.stringify(latest,null,2);\n  state.textContent=\"测量结束。复制结果分享即可，不会自动上传。\";\n  copy.disabled=false;\n }catch(error){state.textContent=\"测量出错：\"+String(error && error.message || error)}\n finally{run.disabled=false;}\n});\ncopy.addEventListener(\"click\",async function(){\n if(!latest)return;\n try{await navigator.clipboard.writeText(JSON.stringify(latest,null,2));state.textContent=\"结果已复制。\";}\n catch{state.textContent=\"复制被浏览器禁止，请手动复制下面的 JSON 文本。\";}\n});\n})();\n</script></body></html>";
const BASE_HEADERS={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow"};
const FRESH_TTL=7200;

function simple(body,type,status=200){
 const headers=new Headers(BASE_HEADERS);
 headers.set("Content-Type",type);
 headers.set("Cache-Control","no-store");
 return new Response(body,{status,headers});
}
function imageHeaders(base={}){
 const h=new Headers(base);
 h.set("Content-Type","image/png");
 h.set("Cache-Control","public,max-age="+FRESH_TTL+",s-maxage="+FRESH_TTL);
 h.set("Access-Control-Allow-Origin","*");
 h.set("Timing-Allow-Origin","*");
 h.set("X-Content-Type-Options","nosniff");
 h.delete("Set-Cookie");
 return h;
}
export async function handleProbe(request,ctx={},fetcher=fetch,cache=globalThis.caches?.default){
 const url=new URL(request.url);
 if(request.method!=="GET") return new Response("Method Not Allowed",{status:405,headers:{Allow:"GET"}});
 if(url.pathname==="/")return simple(PAGE,"text/html; charset=utf-8");
 if(url.pathname==="/health")return simple(JSON.stringify({ok:true,source:"public-original",edge:"cloudflare",version:1,caching:"best-effort",paidServices:false}),"application/json; charset=utf-8");
 if(url.pathname!=="/sample.png")return simple("Not Found","text/plain",404);
 // Accept query parameters only as browser cache-busters. They never change the
 // upstream URL or edge cache key; this is not an image proxy for arbitrary URLs.
 const key=new Request(new URL("/sample.png",url.origin),{method:"GET"});
 try{
  if(cache){
   const cached=await cache.match(key);
   if(cached){
    const h=imageHeaders(cached.headers);h.set("X-Firefly-Edge-Cache","HIT");
    return new Response(cached.body,{status:200,headers:h});
   }
  }
  const upstream=await fetcher(SAMPLE,{method:"GET",redirect:"follow",cf:{cacheEverything:true,cacheTtl:FRESH_TTL}});
  if(!upstream.ok || !/^image\/png(?:;|$)/i.test(upstream.headers.get("Content-Type")||""))
   return simple("Origin image unavailable","text/plain",502);
  const h=imageHeaders();
  h.set("X-Firefly-Edge-Cache","MISS");
  const response=new Response(upstream.body,{status:200,headers:h});
  if(cache && ctx.waitUntil){
   const save=response.clone();
   const storeHeaders=imageHeaders();storeHeaders.set("X-Firefly-Edge-Cache","EDGE");
   const toSave=new Response(save.body,{status:200,headers:storeHeaders});
   ctx.waitUntil(cache.put(key,toSave).catch(()=>{}));
  }
  return response;
 }catch{
  return simple("Origin image unavailable","text/plain",503);
 }
}
export default {fetch(request,env,ctx){return handleProbe(request,ctx);}};
