/** Read-only availability audit: no deployments, DNS writes, or secrets. */
import { performance } from "node:perf_hooks";
import { lookup, resolveCname } from "node:dns/promises";

async function cnameChain(host){
 const chain=[host];
 for(let hop=0;hop<8;hop++){
  const aliases=await resolveCname(chain.at(-1)).catch(()=>[]);
  if(!aliases.length)break;
  const next=aliases[0].replace(/\\.$/,"");
  if(chain.includes(next)){chain.push("[CNAME CYCLE]");break;}
  chain.push(next);
 }
 return chain;
}

const targets=[
 {name:"blog",url:"https://blog.casto.top/",expect:"text/html"},
 {name:"image-cdn",url:"https://img.casto.top/",expect:null},
 {name:"gallery-api",url:"https://gallery-api.casto.top/api/gallery/public?summary=true",expect:"json"},
 {name:"comments",url:"https://twikoo-netlify-casto.netlify.app/.netlify/functions/twikoo",expect:null},
];
const limit=Number(process.env.FIREFLY_AUDIT_TIMEOUT_MS||8000);
if(!Number.isInteger(limit)||limit<500||limit>30000)throw Error("Audit timeout must be 500-30000ms");
for(const target of targets){
 const hostname=new URL(target.url).hostname;
 let dns={};
 try{
  const [addresses,cnames]=await Promise.all([
   lookup(hostname,{all:true}).then(x=>x.map(y=>y.address)).catch(()=>[]),
   resolveCname(hostname).catch(()=>[]),
  ]);
  dns={addresses,cnames,cnameChain:await cnameChain(hostname)};
 }catch(error){dns={error:String(error)};}
 const started=performance.now();
 let result;
 try{
  // A GET is required for APIs that reject HEAD. Never request private objects.
  const response=await fetch(target.url,{
   method:"GET",signal:AbortSignal.timeout(limit),redirect:"follow",
   headers:{Accept:"text/html, application/json;q=0.8, */*;q=0.1"},
  });
  await response.body?.cancel();
  const type=response.headers.get("content-type")||"";
  result={status:response.status,ok:response.ok,
   latencyMs:Math.round(performance.now()-started),
   cacheControl:response.headers.get("cache-control"),
   edgeCache:response.headers.get("cf-cache-status"),
   finalHost:new URL(response.url).hostname,contentType:type,
   contentTypeMatch:!target.expect||(target.expect==="json"?type.includes("json"):type.includes(target.expect))};
 }catch(error){
  result={ok:false,latencyMs:Math.round(performance.now()-started),
   error:error instanceof Error?error.message:String(error)};
 }
 console.log(JSON.stringify({target:target.name,host:hostname,dns,...result}));
}
console.log("AUDIT_READ_ONLY_COMPLETE: observations are from the runner network, not mainland China.");
