<script lang="ts">
import { onMount } from "svelte";
import { readDraft, writeDraft, clearDraft } from "@/utils/admin/draft-storage";
import { siteConfig } from "@/config/siteConfig";
import type { GitHubAdminSession } from "@/utils/admin/github-session";
import { buildPostDocument, emptyPostFields, excerptMarkdown, parsePostDocument, type AdminPostFields } from "@/utils/admin/content-format";
import { fetchGitContentSource } from "@/utils/admin/github-content-reader";
import { deleteLiveContentItem, fetchLiveContentIndex, fetchLiveContentItem, saveLiveContentItem, fetchLiveContentHistory, restoreLiveContentRevision, type LiveHistoryEntry } from "@/utils/admin/live-content-client";
import { renderFireflyPreview } from "@/utils/write/preview";

export let session:GitHubAdminSession;
type BasePost={id:string;path:string;title:string;description:string;published:string;updated:string;category:string;tags:string[];draft:boolean;pinned:boolean;image:string};
type Row=BasePost&{live:boolean;baseGitSha:string;revision:string};

let rows:Row[]=[];let query="";let loading=false;let opening=false;let saving=false;let deleting=false;
let currentId="";let currentPath="";let loadedPath="";let baseGitSha="";let liveRevision="";let originalSource="";
let fields:AdminPostFields=emptyPostFields();let body="";let tagsText="";let previewHtml="";let message="";let error="";
let previewTimer:ReturnType<typeof setTimeout>|null=null;
let savedEditorSnapshot="";
let liveIndexHealthy=false;
let deletedRows:{id:string;path:string;revision:string}[]=[];
let historyEntries:LiveHistoryEntry[]=[];let historyRevision="";let historyLoading=false;
function editorSnapshot(){return JSON.stringify({currentPath,fields,body,tagsText});}
function guardUnsaved(){return !savedEditorSnapshot || editorSnapshot()===savedEditorSnapshot || confirm("当前有未保存的编辑内容。继续将丢失这些修改，确定切换吗？");}


