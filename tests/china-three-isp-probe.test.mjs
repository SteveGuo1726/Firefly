import test from "node:test";
import assert from "node:assert/strict";
import {ENDPOINTS,NETWORKS,summarizeMeasurement,discoverMainlandNetworks,runThreeIspProbes}
 from "../scripts/china-three-isp-probe.mjs";

test("fixed targets only include public Firefly endpoints and cap free probes",()=>{
 assert.equal(ENDPOINTS.length,4);
 assert.equal(NETWORKS.length,3);
 assert.deepEqual(ENDPOINTS.map(x=>x.host),[
  "cnprobe.casto.top","cnprobe.casto.top","img.casto.top","blog.casto.top"]);
});
test("summaries preserve HTTP 200 partial-failure as failed, and never expose IPs",()=>{
 const result=summarizeMeasurement({id:"id",status:"finished",results:[
  {probe:{asn:4837,city:"Xi'an",network:"China Unicom",tags:["secret"]},
   result:{status:"failed",statusCode:200,resolvedAddress:"1.2.3.4",timings:{total:15000,tls:8111},headers:{"cf-ray":"abcdef-LAX"},failureSource:"target"}}
 ]},"thumb");
 assert.equal(result.nodes[0].status,"failed");
 assert.equal(result.nodes[0].httpCode,200);
 assert.equal(result.nodes[0].totalMs,15000);
 assert.equal(result.nodes[0].edgePoP,"LAX");
 assert.doesNotMatch(JSON.stringify(result),/1\.2\.3\.4|secret/);
});
test("probe discovery identifies actual mainland coverage by ASN",async()=>{
 const data=[{location:{country:"CN",asn:9808,city:"Guangzhou"}},
 {location:{country:"CN",asn:4837,city:"Xi'an"}},
 {location:{country:"CN",asn:4134,city:"Guilin"}},
 {location:{country:"HK",asn:9808,city:"Hong Kong"}}];
 const coverage=await discoverMainlandNetworks(async()=>Response.json(data));
 assert.equal(coverage.total,4);
 assert.equal(coverage.mainland,3);
 assert.deepEqual(coverage.networks.map(n=>n.count),[1,1,1]);
});
test("measurements reuse identical probe selection, cap tests, and are read-only",async()=>{
 const requests=[],payloads=[];
 const probeList=NETWORKS.map(n=>({location:{country:"CN",city:n.name,asn:n.asn}}));
 const fetcher=async(input,options={})=>{
  const url=String(input);
  requests.push({url,method:options.method||"GET"});
  if(url.endsWith("/probes"))return Response.json(probeList);
  if(url.endsWith("/measurements")){
   const p=JSON.parse(options.body);payloads.push(p);
   return Response.json({id:"test-measurement-"+payloads.length,probesCount:3},{status:202});
  }
  if(url.includes("/measurements/")){
   return Response.json({id:url.split("/").at(-1),status:"finished",results:probeList.map((p,i)=>({
    probe:{asn:p.location.asn,city:p.location.city,network:"test"},
    result:{status:"finished",statusCode:200,timings:{total:i+1},headers:{}},
   }))});
  }
  throw Error("Unexpected "+url);
 };
 const report=await runThreeIspProbes({fetcher,pause:async()=>{},log:()=>{}});
 assert.equal(report.results.length,4);
 assert.equal(payloads.length,4);
 assert.deepEqual(payloads[0].locations,NETWORKS.map(n=>({country:"CN",asn:n.asn,limit:2})));
 assert.equal(payloads[1].locations,"test-measurement-1");
 assert.equal(requests.filter(x=>x.method==="POST").length,4);
 assert.equal(report.results[0].nodes.length,3);
});
