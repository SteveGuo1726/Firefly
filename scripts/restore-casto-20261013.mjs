import {mkdtemp,mkdir,readFile,writeFile,rm,cp,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {closeSync,openSync} from "node:fs";
import {pathToFileURL} from "node:url";
const ARCHIVE_URL="https://firefly-archive-keeper.guojunyang666666.workers.dev/firefly-original-20261013-bae2cf47.tar.gz";
const SHA="bae2cf471317ba0813e30df964c044b81ec13f11f990da24067878c6b36e764b",BYTES=6907376;
const modules=["AdminApp.BvivyVgR.js","AdminDashboard.vfh0FXr2.js","AdminPostManager.BFNSyUTB.js","AdminDynamicManager.DmUPNvw0.js","GalleryAdminManager.DgIVl1e9.js","AdminSiteSettings.u4IzuQYO.js","AdminBackup.y-T-uhdG.js"];
const CACHE_FILE=resolve("node_modules/.cache/firefly-original-20261013.tar.gz");
// Git Bash resolves `tar` to GNU tar, which cannot open C:\... paths. Use the
// Windows system bsdtar explicitly; Linux/EdgeOne builds keep using `tar`.
const TAR=process.platform==="win32"?join(process.env.SystemRoot||"C:\\Windows","System32","tar.exe"):"tar";
// Spawn tar without pipe capture. Sandboxed Windows builds (and some CI
// wrappers) deny named-pipe handles, so execFileSync's default stdout capture
// fails with EPERM; redirect stdout to a regular file instead.
function runTar(args,{timeout=30000,stdoutFile=null}={}){
 let fd=null;
 try{
  if(stdoutFile)fd=openSync(stdoutFile,"w");
  const result=spawnSync(TAR,args,{timeout,stdio:["ignore",fd??"ignore","inherit"]});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`tar ${args[0]} failed with exit code ${result.status}`);
 }finally{if(fd!==null)closeSync(fd)}
}
async function obtainVerifiedArchive(fetcher=fetch){
 const env=process.env.FIREFLY_ORIGINAL_ARCHIVE;
 let bytes=env?await readFile(env):await readFile(CACHE_FILE).catch(()=>null);
 const valid=b=>b?.length===BYTES&&createHash("sha256").update(b).digest("hex")===SHA;
 if(!valid(bytes)&&env)throw Error("Offline original archive mismatch");
 if(!valid(bytes)){
  const response=await fetcher(ARCHIVE_URL,{redirect:"error",signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error("Original archive HTTP "+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(!valid(bytes))throw Error("Original archive mismatch");
  await mkdir(resolve("node_modules/.cache"),{recursive:true});
  await writeFile(CACHE_FILE,bytes);
 }
 return env?resolve(env):CACHE_FILE;
}
export async function prepareOriginalMedia({fetcher=fetch}={}){
 const archive=await obtainVerifiedArchive(fetcher);
 const temp=await mkdtemp(join(tmpdir(),"firefly-original-media-"));
 try{
  runTar(["-xzf",archive,"-C",temp,"firefly-original-media/"]);
  const target=resolve("public/assets/casto-original");
  await mkdir(target,{recursive:true});
  for(const name of ["favicon.ico","logo.png","avatar.webp","desktop-1.webp","desktop-2.webp","desktop-3.webp","mobile-1.webp","mobile-2.webp","mobile-3.webp"])
   await cp(join(temp,"firefly-original-media",name),join(target,name));
  await mkdir(resolve("public/favicon"),{recursive:true});
  await cp(join(target,"favicon.ico"),resolve("public/favicon/favicon.ico"));
  console.log("Original Casto media restored before Astro build: 9 files");
 }finally{await rm(temp,{recursive:true,force:true})}
}
export async function restoreOriginalAdmin(dist="dist",{fetcher=fetch}={}){
 const temp=await mkdtemp(join(tmpdir(),"firefly-20261013-"));
 try{
  const archive=await obtainVerifiedArchive(fetcher);
  const listFile=join(temp,"archive-listing.txt");
  runTar(["-tzf",archive],{stdoutFile:listFile});
  const files=(await readFile(listFile,"utf8")).split("\n").filter(Boolean);
  if(files.some(x=>x.startsWith("/")||x.split("/").includes("..")||!/^firefly-original-(20261013|media)(\/|$)/.test(x)))throw Error("Unsafe original archive");
  runTar(["-xzf",archive,"-C",temp]);
  const root=join(temp,"firefly-original-20261013"),manifest=JSON.parse(await readFile(join(root,"capture-manifest.json"),"utf8"));
  if(manifest.originalDeploymentId!=="dpo6mvx7243c"||manifest.assets.length<480)throw Error("Wrong original backend build");
  const has=new Set(manifest.assets.map(x=>x.path));
  if(modules.some(n=>!has.has("/_astro/"+n)))throw Error("Missing original backend module");
  for(const a of manifest.assets){
   const path=a.path==="/admin/"?join(root,"admin/index.html"):join(root,a.path.slice(1));
   const bytes=await readFile(path);
   if(bytes.length!==a.size||createHash("sha256").update(bytes).digest("hex")!==a.sha256)throw Error("Original asset corrupted: "+a.path);
  }
  const out=resolve(dist);
  if(!(await stat(join(out,"index.html")).catch(()=>null))?.isFile())throw Error("Astro output missing");
  await cp(join(root,"_astro"),join(out,"_astro"),{recursive:true,force:true});
  const media=join(out,"assets/casto-original");await mkdir(media,{recursive:true});
  const names=["favicon.ico","logo.png","avatar.webp","desktop-1.webp","desktop-2.webp","desktop-3.webp","mobile-1.webp","mobile-2.webp","mobile-3.webp"];
  for(const name of names)await cp(join(temp,"firefly-original-media",name),join(media,name));
  await mkdir(join(out,"favicon"),{recursive:true});await cp(join(media,"favicon.ico"),join(out,"favicon/favicon.ico"));
  const html=await readFile(join(root,"admin/index.html"),"utf8");
  if(!html.includes("AdminApp.BvivyVgR.js")||!html.includes("astro-island"))throw Error("Original backend shell invalid");
  await mkdir(join(out,"admin"),{recursive:true});await writeFile(join(out,"admin/index.html"),html);
  await writeFile(join(out,"admin/restoration-provenance.json"),JSON.stringify({deployment:"dpo6mvx7243c",assetCount:manifest.assets.length,sha256:SHA}));
  console.log("Firefly original Oct 13 admin restored:",manifest.assets.length,"verified files");
 }finally{await rm(temp,{recursive:true,force:true})}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const run=process.argv[2]==="--prepare"?prepareOriginalMedia():restoreOriginalAdmin(process.argv[2]||"dist");
 run.catch(e=>{console.error(e);process.exitCode=1});
}