function filtered(){const n=query.trim().toLowerCase();return !n?rows:rows.filter(r=>[r.title,r.description,r.category,r.tags.join(" "),r.path].join(" ").toLowerCase().includes(n));}
function idFromPath(path:string){return path.replace(/^src\/content\/posts\//,"").replace(/\.(?:md|mdx)$/i,"");}
function normalizePath(value:string){const relative=value.trim().replace(/^src\/content\/posts\//,"").replace(/^\/+/, "");if(!relative||relative.includes("..")||relative.includes("\\")||!/\.(md|mdx)$/i.test(relative))throw new Error("文件路径必须位于 src/content/posts/ 下，并以 .md 或 .mdx 结尾。");return"src/content/posts/"+relative;}
function baseMeta(){return{title:fields.title.trim(),description:fields.description.trim(),published:fields.published,updated:fields.updated,category:fields.category.trim(),tags:tagsText.split(/[,\n]/).map(v=>v.trim()).filter(Boolean),draft:fields.draft,pinned:fields.pinned,image:fields.image.trim(),protected:Boolean(fields.password),comment:fields.comment};}
function needsStaticSecurityRebuild(){return Boolean(baseGitSha&&(fields.draft||fields.password.trim()));}
async function liveMeta(){
	const html=await renderFireflyPreview({source:body,calloutTheme:siteConfig.post.rehypeCallouts.theme,isMdx:currentPath.endsWith(".mdx")});
	return{...baseMeta(),html,searchText:excerptMarkdown(body,4000)};
}

async function refresh(){
	liveIndexHealthy=false;loading=true;error="";
	try{
		const baseResponse=await fetch("/api/admin-content-index.json",{cache:"no-store"});
		if(!baseResponse.ok)throw new Error("读取构建期内容索引失败。");
		const base=await baseResponse.json();
		deletedRows=[];const map=new Map<string,Row>((base.posts as BasePost[]).map(p=>[p.id,{...p,live:false,baseGitSha:"",revision:""}]));
		try{
			const live=await fetchLiveContentIndex("post",session);
			for(const e of live.entries){
				if(e.deleted){deletedRows.push({id:e.id,path:e.path||"",revision:e.revision||""});map.delete(e.id);continue;}
				const old=map.get(e.id);const m=e.meta as Partial<BasePost>;
				map.set(e.id,{id:e.id,path:e.path||old?.path||`src/content/posts/${e.id}.md`,title:String(m.title??old?.title??e.id),description:String(m.description??old?.description??""),published:String(m.published??old?.published??""),updated:String(m.updated??old?.updated??""),category:String(m.category??old?.category??""),tags:Array.isArray(m.tags)?m.tags.map(String):(old?.tags||[]),draft:Boolean(m.draft??old?.draft??false),pinned:Boolean(m.pinned??old?.pinned??false),image:String(m.image??old?.image??""),live:true,baseGitSha:e.baseGitSha||"",revision:e.revision||""});
			}
		}catch(e){throw new Error("实时内容索引读取失败：已停止刷新，避免将过期 Git 列表误认为实时数据。", {cause:e});}
		liveIndexHealthy=true;rows=[...map.values()].sort((a,b)=>Date.parse(b.published||"0")-Date.parse(a.published||"0"));
	}catch(e){liveIndexHealthy=false;error=e instanceof Error?e.message:"文章列表读取失败。";}finally{loading=false;}
}

async function open(row:Row){if(saving||deleting||opening||!guardUnsaved())return;
	historyEntries=[];historyRevision="";opening=true;error="";message="";
	try{
		let source="";let sha=row.baseGitSha;
		if(row.live){const live=await fetchLiveContentItem("post",row.id,session);if(live?.source){source=live.source;sha=live.baseGitSha||sha;liveRevision=live.revision||row.revision||"";}}else{liveRevision="";}
		if(!source){const git=await fetchGitContentSource(session,row.path);source=git.source;sha=git.sha;}
		const parsed=parsePostDocument(source);
		currentId=row.id;currentPath=row.path;loadedPath=row.path;baseGitSha=sha;originalSource=source;fields=parsed.fields;body=parsed.body;tagsText=fields.tags.join(", ");
		savedEditorSnapshot=editorSnapshot();await updatePreview();
	}catch(e){error=e instanceof Error?e.message:"读取文章失败。";}finally{opening=false;}
}

function createNew(){if(saving||deleting||opening||!guardUnsaved())return;const stamp=new Date().toISOString().replace(/[-:]/g,"").slice(0,13).replace("T","-").toLowerCase();historyEntries=[];historyRevision="";currentId="";currentPath=`src/content/posts/${stamp}.md`;loadedPath="";baseGitSha="";liveRevision="";originalSource="";fields=emptyPostFields();body="# 新文章\n\n";tagsText="";message="新文章尚未写入 Blob。";error="";savedEditorSnapshot=editorSnapshot();void updatePreview();}

async function save(){if(!liveIndexHealthy){error="实时内容索引尚未成功同步，请刷新列表后重试保存。";return;}
	if(!fields.title.trim()){error="标题不能为空。";return;}
	let path:string;try{path=normalizePath(currentPath);}catch(e){error=e instanceof Error?e.message:"路径无效。";return;}
	fields={...fields,tags:baseMeta().tags};
	const nextId=idFromPath(path);if(rows.some((row)=>row.id===nextId&&row.id!==currentId)){error="目标文章路径已经存在，请换一个文件路径。";return;}const source=buildPostDocument(fields,body,originalSource);saving=true;error="";message="";
	try{
		const publicMeta=await liveMeta();
		const result=await saveLiveContentItem({session,kind:"post",id:nextId,path,source,meta:publicMeta,baseGitSha,baseGitBranch:session.branch,expectedRevision:liveRevision,previousId:currentId&&currentId!==nextId?currentId:undefined,previousPath:currentId&&currentId!==nextId?loadedPath:undefined,previousBaseGitSha:currentId&&currentId!==nextId?baseGitSha:undefined,previousBaseGitBranch:session.branch});
		currentId=nextId;currentPath=path;loadedPath=path;liveRevision=result.revision;originalSource=source;savedEditorSnapshot=editorSnapshot();try{clearDraft(window.sessionStorage,"post",session.login);}catch{}message=`实时版本已保存：${result.revision.slice(0,8)}。未创建 Git commit。`;await refresh();
	}catch(e){error=e instanceof Error?e.message:"保存失败。";}finally{saving=false;}
}

async function remove(){if(!liveIndexHealthy){error="实时内容索引尚未成功同步，请刷新列表后重试删除。";return;}
	if(!currentId||!confirm(`确定将 ${currentPath} 从实时内容中删除？Git 归档前不会删除仓库文件。`))return;
	deleting=true;error="";message="";
	try{await deleteLiveContentItem({session,kind:"post",id:currentId,path:loadedPath||currentPath,meta:baseMeta(),baseGitSha,baseGitBranch:session.branch,expectedRevision:liveRevision});currentId="";currentPath="";loadedPath="";originalSource="";liveRevision="";baseGitSha="";fields=emptyPostFields();body="";tagsText="";previewHtml="";savedEditorSnapshot=editorSnapshot();try{clearDraft(window.sessionStorage,"post",session.login);}catch{}await refresh();message="已写入实时删除标记；Git 仓库尚未改动。";}
	catch(e){error=e instanceof Error?e.message:"删除失败。";}finally{deleting=false;}
}

async function updatePreview(){try{previewHtml=await renderFireflyPreview({source:body,calloutTheme:siteConfig.post.rehypeCallouts.theme,isMdx:currentPath.endsWith(".mdx")});}catch(e){previewHtml=`<p>${e instanceof Error?e.message:"预览失败"}</p>`;}}
function schedulePreview(){if(previewTimer)clearTimeout(previewTimer);previewTimer=setTimeout(()=>void updatePreview(),180);}
async function openDeleted(item:{id:string;path:string;revision:string}){
 if(saving||deleting||opening||!guardUnsaved())return;
 currentId=item.id;currentPath=item.path;loadedPath=item.path;
 liveRevision=item.revision;baseGitSha="";originalSource="";body="";
 fields=emptyPostFields();tagsText="";
 historyEntries=[];historyRevision="";previewHtml="";
 savedEditorSnapshot=editorSnapshot();
 message="已选中删除记录。请从历史版本中选择需要恢复的内容。";error="";
 await loadHistory();
}
async function loadHistory(){
 if(!currentId || historyLoading)return;
 historyLoading=true;error="";
 try{historyEntries=await fetchLiveContentHistory("post",currentId,session);historyRevision=historyEntries[0]?.revision||"";}
 catch(e){error=e instanceof Error?e.message:"读取历史版本失败。";}
 finally{historyLoading=false;}
}
async function restoreHistory(){
 if(!currentId||!historyRevision||saving||deleting||!guardUnsaved())return;
 if(!confirm("确定恢复这个历史版本？当前已发布内容会产生一个新的 revision，仍可通过历史记录找回。"))return;
 saving=true;error="";message="";
 try{
  await restoreLiveContentRevision({session,kind:"post",id:currentId,revision:historyRevision,expectedRevision:liveRevision});
  const restoredId=currentId;
  currentId="";currentPath="";savedEditorSnapshot="";
  historyEntries=[];historyRevision="";
  await refresh();
  const row=rows.find(item=>item.id===restoredId);
  saving=false;
  if(row)await open(row);
  message="已恢复历史版本并生成新的实时 revision。";
 }catch(e){error=e instanceof Error?e.message:"恢复历史失败。";}
 finally{saving=false;}
}

onMount(()=>{
 void refresh();
 const store=window.sessionStorage;
 const local=readDraft(store,"post",session.login);
 if(local && confirm("发现上次未保存的文章草稿，是否恢复？")){
  try{
   const draft=JSON.parse(local.snapshot);
   if(typeof draft.currentPath==="string" && typeof draft.body==="string" && draft.fields && typeof draft.fields==="object"){
    currentPath=draft.currentPath;fields=draft.fields;body=draft.body;
    tagsText=typeof draft.tagsText==="string"?draft.tagsText:"";
    currentId="";loadedPath="";baseGitSha="";liveRevision="";originalSource="";
    savedEditorSnapshot="";void updatePreview();
   }
  }catch{/* Ignore corrupt private draft data */ }
 }
 const persist=()=>{
  try{
   const snapshot=editorSnapshot();
   if(currentPath && snapshot!==savedEditorSnapshot)writeDraft(store,"post",session.login,snapshot);
   else if(snapshot===savedEditorSnapshot)clearDraft(store,"post",session.login);
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

<section class="manager card-base">
<header><div><h2>文章管理</h2><p>列表轻量合并静态索引和 Blob 覆盖；打开单篇时才读取 Git 基线。</p></div><div class="actions"><button onclick={()=>refresh()} disabled={loading}>刷新</button><button class="primary" onclick={createNew}>新建</button></div></header>
<div class="layout">
<aside><input class="search" type="search" bind:value={query} placeholder="搜索文章"/><div class="list">{#if loading}<p>读取中...</p>{:else}{#each filtered() as row}<button class:active={row.id===currentId} onclick={()=>open(row)}><strong>{row.title}</strong><span>{row.category||"未分类"} · {row.live?"实时":"Git"}</span><small>{row.path}</small></button>{/each}{/if}</div>{#if deletedRows.length}<div class="deleted-entries"><strong>已删除 ({deletedRows.length})</strong>{#each deletedRows as item}<button type="button" onclick={()=>openDeleted(item)} title="查看历史并恢复">{item.id} · 恢复</button>{/each}</div>{/if}</aside>
<div class="editor">
<div class="grid">
<label class="wide"><span>标题</span><input bind:value={fields.title}/></label>
<label class="wide"><span>文件路径</span><input bind:value={currentPath}/></label>
<label><span>发布时间</span><input bind:value={fields.published}/></label><label><span>更新时间</span><input bind:value={fields.updated}/></label>
<label><span>slug（不控制文件名）</span><input bind:value={fields.slug}/></label><label><span>分类</span><input bind:value={fields.category}/></label>
<label class="wide"><span>标签</span><input bind:value={tagsText}/></label>
<label class="wide"><span>描述</span><textarea rows="3" bind:value={fields.description}></textarea></label>
<label class="wide"><span>封面</span><input bind:value={fields.image}/></label>
<label><span>系列</span><input bind:value={fields.series}/></label><label><span>系列顺序</span><input type="number" bind:value={fields.seriesOrder}/></label>
<label><span>语言</span><input bind:value={fields.lang}/></label><label><span>作者</span><input bind:value={fields.author}/></label>
<label class="wide"><span>来源链接</span><input bind:value={fields.sourceLink}/></label>
<label><span>许可证</span><input bind:value={fields.licenseName}/></label><label><span>许可证链接</span><input bind:value={fields.licenseUrl}/></label>
<label><span>密码</span><input bind:value={fields.password}/></label><label><span>密码提示</span><input bind:value={fields.passwordHint}/></label>
</div>
<div class="checks"><label><input type="checkbox" bind:checked={fields.draft}/>草稿</label><label><input type="checkbox" bind:checked={fields.pinned}/>置顶</label><label><input type="checkbox" bind:checked={fields.comment}/>评论</label></div>
<label class="body"><span>正文 Markdown / MDX</span><textarea bind:value={body} oninput={schedulePreview}></textarea></label>
{#if needsStaticSecurityRebuild()}
<div class="security-warning">这篇文章已经存在于当前静态构建中。实时层可以立刻把它从索引隐藏并让正常浏览跳转 404，但旧 HTML 仍可能被直接缓存或读取；密码保护/真正下线需要后续 Git 归档并重新构建后才彻底生效。</div>
{/if}
<div class="history-controls">
 <button type="button" onclick={loadHistory} disabled={!currentId||historyLoading}>{historyLoading?"读取历史中...":"查看历史版本"}</button>
 {#if historyEntries.length}
  <select bind:value={historyRevision} aria-label="选择历史版本">
   {#each historyEntries as revision}
    <option value={revision.revision}>{revision.updatedAt} · {String(revision.meta?.title||revision.meta?.excerpt||revision.revision.slice(0,8))}</option>
   {/each}
  </select>
  <button type="button" onclick={restoreHistory} disabled={!historyRevision||saving||deleting}>恢复所选版本</button>
 {/if}
</div>
<div class="status"><div>{#if opening}<span>读取源码...</span>{/if}{#if message}<span class="ok">{message}</span>{/if}{#if error}<span class="bad">{error}</span>{/if}</div><div class="actions"><button class="danger" onclick={remove} disabled={!currentId||saving||deleting}>删除实时版本</button><button class="primary" onclick={save} disabled={saving||deleting||opening}>{saving?"保存中...":"实时保存"}</button></div></div>
</div>
<div class="preview"><strong>正文预览</strong><div class="prose prose-base max-w-none custom-md dark:prose-invert">{@html previewHtml}</div></div>
</div>
</section>
<style>
.deleted-entries{display:grid;gap:.4rem;padding:.8rem 0;border-top:1px solid var(--line-divider)}.deleted-entries strong{font-size:.8rem;color:#b55050}.deleted-entries button{text-align:left;overflow-wrap:anywhere}
.history-controls{display:flex;flex-wrap:wrap;gap:.45rem;padding:.7rem 0;align-items:center}.history-controls select{max-width:100%;min-width:9rem;border:1px solid var(--line-divider);border-radius:.5rem;background:var(--card-bg);color:inherit;padding:.5rem}
.manager{overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem;border-bottom:1px solid var(--line-divider)}h2{margin:0;font-size:1.05rem}header p{margin:.25rem 0 0;font-size:.76rem;opacity:.58}.actions{display:flex;gap:.45rem}button{border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;padding:.55rem .7rem;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}button.primary{background:var(--primary);border-color:var(--primary);color:white}button.danger{color:#c43d3d;border-color:rgb(196 61 61/.3)}button:disabled{opacity:.5;cursor:not-allowed}.layout{display:grid;grid-template-columns:17rem minmax(28rem,1fr) minmax(22rem,.8fr);min-height:68vh}aside{padding:.75rem;border-right:1px solid var(--line-divider)}.search,.grid input,.grid textarea,.body textarea{width:100%;border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;font:inherit}.search{padding:.62rem}.list{display:grid;gap:.3rem;margin-top:.6rem;max-height:64vh;overflow:auto}.list button{display:grid;text-align:left;gap:.15rem}.list button.active{border-color:var(--primary);background:color-mix(in oklab,var(--primary) 9%,transparent)}.list span,.list small{font-size:.67rem;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.editor{padding:.9rem;border-right:1px solid var(--line-divider);min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.grid label,.body{display:grid;gap:.3rem;font-size:.72rem;font-weight:700}.grid .wide{grid-column:span 2}.grid input,.grid textarea{padding:.6rem}.checks{display:flex;gap:1rem;margin:.8rem 0;font-size:.76rem}.checks label{display:flex;align-items:center;gap:.3rem}.body textarea{min-height:25rem;padding:.7rem;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6}.status{display:flex;justify-content:space-between;gap:.7rem;align-items:center;margin-top:.7rem;font-size:.7rem}.status>div:first-child{display:grid}.ok{color:#059669}.bad{color:#c43d3d}.security-warning{margin-top:.7rem;padding:.7rem .8rem;border:1px solid rgb(217 119 6/.28);border-radius:.55rem;background:rgb(217 119 6/.08);color:#b45309;font-size:.72rem;line-height:1.55}.preview{padding:1rem;overflow:auto;max-height:68vh}.preview>strong{display:block;margin-bottom:.8rem}@media(max-width:1380px){.layout{grid-template-columns:16rem minmax(0,1fr)}.preview{grid-column:1/-1;border-top:1px solid var(--line-divider);max-height:none}}@media(max-width:800px){header{align-items:flex-start;flex-direction:column}.layout{grid-template-columns:1fr}aside,.editor{border-right:0;border-bottom:1px solid var(--line-divider)}.list{max-height:16rem}.grid{grid-template-columns:1fr}.grid .wide{grid-column:auto}.status{align-items:flex-start;flex-direction:column}}
</style>
