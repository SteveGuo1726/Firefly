<script lang="ts">
import { onMount } from "svelte";
import { readDraft, writeDraft, clearDraft } from "@/utils/admin/draft-storage";
import { siteConfig } from "@/config/siteConfig";
import type { GitHubAdminSession } from "@/utils/admin/github-session";
import { buildDynamicDocument, excerptMarkdown, parseDynamicDocument, type AdminDynamicFields } from "@/utils/admin/content-format";
import { fetchGitContentSource } from "@/utils/admin/github-content-reader";
import { deleteLiveContentItem, fetchLiveContentIndex, fetchLiveContentItem, saveLiveContentItem } from "@/utils/admin/live-content-client";
import { renderFireflyPreview } from "@/utils/write/preview";

export let session:GitHubAdminSession;
type Base={id:string;path:string;published:string;pinned:boolean;location:string;excerpt:string};
type Row=Base&{live:boolean;baseGitSha:string;revision:string};
let rows:Row[]=[];let query="";let loading=false;let opening=false;let saving=false;let deleting=false;let currentId="";let currentPath="";let loadedPath="";let baseGitSha="";let liveRevision="";let originalSource="";let fields:AdminDynamicFields={published:"",pinned:false,location:""};let body="";let previewHtml="";let message="";let error="";let previewTimer:ReturnType<typeof setTimeout>|null=null;
let savedEditorSnapshot="";
let liveIndexHealthy=false;
function editorSnapshot(){return JSON.stringify({currentPath,fields,body});}
function guardUnsaved(){return !savedEditorSnapshot || editorSnapshot()===savedEditorSnapshot || confirm("当前有未保存的编辑内容。继续将丢失这些修改，确定切换吗？");}

