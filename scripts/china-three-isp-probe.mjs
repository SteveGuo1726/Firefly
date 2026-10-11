/**
 * Firefly public-route China ISP probe audit.
 * No API key, no payments, no mutation of Firefly infrastructure.
 *
 * Usage: node scripts/china-three-isp-probe.mjs
 * Globalping free unauthenticated budget: 250 tests/hour, 50 probes/measurement.
 * This script caps itself at 2 probes x 3 ASNs x 4 endpoints = 24 tests.
 */
import {pathToFileURL} from "node:url";

export const GLOBALPING_API="https://api.globalping.io/v1";
export const NETWORKS=[
 {asn:9808,name:"中国移动"},
 {asn:4837,name:"中国联通"},
 {asn:4134,name:"中国电信"},
];
export const ENDPOINTS=[
 {id:"thumb",host:"cnprobe.casto.top",path:"/sample-480.webp",expectedBytes:14504},
 {id:"cf_original",host:"cnprobe.casto.top",path:"/sample.png",expectedBytes:1780047},
 {id:"imagebed",host:"img.casto.top",path:"/file/posts/mmdcasto1.png",expectedBytes:1780047},
 {id:"blog",host:"blog.casto.top",path:"/",expectedBytes:null},
];
const HEADERS={"User-Agent":"Firefly-OpenSource-China-Probe/1.0","Accept":"application/json"};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function summarizeMeasurement(raw,endpoint){
 const results=Array.isArray(raw?.results)?raw.results:[];
 return {
  endpoint,measurementId:String(raw?.id||""),
  status:String(raw?.status||"unknown"),
  nodes:results.map(entry=>{
   const probe=entry.probe||{},result=entry.result||{};
   const timing=result.timings||{},headers=result.headers||{};
   return {
    asn:probe.asn,city:probe.city,network:probe.network,
    status:result.status==="finished"?"finished":"failed",
    httpCode:result.statusCode??null,
    totalMs:typeof timing.total==="number"?Math.round(timing.total):null,
    dnsMs:typeof timing.dns==="number"?Math.round(timing.dns):null,
    tcpMs:typeof timing.tcp==="number"?Math.round(timing.tcp):null,
    tlsMs:typeof timing.tls==="number"?Math.round(timing.tls):null,
    edgePoP:typeof headers["cf-ray"]==="string"?
      headers["cf-ray"].split("-").at(-1):null,
    failureSource:result.failureSource||null,
  };
  }),
 };
}

export async function discoverMainlandNetworks(fetcher=fetch){
 const response=await fetcher(GLOBALPING_API+"/probes",{headers:HEADERS});
 if(!response.ok)throw Error("Globalping probes HTTP "+response.status);
 const probes=await response.json();
 if(!Array.isArray(probes))throw Error("Unexpected probes response");
 const mainland=probes.filter(p=>p.location?.country==="CN");
 return {
  total:probes.length,mainland:mainland.length,
  networks:NETWORKS.map(n=>({
   ...n,count:mainland.filter(p=>p.location?.asn===n.asn).length,
   cities:[...new Set(mainland.filter(p=>p.location?.asn===n.asn).map(p=>p.location.city))].sort(),
  })),
 };
}

export async function runThreeIspProbes({fetcher=fetch,pause=sleep,log=console.log}={}){
 const coverage=await discoverMainlandNetworks(fetcher);
 if(coverage.networks.some(n=>n.count===0))
  throw Error("A target mainland ISP has no online probes; not claiming full three-ISP coverage");
 const snapshots=[];
 let reuseId;
 for(const endpoint of ENDPOINTS){
  const payload={
   type:"http",target:endpoint.host,
   locations:reuseId||NETWORKS.map(n=>({country:"CN",asn:n.asn,limit:2})),
   measurementOptions:{protocol:"HTTPS",request:{method:"GET",path:endpoint.path}},
  };
  const response=await fetcher(GLOBALPING_API+"/measurements",{
   method:"POST",headers:{...HEADERS,"Content-Type":"application/json"},
   body:JSON.stringify(payload),
  });
  if(!response.ok)throw Error(endpoint.id+" measurement start HTTP "+response.status);
  const created=await response.json();
  if(typeof created.id!=="string"||created.probesCount>6)
   throw Error("Missing ID or unexpected number of probes");
  reuseId??=created.id;
  log("Started "+endpoint.id+" with "+created.probesCount+" probes");
  let measurement;
  for(let i=0;i<13;i++){
   await pause(2500);
   const status=await fetcher(GLOBALPING_API+"/measurements/"+encodeURIComponent(created.id),{
    headers:HEADERS,
   });
   if(!status.ok)throw Error("Globalping measurement polling HTTP "+status.status);
   measurement=await status.json();
   if(measurement.status!=="in-progress")break;
  }
  if(measurement?.status==="in-progress")
   throw Error("Globalping measurement not finished; ID "+created.id);
  snapshots.push(summarizeMeasurement(measurement,endpoint.id));
 }
 return {schema:"firefly-globalping-cn-isp-v1",
  sampledAt:new Date().toISOString(),provider:"globalping.io",
  coverage,results:snapshots,notes:[
   "Mainland probes are not guaranteed to be residential subscriber networks.",
   "Total HTTP time is not browser LCP or real user image decode time.",
   "Finished means HTTP request fully finished, not just receiving status 200.",
   "The image endpoints have different sizes: compare cf_original vs imagebed for same bytes.",
   "No credentials, cookies, IP addresses, or personal data are stored."
  ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const output=await runThreeIspProbes();
  console.log(JSON.stringify(output,null,2));
  if(output.results.some(result=>result.nodes.some(node=>node.status!=="finished")))
   process.exitCode=0; // Partial outages are measurements, not a script execution failure.
 }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