function filtered(){const n=query.trim().toLowerCase();return !n?rows:rows.filter(r=>[r.excerpt,r.location,r.published,r.path].join(" ").toLowerCase().includes(n));}
function idFromPath(path:string){return path.replace(/^src\/content\/dynamic\//,"").replace(/\.md$/i,"");}
function normalizePath(value:string){const rel=value.trim().replace(/^src\/content\/dynamic\//,"").replace(/^\/+/, "");if(!rel||rel.includes("..")||rel.includes("\\")||!rel.endsWith(".md"))throw new Error("动态路径必须位于 src/content/dynamic/ 下并以 .md 结尾。");return"src/content/dynamic/"+rel;}
const markdownImagePattern=/!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;
function baseMeta(){return{published:fields.published,pinned:fields.pinned,location:fields.location.trim(),excerpt:excerptMarkdown(body,160)};}
async function liveMeta(){
	const images:Array<{alt:string;src:string;title?:string}>=[];
	const markdown=body.replace(markdownImagePattern,(_match,alt:string,src:string,title?:string)=>{
		images.push({alt,src,...(title?{title}:{})});
		return "";
	});
	const html=await renderFireflyPreview({source:markdown,calloutTheme:siteConfig.post.rehypeCallouts.theme});
	return{...baseMeta(),html,images,searchText:[excerptMarkdown(body,1200),fields.location].filter(Boolean).join(" ").toLocaleLowerCase()};
}
async function refresh(){liveIndexHealthy=false;loading=true;error="";try{const baseRes=await fetch("/api/admin-content-index.json",{cache:"no-store"});if(!baseRes.ok)throw new Error("读取构建期内容索引失败。");const base=await baseRes.json();const map=new Map<string,Row>((base.dynamics as Base[]).map(x=>[x.id,{...x,live:false,baseGitSha:"",revision:""}]));try{const live=await fetchLiveContentIndex("dynamic",session);for(const e of live.entries){if(e.deleted){map.delete(e.id);continue;}const old=map.get(e.id);const m=e.meta as Partial<Base>;map.set(e.id,{id:e.id,path:e.path||old?.path||`src/content/dynamic/${e.id}.md`,published:String(m.published??old?.published??""),pinned:Boolean(m.pinned??old?.pinned??false),location:String(m.location??old?.location??""),excerpt:String(m.excerpt??old?.excerpt??""),live:true,baseGitSha:e.baseGitSha||"",revision:e.revision||""});}}catch(e){throw new Error("实时内容索引读取失败：已停止刷新，避免将过期 Git 列表误认为实时数据。", {cause:e});}liveIndexHealthy=true;rows=[...map.values()].sort((a,b)=>Date.parse(b.published||"0")-Date.parse(a.published||"0"));}catch(e){liveIndexHealthy=false;error=e instanceof Error?e.message:"动态列表读取失败。";}finally{loading=false;}}
async function open(row:Row){if(saving||deleting||opening||!guardUnsaved())return;opening=true;error="";message="";try{let source="";let sha=row.baseGitSha;if(row.live){const live=await fetchLiveContentItem("dynamic",row.id,session);if(live?.source){source=live.source;sha=live.baseGitSha||sha;liveRevision=live.revision||row.revision||"";}}else{liveRevision="";}if(!source){const git=await fetchGitContentSource(session,row.path);source=git.source;sha=git.sha;}const parsed=parseDynamicDocument(source);currentId=row.id;currentPath=row.path;loadedPath=row.path;baseGitSha=sha;originalSource=source;fields=parsed.fields;body=parsed.body;savedEditorSnapshot=editorSnapshot();await updatePreview();}catch(e){error=e instanceof Error?e.message:"读取动态失败。";}finally{opening=false;}}
function nowText(){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;}
function fileFromDate(v:string){const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(v);return m?`${m[1]}-${m[2]}-${m[3]}-${m[4]}${m[5]}${m[6]}.md`:`dynamic-${Date.now()}.md`;}
function createNew(){if(saving||deleting||opening||!guardUnsaved())return;const published=nowText();currentId="";currentPath="src/content/dynamic/"+fileFromDate(published);loadedPath="";baseGitSha="";liveRevision="";originalSource="";fields={published,pinned:false,location:""};body="";message="新动态尚未写入 Blob。";error="";savedEditorSnapshot=editorSnapshot();void updatePreview();}
async function save(){if(!liveIndexHealthy){error="实时内容索引尚未成功同步，请刷新列表后重试保存。";return;}if(!/^\d{4}-\d{2}-\d{2} [0-2]\d:[0-5]\d:[0-5]\d$/.test(fields.published.trim())){error="发布时间格式必须为 YYYY-MM-DD HH:mm:ss。";return;}if(!body.trim()){error="动态正文不能为空。";return;}let path:string;try{path=normalizePath(currentPath);}catch(e){error=e instanceof Error?e.message:"路径无效。";return;}const nextId=idFromPath(path);if(rows.some((row)=>row.id===nextId&&row.id!==currentId)){error="目标动态路径已经存在，请换一个文件路径。";return;}const source=buildDynamicDocument(fields,body,originalSource);saving=true;error="";message="";try{const publicMeta=await liveMeta();const result=await saveLiveContentItem({session,kind:"dynamic",id:nextId,path,source,meta:publicMeta,baseGitSha,baseGitBranch:session.branch,expectedRevision:liveRevision,previousId:currentId&&currentId!==nextId?currentId:undefined,previousPath:currentId&&currentId!==nextId?loadedPath:undefined,previousBaseGitSha:currentId&&currentId!==nextId?baseGitSha:undefined,previousBaseGitBranch:session.branch});currentId=nextId;currentPath=path;loadedPath=path;liveRevision=result.revision;originalSource=source;savedEditorSnapshot=editorSnapshot();try{clearDraft(window.sessionStorage,"dynamic",session.login);}catch{}message=`实时版本已保存：${result.revision.slice(0,8)}。未创建 Git commit。`;await refresh();}catch(e){error=e instanceof Error?e.message:"保存失败。";}finally{saving=false;}}
async function remove(){if(!liveIndexHealthy){error="实时内容索引尚未成功同步，请刷新列表后重试删除。";return;}if(!currentId||!confirm(`确定隐藏 ${currentPath}？Git 归档前不会删除仓库文件。`))return;deleting=true;error="";message="";try{await deleteLiveContentItem({session,kind:"dynamic",id:currentId,path:loadedPath||currentPath,meta:baseMeta(),baseGitSha,baseGitBranch:session.branch,expectedRevision:liveRevision});currentId="";currentPath="";loadedPath="";originalSource="";liveRevision="";baseGitSha="";fields={published:"",pinned:false,location:""};body="";previewHtml="";savedEditorSnapshot=editorSnapshot();try{clearDraft(window.sessionStorage,"dynamic",session.login);}catch{}await refresh();message="已写入实时删除标记；Git 仓库尚未改动。";}catch(e){error=e instanceof Error?e.message:"删除失败。";}finally{deleting=false;}}
async function updatePreview(){try{previewHtml=await renderFireflyPreview({source:body,calloutTheme:siteConfig.post.rehypeCallouts.theme});}catch(e){previewHtml=`<p>${e instanceof Error?e.message:"预览失败"}</p>`;}}
function schedulePreview(){if(previewTimer)clearTimeout(previewTimer);previewTimer=setTimeout(()=>void updatePreview(),180);}
onMount(()=>{
 void refresh();
 const store=window.sessionStorage;
 const local=readDraft(store,"dynamic",session.login);
 if(local && confirm("发现上次未保存的动态草稿，是否恢复？")){
  try{
   const draft=JSON.parse(local.snapshot);
   if(typeof draft.currentPath==="string" && typeof draft.body==="string" && draft.fields && typeof draft.fields==="object"){
    currentPath=draft.currentPath;fields=draft.fields;body=draft.body;
    
    currentId="";loadedPath="";baseGitSha="";liveRevision="";originalSource="";
    savedEditorSnapshot="";void updatePreview();
   }
  }catch{/* Ignore corrupt private draft data */ }
 }
 const persist=()=>{
  try{
   const snapshot=editorSnapshot();
   if(currentPath && snapshot!==savedEditorSnapshot)writeDraft(store,"dynamic",session.login,snapshot);
   else if(snapshot===savedEditorSnapshot)clearDraft(store,"dynamic",session.login);
  }catch{/* Unavailable or full session storage must not block editing */ }
 };
 const interval=window.setInterval(persist,2500);
 window.addEventListener("pagehide",persist);
 return()=>{
  persist();
  window.clearInterval(interval);
  window.removeEventListener("pagehide",persist);
  if(previewTimer)clearTimeout(previewTimer);
 };
});
</script>

<section class="manager card-base"><header><div><h2>动态管理</h2><p>实时写入 Blob；公开动态页不再挂载管理组件。</p></div><div class="actions"><button onclick={()=>refresh()} disabled={loading}>刷新</button><button class="primary" onclick={createNew}>新建</button></div></header><div class="layout"><aside><input class="search" type="search" bind:value={query} placeholder="搜索动态"/><div class="list">{#if loading}<p>读取中...</p>{:else}{#each filtered() as row}<button class:active={row.id===currentId} onclick={()=>open(row)}><strong>{row.excerpt||row.id}</strong><span>{row.published} · {row.live?"实时":"Git"}</span><small>{row.location}</small></button>{/each}{/if}</div></aside><div class="editor"><div class="grid"><label class="wide"><span>文件路径</span><input bind:value={currentPath}/></label><label><span>发布时间</span><input bind:value={fields.published}/></label><label><span>位置</span><input bind:value={fields.location}/></label></div><label class="check"><input type="checkbox" bind:checked={fields.pinned}/>置顶</label><label class="body"><span>正文 Markdown</span><textarea bind:value={body} oninput={schedulePreview}></textarea></label><div class="status"><div>{#if opening}<span>读取源码...</span>{/if}{#if message}<span class="ok">{message}</span>{/if}{#if error}<span class="bad">{error}</span>{/if}</div><div class="actions"><button class="danger" onclick={remove} disabled={!currentId||saving||deleting}>删除实时版本</button><button class="primary" onclick={save} disabled={saving||deleting||opening}>{saving?"保存中...":"实时保存"}</button></div></div></div><div class="preview"><strong>动态预览</strong><div class="prose prose-base max-w-none custom-md dark:prose-invert">{@html previewHtml}</div></div></div></section>
<style>
.manager{overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem;border-bottom:1px solid var(--line-divider)}h2{margin:0;font-size:1.05rem}header p{margin:.25rem 0 0;font-size:.76rem;opacity:.58}.actions{display:flex;gap:.45rem}button{border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;padding:.55rem .7rem;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}button.primary{background:var(--primary);border-color:var(--primary);color:white}button.danger{color:#c43d3d;border-color:rgb(196 61 61/.3)}button:disabled{opacity:.5;cursor:not-allowed}.layout{display:grid;grid-template-columns:17rem minmax(28rem,1fr) minmax(22rem,.8fr);min-height:62vh}aside{padding:.75rem;border-right:1px solid var(--line-divider)}.search,.grid input,.body textarea{width:100%;border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;font:inherit}.search{padding:.62rem}.list{display:grid;gap:.3rem;margin-top:.6rem;max-height:58vh;overflow:auto}.list button{display:grid;text-align:left;gap:.15rem}.list button.active{border-color:var(--primary);background:color-mix(in oklab,var(--primary) 9%,transparent)}.list span,.list small{font-size:.67rem;opacity:.55}.editor{padding:.9rem;border-right:1px solid var(--line-divider)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.grid label,.body{display:grid;gap:.3rem;font-size:.72rem;font-weight:700}.grid .wide{grid-column:span 2}.grid input{padding:.6rem}.check{display:flex;gap:.35rem;margin:.8rem 0;font-size:.76rem}.body textarea{min-height:25rem;padding:.7rem;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6}.status{display:flex;justify-content:space-between;gap:.7rem;align-items:center;margin-top:.7rem;font-size:.7rem}.status>div:first-child{display:grid}.ok{color:#059669}.bad{color:#c43d3d}.preview{padding:1rem;overflow:auto;max-height:62vh}.preview>strong{display:block;margin-bottom:.8rem}@media(max-width:1250px){.layout{grid-template-columns:16rem minmax(0,1fr)}.preview{grid-column:1/-1;border-top:1px solid var(--line-divider);max-height:none}}@media(max-width:800px){header{align-items:flex-start;flex-direction:column}.layout{grid-template-columns:1fr}aside,.editor{border-right:0;border-bottom:1px solid var(--line-divider)}.list{max-height:16rem}.grid{grid-template-columns:1fr}.grid .wide{grid-column:auto}.status{align-items:flex-start;flex-direction:column}}
</style>
