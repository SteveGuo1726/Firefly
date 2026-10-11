<script lang="ts">
import { onMount, tick } from "svelte";
import { uploadImageBedFile } from "@/utils/admin/imagebed-client";
import { markdownImage, insertMarkdownAt } from "@/utils/admin/editor-image";
import { readDraft, writeDraft, clearDraft } from "@/utils/admin/draft-storage";
import { siteConfig } from "@/config/siteConfig";
import { processCoverImageSync, getApiUrlList } from "@/utils/image-utils";
import fallbackCover from "@/assets/images/cover.avif";
import "@/styles/markdown.css";
import "@/styles/markdown-extend.styl";
import "@/styles/expressive-code.css";
import type { GitHubAdminSession } from "@/utils/admin/github-session";
import { buildPostDocument, emptyPostFields, excerptMarkdown, parsePostDocument, type AdminPostFields } from "@/utils/admin/content-format";
import { fetchGitContentSource } from "@/utils/admin/github-content-reader";
import { fetchPrivatePostIndex } from "@/utils/admin/private-content-index";
import { deleteLiveContentItem, fetchLiveContentIndex, fetchLiveContentItem, saveLiveContentItem, fetchLiveContentHistory, restoreLiveContentRevision, undoGitBaselineDeletion, type LiveHistoryEntry } from "@/utils/admin/live-content-client";
import { createPreviewController } from "@/utils/admin/preview-controller";

export let session:GitHubAdminSession;
type BasePost={id:string;path:string;title:string;description:string;published:string;updated:string;category:string;tags:string[];draft:boolean;pinned:boolean;image:string};
type Row=BasePost&{live:boolean;baseGitSha:string;revision:string};

let rows:Row[]=[];let query="";let listFilter:"all"|"drafts"|"published"="all";let loading=false;let opening=false;let saving=false;let deleting=false;
let currentId="";let currentPath="";let loadedPath="";let baseGitSha="";let liveRevision="";let originalSource="";
let fields:AdminPostFields=emptyPostFields();let body="";let tagsText="";let previewHtml="";let message="";let error="";
let previewPresentation:"article"|"body"="article";
let previewViewport:"desktop"|"mobile"="desktop";
let dockedPreview=false;
let previewScrollPanel:HTMLElement|null=null;
let syncingScrollFrom:"source"|"preview"|null=null;
type ScrollAnchor={source:number;preview:number};
let lineMeasurementCache:{text:string;width:number;font:string;positions:Map<number,number>}|null=null;

/* A hidden pre-wrapped mirror measures the actual Y coordinate of Markdown
   source lines, including wrapped URLs and long code. Simple line ratios are
   wrong as soon as one paragraph occupies several visual lines. */
function measureSourceLines(source:HTMLTextAreaElement):Map<number,number>{
 const style=getComputedStyle(source);
 const value=source.value,width=source.clientWidth,font=style.font;
 if(lineMeasurementCache?.text===value&&lineMeasurementCache.width===width&&lineMeasurementCache.font===font)return lineMeasurementCache.positions;
 const mirror=document.createElement("div");
 Object.assign(mirror.style,{
  position:"fixed",left:"-99999px",top:"0",visibility:"hidden",pointerEvents:"none",
  boxSizing:"border-box",width:`${source.offsetWidth}px`,font:style.font,lineHeight:style.lineHeight,
  letterSpacing:style.letterSpacing,wordSpacing:style.wordSpacing,padding:style.padding,
  border:style.border,tabSize:style.tabSize,whiteSpace:"pre-wrap",overflowWrap:style.overflowWrap,
  wordBreak:style.wordBreak,textAlign:style.textAlign,
 });
 const fragment=document.createDocumentFragment();
 const markers:HTMLElement[]=[];
 const lines=value.split("\n");
 for(let i=0;i<lines.length;i++){
  const span=document.createElement("span");
  span.textContent="\u200b";
  fragment.append(span,document.createTextNode(lines[i]));
  if(i!==lines.length-1)fragment.append(document.createTextNode("\n"));
  markers.push(span);
 }
 mirror.append(fragment);
 document.body.append(mirror);
 const top=mirror.getBoundingClientRect().top;
 const positions=new Map<number,number>();
 for(let i=0;i<markers.length;i++)positions.set(i+1,markers[i].getBoundingClientRect().top-top);
 mirror.remove();
 lineMeasurementCache={text:value,width,font,positions};
 return positions;
}

/* Match the nearest rendered headings/paragraphs, then interpolate within each
   pair. Clamp at scroll limits and use progress matching only for raw MDX
   components with no usable source markers. */
function alignPreviewToSource(from:"source"|"preview",source:HTMLTextAreaElement,preview:HTMLElement):number{
 const sourceMax=Math.max(0,source.scrollHeight-source.clientHeight);
 const previewMax=Math.max(0,preview.scrollHeight-preview.clientHeight);
 const ratio=from==="source"?(sourceMax?source.scrollTop/sourceMax:0):(previewMax?preview.scrollTop/previewMax:0);
 const fallback=ratio*(from==="source"?previewMax:sourceMax);
 const nodes=Array.from(preview.querySelectorAll<HTMLElement>("[data-source-line]"));
 if(nodes.length<2)return fallback;
 const positions=measureSourceLines(source);
 const previewBounds=preview.getBoundingClientRect();
 const anchors:ScrollAnchor[]=[{source:0,preview:0}];
 for(const node of nodes){
  const line=Number(node.dataset.sourceLine),y=positions.get(line);
  if(!line||y===undefined||y<0)continue;
  const x=node.getBoundingClientRect().top-previewBounds.top+preview.scrollTop-preview.clientTop;
  if(x<0)continue;
  const last=anchors[anchors.length-1];
  if(y>last.source+1&&x>last.preview+1&&y<sourceMax&&x<previewMax)anchors.push({source:y,preview:x});
 }
 if(anchors.length<2)return fallback;
 anchors.push({source:sourceMax,preview:previewMax});
 const current=from==="source"?source.scrollTop:preview.scrollTop;
 const axis=from==="source"?"source":"preview";
 const other=from==="source"?"preview":"source";
 for(let i=1;i<anchors.length;i++){
  const left=anchors[i-1],right=anchors[i];
  if(current<=right[axis]||i===anchors.length-1){
   const gap=right[axis]-left[axis];
   if(gap<=0)return fallback;
   const fraction=Math.max(0,Math.min(1,(current-left[axis])/gap));
   return Math.max(0,Math.min(from==="source"?previewMax:sourceMax,left[other]+fraction*(right[other]-left[other])));
  }
 }
 return fallback;
}
function syncDockedScroll(from:"source"|"preview"){
 if(!dockedPreview||syncingScrollFrom&&syncingScrollFrom!==from)return;
 const source=editorTextarea,preview=previewScrollPanel;
 if(!source||!preview)return;
 const target=from==="source"?preview:source;
 const targetTop=alignPreviewToSource(from,source,preview);
 if(!Number.isFinite(targetTop)||Math.abs(target.scrollTop-targetTop)<2)return;
 syncingScrollFrom=from;
 target.scrollTop=targetTop;
 requestAnimationFrame(()=>{if(syncingScrollFrom===from)syncingScrollFrom=null;});
}
/* Clicking a rendered heading or paragraph places the source caret on its
   original Markdown line, useful when the two pane heights differ greatly. */
function locateSourceFromPreview(event:MouseEvent){
 if(!dockedPreview||!editorTextarea||!previewScrollPanel)return;
 const target=event.target;
 if(!(target instanceof Element)||target.closest("a,button,input,select,textarea,summary"))return;
 const block=target.closest<HTMLElement>("[data-source-line]");
 if(!block||!previewScrollPanel.contains(block))return;
 const line=Number(block.dataset.sourceLine),lines=editorTextarea.value.split("\n");
 if(!Number.isInteger(line)||line<1||line>lines.length)return;
 const y=measureSourceLines(editorTextarea).get(line);
 if(y===undefined)return;
 let charIndex=0;
 for(let i=0;i<line-1;i++)charIndex+=lines[i].length+1;
 editorTextarea.focus({preventScroll:true});
 editorTextarea.setSelectionRange(charIndex,charIndex);
 editorTextarea.scrollTop=Math.max(0,y-12);
 syncDockedScroll("source");
}
function toggleDockedPreview(){
 dockedPreview=!dockedPreview;
 if(dockedPreview){previewPresentation="body";previewViewport="desktop";}
}
function previewCoverUrl(){
 const resolved=processCoverImageSync(fields.image,currentId||currentPath);
 if(!resolved||/^(?:https?:)?\/\//i.test(resolved)||/^(?:data:|blob:|\/)/.test(resolved))return resolved;
 const parts=currentPath.split("/");parts.pop();
 for(const part of resolved.split("/")){if(!part||part===".")continue;if(part==="..")parts.pop();else parts.push(part);}
 return "https://raw.githubusercontent.com/SteveGuo1726/Firefly/"+encodeURIComponent(session.branch||"master")+"/"+parts.join("/");
}
function retryCover(event:Event){
 const image=event.currentTarget as HTMLImageElement;
 const candidates=getApiUrlList(fields.image,currentId||currentPath);
 const current=new URL(image.src,window.location.href).href;
 const index=candidates.findIndex(candidate=>new URL(candidate,window.location.href).href===current);
 const next=index+1;
 if(fields.image==="api"&&index>=0&&next<candidates.length){image.src=candidates[next];return;}
 const fallback=fallbackCover.src;
 if(current!==new URL(fallback,window.location.href).href){image.src=fallback;return;}
 image.style.display="none";
}
let previewLoading=false;let previewFailure="";
let previewRoot:HTMLElement|null=null;
let previewEnhancementVersion=0;
async function enhanceArticlePreview(){
 const version=++previewEnhancementVersion;
 await tick();
 const root=previewRoot;
 if(!root || version!==previewEnhancementVersion || !previewHtml)return;
 try{
  const {enhanceFireflyPreview}=await import("@/utils/write/preview");
  if(version!==previewEnhancementVersion || root!==previewRoot)return;
  await enhanceFireflyPreview({
   container:root,
   repoConfig:{owner:"SteveGuo1726",repo:"Firefly",branch:session.branch||"master"},
   postFilePath:currentPath||"src/content/posts/new.md",
  });
 }catch(err){
  if(version===previewEnhancementVersion)previewFailure="部分图片或富内容预览增强失败，请检查资源地址。";
 }
}

let savedEditorSnapshot="";
let imageUploading=false;let editorTextarea:HTMLTextAreaElement|null=null;
let liveIndexHealthy=false;
let limitedGitIndex=false;
let deletedRows:{id:string;path:string;revision:string;baseGitSha:string}[]=[];
let deletedGitSha="";
let historyEntries:LiveHistoryEntry[]=[];let historyRevision="";let historyLoading=false;
function editorSnapshot(){return JSON.stringify({currentId,currentPath,loadedPath,baseGitSha,liveRevision,originalSource,fields,body,tagsText});}
function guardUnsaved(){return !savedEditorSnapshot || editorSnapshot()===savedEditorSnapshot || confirm("当前有未保存的编辑内容。继续将丢失这些修改，确定切换吗？");}


function filtered(data:Row[],text:string,status:"all"|"drafts"|"published"){const n=text.trim().toLowerCase();return data.filter(r=>(status==="all"||(status==="drafts"?r.draft:!r.draft))&&(!n||[r.title,r.description,r.category,r.tags.join(" "),r.path].join(" ").toLowerCase().includes(n)));}
function idFromPath(path:string){return path.replace(/^src\/content\/posts\//,"").replace(/\.(?:md|mdx)$/i,"");}
function normalizePath(value:string){const relative=value.trim().replace(/^src\/content\/posts\//,"").replace(/^\/+/, "");if(!relative||relative.includes("..")||relative.includes("\\")||!/\.(md|mdx)$/i.test(relative))throw new Error("文件路径必须位于 src/content/posts/ 下，并以 .md 或 .mdx 结尾。");return"src/content/posts/"+relative;}
function baseMeta(){return{title:fields.title.trim(),description:fields.description.trim(),published:fields.published,updated:fields.updated,category:fields.category.trim(),tags:tagsText.split(/[,\n]/).map(v=>v.trim()).filter(Boolean),draft:fields.draft,pinned:fields.pinned,image:fields.image.trim(),protected:Boolean(fields.password),comment:fields.comment};}
function needsStaticSecurityRebuild(){return Boolean(baseGitSha&&(fields.draft||fields.password.trim()));}
async function liveMeta(){
	const html=await previewController.renderNow({source:body,isMdx:currentPath.endsWith(".mdx")});
	return{...baseMeta(),html,searchText:excerptMarkdown(body,4000)};
}

async function refresh(refreshGit=false){
	liveIndexHealthy=false;loading=true;error="";
	try{
		const baseResponse=await fetch("/api/admin-content-index.json",{cache:"no-store"});
		if(!baseResponse.ok)throw new Error("读取构建期内容索引失败。");
		const base=await baseResponse.json();
		const privatePosts=await fetchPrivatePostIndex(session,base.posts as BasePost[],refreshGit);
        limitedGitIndex=Boolean((privatePosts as unknown as {limited?:boolean}).limited);
		deletedRows=[];const map=new Map<string,Row>(privatePosts.map(p=>[p.id,{...p,live:false,baseGitSha:"",revision:""}]));
		try{
			const live=await fetchLiveContentIndex("post",session);
			for(const e of live.entries){
				if(e.deleted){deletedRows.push({id:e.id,path:e.path||"",revision:e.revision||"",baseGitSha:e.baseGitSha||""});map.delete(e.id);continue;}
				const old=map.get(e.id);const m=e.meta as Partial<BasePost>;
				map.set(e.id,{id:e.id,path:e.path||old?.path||`src/content/posts/${e.id}.md`,title:String(m.title??old?.title??e.id),description:String(m.description??old?.description??""),published:String(m.published??old?.published??""),updated:String(m.updated??old?.updated??""),category:String(m.category??old?.category??""),tags:Array.isArray(m.tags)?m.tags.map(String):(old?.tags||[]),draft:Boolean(m.draft??old?.draft??false),pinned:Boolean(m.pinned??old?.pinned??false),image:String(m.image??old?.image??""),live:true,baseGitSha:e.baseGitSha||"",revision:e.revision||""});
			}
		}catch(e){throw new Error("实时内容索引读取失败：已停止刷新，避免将过期 Git 列表误认为实时数据。", {cause:e});}
		liveIndexHealthy=true;rows=[...map.values()].sort((a,b)=>Date.parse(b.published||"0")-Date.parse(a.published||"0"));
	}catch(e){liveIndexHealthy=false;error=e instanceof Error?e.message:"文章列表读取失败。";}finally{loading=false;}
}

async function open(row:Row){if(saving||deleting||opening||!guardUnsaved())return;
	historyEntries=[];historyRevision="";deletedGitSha="";opening=true;error="";message="";previewController.cancel();previewHtml="";previewLoading=false;previewFailure="";
	try{
		let source="";let sha=row.baseGitSha;
		if(row.live){const live=await fetchLiveContentItem("post",row.id,session);if(live?.source){source=live.source;sha=live.baseGitSha||sha;liveRevision=live.revision||row.revision||"";}}else{liveRevision="";}
		if(!source){const git=await fetchGitContentSource(session,row.path);source=git.source;sha=git.sha;}
		const parsed=parsePostDocument(source);
		currentId=row.id;currentPath=row.path;loadedPath=row.path;baseGitSha=sha;originalSource=source;fields=parsed.fields;body=parsed.body;tagsText=fields.tags.join(", ");
		savedEditorSnapshot=editorSnapshot();updatePreview();
	}catch(e){error=e instanceof Error?e.message:"读取文章失败。";}finally{opening=false;}
}

function createNew(){if(saving||deleting||opening||!guardUnsaved())return;const stamp=new Date().toISOString().replace(/[-:]/g,"").slice(0,13).replace("T","-").toLowerCase();historyEntries=[];historyRevision="";deletedGitSha="";currentId="";currentPath=`src/content/posts/${stamp}.md`;loadedPath="";baseGitSha="";liveRevision="";originalSource="";fields=emptyPostFields();body="# 新文章\n\n";tagsText="";message="新文章尚未写入 Blob。";error="";savedEditorSnapshot=editorSnapshot();void updatePreview();}

async function save(){if(imageUploading){error="请等待图片上传完成后再保存。";return;}if(!liveIndexHealthy){error="实时内容索引尚未成功同步，请刷新列表后重试保存。";return;}
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
	try{await deleteLiveContentItem({session,kind:"post",id:currentId,path:loadedPath||currentPath,meta:baseMeta(),baseGitSha,baseGitBranch:session.branch,expectedRevision:liveRevision});currentId="";currentPath="";loadedPath="";originalSource="";liveRevision="";baseGitSha="";fields=emptyPostFields();body="";tagsText="";previewController.cancel();previewHtml="";previewLoading=false;previewFailure="";savedEditorSnapshot=editorSnapshot();try{clearDraft(window.sessionStorage,"post",session.login);}catch{}await refresh();message="已写入实时删除标记；Git 仓库尚未改动。";}
	catch(e){error=e instanceof Error?e.message:"删除失败。";}finally{deleting=false;}
}

// Lazily load the expensive Markdown/MDX renderer; never display stale results.
const previewController=createPreviewController(
 async document=>{
  const {renderFireflyPreview}=await import("@/utils/write/preview");
  return renderFireflyPreview({
   source:document.source,calloutTheme:siteConfig.post.rehypeCallouts.theme,
   ...(document.isMdx?{isMdx:true}:{})
  });
 },
 {
  onReady:html=>{previewHtml=html;previewLoading=false;previewFailure="";void enhanceArticlePreview();},
  onBusy:()=>{++previewEnhancementVersion;previewLoading=true;previewFailure="";previewHtml="";},
  onFailure:message=>{previewHtml="";previewLoading=false;previewFailure=message;},
 },
);
function updatePreview(){previewController.schedule({source:body,isMdx:currentPath.endsWith(".mdx")},true);}
function schedulePreview(){previewController.schedule({source:body,isMdx:currentPath.endsWith(".mdx")});}
async function openDeleted(item:{id:string;path:string;revision:string;baseGitSha:string}){
 if(saving||deleting||opening||!guardUnsaved())return;
 currentId=item.id;currentPath=item.path;loadedPath=item.path;
 liveRevision=item.revision;baseGitSha=item.baseGitSha;deletedGitSha=item.baseGitSha;originalSource="";body="";
 fields=emptyPostFields();tagsText="";
 historyEntries=[];historyRevision="";previewController.cancel();previewHtml="";previewLoading=false;previewFailure="";
 savedEditorSnapshot=editorSnapshot();
 message="已选中删除记录。请从历史版本中选择需要恢复的内容。";error="";
 await loadHistory();
}
async function undoGitDelete(){
 if(!currentId || !deletedGitSha || !liveRevision || saving || deleting || !guardUnsaved())return;
 if(!confirm("撤销 Git 原有内容的实时删除标记？服务端将先核实 Git 文件未变化。"))return;
 deleting=true;error="";message="";
 try{
  await undoGitBaselineDeletion({session,kind:"post",id:currentId,expectedRevision:liveRevision});
  currentId="";currentPath="";loadedPath="";liveRevision="";deletedGitSha="";
  historyEntries=[];historyRevision="";savedEditorSnapshot="";
  await refresh();
  message="已撤销删除标记，原始 Git 内容重新公开。";
 }catch(e){error=e instanceof Error?e.message:"撤销删除失败。";}
 finally{deleting=false;}
}
async function uploadEditorImage(event:Event){
 const input=event.currentTarget as HTMLInputElement;
 const file=input.files?.[0];
 input.value="";
 if(!file)return;
 if(!file.type.startsWith("image/")||file.size>30*1024*1024){
  error="仅支持不超过 30 MB 的图片。";return;
 }
 imageUploading=true;error="";message="";
 try{
  const beforeUpload=body;
  const position=editorTextarea?.selectionStart??body.length;
  const ending=editorTextarea?.selectionEnd??position;
  const image=await uploadImageBedFile(file,"blog");
  const editedDuringUpload=body!==beforeUpload;
  const result=insertMarkdownAt(body,editedDuringUpload?body.length:position,editedDuringUpload?body.length:ending,markdownImage(file.name,image.url));
  body=result.value;
  await tick();
  editorTextarea?.focus();
  editorTextarea?.setSelectionRange(result.caret,result.caret);
  await updatePreview();
  message="图片上传完成，已插入编辑器。";
 }catch(e){error=e instanceof Error?e.message:"图片上传失败，原有正文未改动。";}
 finally{imageUploading=false;}
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
    currentId=typeof draft.currentId==="string"?draft.currentId:"";
    loadedPath=typeof draft.loadedPath==="string"?draft.loadedPath:"";
    baseGitSha=typeof draft.baseGitSha==="string"?draft.baseGitSha:"";
    liveRevision=typeof draft.liveRevision==="string"?draft.liveRevision:"";
    originalSource=typeof draft.originalSource==="string"?draft.originalSource:"";
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
  previewController.clear();
 };
});
</script>

<section class="manager card-base">
<header><div><h2>文章管理</h2><p>列表轻量合并静态索引和 Blob 覆盖；打开单篇时才读取 Git 基线。</p></div><div class="actions"><button onclick={()=>refresh(true)} disabled={loading}>刷新</button><button class="primary" onclick={createNew}>新建</button></div></header>
<div class="layout" class:docked={dockedPreview}>
<aside><input class="search" type="search" bind:value={query} placeholder="搜索文章"/>
<div class="post-list-filter" role="group" aria-label="文章状态筛选">
 <button type="button" class:active={listFilter==="all"} aria-pressed={listFilter==="all"} onclick={()=>listFilter="all"}>全部 {rows.length}</button>
 <button type="button" class:active={listFilter==="drafts"} aria-pressed={listFilter==="drafts"} onclick={()=>listFilter="drafts"}>草稿 {rows.filter(row=>row.draft).length}</button>
 <button type="button" class:active={listFilter==="published"} aria-pressed={listFilter==="published"} onclick={()=>listFilter="published"}>已发布 {rows.filter(row=>!row.draft).length}</button>
</div><div class="list">{#if loading}<p>读取中...</p>{:else}{#each filtered(rows,query,listFilter) as row}<button class:active={row.id===currentId} onclick={()=>open(row)}><strong>{row.title}</strong><span>{row.draft?"草稿 · ":"已发布 · "}{row.category||"未分类"} · {row.live?"实时":"Git"}</span><small>{row.path}</small></button>{/each}{/if}</div>{#if deletedRows.length}<div class="deleted-entries"><strong>已删除 ({deletedRows.length})</strong>{#each deletedRows as item}<button type="button" onclick={()=>openDeleted(item)} title="查看历史并恢复">{item.id} · 恢复</button>{/each}</div>{/if}</aside>
<div class="editor">
<div class="editor-intro">
 <label class="editor-title"><span>文章标题</span><input bind:value={fields.title} placeholder="给文章起一个标题"/></label>
 <div class="editor-intro-actions">
  <label class="draft-quick-toggle"><input type="checkbox" bind:checked={fields.draft}/><span>设为草稿</span></label>
  <button type="button" class="quick-preview-button" onclick={toggleDockedPreview}>{dockedPreview?"退出贴近预览":"贴近预览 ⇄"}</button>
 </div>
</div>
<details class="post-metadata">
 <summary><span>文章信息与其他设置</span><small>文件路径 · 时间 · 分类 · 标签 · 描述 · 封面</small></summary>
<div class="grid">
<label class="wide"><span>文件路径</span><input bind:value={currentPath}/></label>
<label><span>发布时间</span><input bind:value={fields.published}/></label><label><span>更新时间</span><input bind:value={fields.updated}/></label>
<label><span>分类</span><input bind:value={fields.category}/></label>
<label class="wide"><span>标签</span><input bind:value={tagsText}/></label>
<label class="wide"><span>描述</span><textarea rows="3" bind:value={fields.description}></textarea></label>
<label class="wide"><span>封面</span><input bind:value={fields.image}/></label>
<details class="advanced-fields wide">
 <summary>更多文章设置 <span>slug · 系列 · 作者 · 版权 · 访问保护</span></summary>
 <div class="grid">
 <label><span>slug（不控制文件名）</span><input bind:value={fields.slug}/></label>
 <label><span>系列</span><input bind:value={fields.series}/></label><label><span>系列顺序</span><input type="number" bind:value={fields.seriesOrder}/></label>
 <label><span>语言</span><input bind:value={fields.lang}/></label><label><span>作者</span><input bind:value={fields.author}/></label>
 <label class="wide"><span>来源链接</span><input bind:value={fields.sourceLink}/></label>
 <label><span>许可证</span><input bind:value={fields.licenseName}/></label><label><span>许可证链接</span><input bind:value={fields.licenseUrl}/></label>
 <label><span>密码</span><input bind:value={fields.password}/></label><label><span>密码提示</span><input bind:value={fields.passwordHint}/></label>
 </div>
</details>
</div>
<div class="checks"><label><input type="checkbox" bind:checked={fields.pinned}/>置顶</label><label><input type="checkbox" bind:checked={fields.comment}/>评论</label></div>
</details>
<label class="body"><span>正文 Markdown / MDX</span><textarea bind:this={editorTextarea} bind:value={body} oninput={schedulePreview} onscroll={()=>syncDockedScroll("source")} spellcheck="false"></textarea></label>
<label class="image-upload"><span>插入图片</span><input type="file" accept="image/*" onchange={uploadEditorImage} disabled={imageUploading}/>{#if imageUploading}<small>上传中，请勿关闭页面...</small>{/if}</label>
{#if needsStaticSecurityRebuild()}
<div class="security-warning">这篇文章已经存在于当前静态构建中。实时层可以立刻把它从索引隐藏并让正常浏览跳转 404，但旧 HTML 仍可能被直接缓存或读取；密码保护/真正下线需要后续 Git 归档并重新构建后才彻底生效。</div>
{/if}
{#if limitedGitIndex}<p role="status" class="security-warning">GitHub 实时索引暂时不可用；如看到草稿，来自实验站的已验证 Git 快照，可能不是最新版本。打开或保存前请核对文章内容与路径。</p>{/if}
<div class="history-controls">
 <button type="button" onclick={loadHistory} disabled={!currentId||historyLoading}>{historyLoading?"读取历史中...":"查看历史版本"}</button>
 {#if deletedGitSha && currentId && deletedRows.some(row=>row.id===currentId)}<button type="button" onclick={undoGitDelete} disabled={saving||deleting}>撤销 Git 内容删除</button>{/if}
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
<div class="preview">
 {#if previewLoading}<p role="status" class="preview-disclaimer">正在生成排版预览，可以继续编辑或切换文章...</p>{/if}
 {#if previewFailure}<p role="alert" class="security-warning">预览失败：{previewFailure}</p>{/if}
 <div class="preview-heading">
  <strong>实时排版预览</strong>
  <button type="button" class="dock-toggle" class:active={dockedPreview} aria-pressed={dockedPreview} onclick={toggleDockedPreview}>{dockedPreview?"退出贴近模式":"贴近模式 ⇄"}</button>
  <div class="preview-switch" role="group" aria-label="写作预览样式">
   <button type="button" class:active={previewPresentation==="article"} onclick={()=>previewPresentation="article"}>正式文章版式</button>
   <button type="button" class:active={previewPresentation==="body"} onclick={()=>previewPresentation="body"}>只看正文</button>
  </div>
  <div class="preview-switch" role="group" aria-label="预览设备">
   <button type="button" class:active={previewViewport==="desktop"} onclick={()=>previewViewport="desktop"}>电脑</button>
   <button type="button" class:active={previewViewport==="mobile"} onclick={()=>previewViewport="mobile"}>手机</button>
  </div>
 </div>
 <div class="preview-viewport" class:mobile-preview={previewViewport==="mobile"} bind:this={previewScrollPanel} onscroll={()=>syncDockedScroll("preview")} onclick={locateSourceFromPreview}>
 {#if previewPresentation==="article"}
  <article class="article-preview card-base relative w-full" aria-label="文章正式版式预览">
   <header class="article-preview-header">
    <h1 class="transition w-full block font-bold mb-3 text-3xl md:text-[2.25rem]/[2.75rem] text-black/90 dark:text-white/90">{fields.title || "未命名文章"}</h1>
    {#if fields.description}<p class="article-excerpt">{fields.description}</p>{/if}
    <div class="article-meta">
     <span>{fields.published || "尚未选择发布时间"}</span>
     {#if fields.category}<span>· {fields.category}</span>{/if}
     {#if fields.updated}<span>· 更新于 {fields.updated}</span>{/if}
     {#if fields.draft}<span class="draft-label">草稿</span>{/if}
     {#if fields.password}<span class="draft-label">受保护</span>{/if}
    </div>
    {#if tagsText.trim()}<div class="article-tags">{#each tagsText.split(/[,\n]/).map(tag=>tag.trim()).filter(Boolean) as tag}<span>#{tag}</span>{/each}</div>{/if}
    {#if fields.image}<img class="article-cover" src={previewCoverUrl()} alt={fields.title || "文章封面"} loading="lazy" referrerpolicy="no-referrer" onerror={retryCover} onload={(event)=>{event.currentTarget.style.display="";}}/>{/if}
   </header>
   <div class="prose prose-base max-w-none! custom-md dark:prose-invert mb-6 markdown-content" bind:this={previewRoot} data-preview-body>{@html previewHtml}</div>
  </article>
 {:else}
  <div class="prose prose-base max-w-none! custom-md dark:prose-invert mb-6 markdown-content" bind:this={previewRoot} data-preview-body>{@html previewHtml}</div>
 {/if}
 </div>
 <p class="preview-disclaimer">文章视图复用正式站点的标题字号与 Markdown 排版类；侧栏、评论、完整动画以及未保存的 MDX 动态组件效果仍应在发布后的实际预览页检查。</p>
 {#if currentId && !fields.draft && !fields.password}
  <a class="preview-open" href={"/posts/"+currentId+"/"} target="_blank" rel="noopener noreferrer">打开已保存的实际文章页 ↗</a>
 {/if}
</div>
</div>
</section>
<style>
 .advanced-fields{margin:.2rem 0 .6rem;border:1px solid var(--line-divider,#9994);border-radius:12px;padding:.55rem .75rem;background:var(--card-bg,transparent)}
 .advanced-fields summary{cursor:pointer;font-weight:650;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.3rem}
 .advanced-fields summary span{font-weight:400;opacity:.55;font-size:.75rem}
 .advanced-fields[open] .grid{margin-top:.85rem;padding-top:.7rem;border-top:1px solid #9993}
 .preview-viewport{max-width:100%;margin:0 auto;transition:max-width .18s ease}
 .preview-viewport.mobile-preview{max-width:390px;border:1px solid #9995;border-radius:15px;overflow:hidden;padding:12px;background:var(--card-bg,transparent);box-shadow:0 4px 22px #0001}
 .preview-viewport.mobile-preview .article-preview{padding:8px}
 .preview-viewport.mobile-preview h1{font-size:1.55rem;line-height:1.36}

.preview-heading{display:flex;justify-content:space-between;gap:.5rem;align-items:center;flex-wrap:wrap}
.preview-switch{display:flex;gap:.35rem;flex-wrap:wrap}
.preview-switch button{border:1px solid var(--line-divider);border-radius:.5rem;padding:.35rem .6rem;background:transparent;font-size:.72rem;cursor:pointer}
.preview-switch button.active{border-color:var(--primary);color:var(--primary)}
.article-preview{border:1px solid var(--line-divider);background:var(--card-bg);border-radius:1rem;padding:clamp(1rem,3vw,2rem);margin-top:.8rem;min-width:0}
.article-preview-header{margin-bottom:1.4rem}
.article-preview-header h1{overflow-wrap:anywhere;line-height:1.4}
.article-excerpt{font-size:.86rem;opacity:.7;line-height:1.65;margin:.1rem 0 .7rem}
.article-meta{display:flex;gap:.35rem;flex-wrap:wrap;font-size:.76rem;opacity:.7}
.article-tags{display:flex;flex-wrap:wrap;gap:.5rem;font-size:.76rem;color:var(--primary);margin-top:.5rem}
.article-cover{width:100%;max-height:22rem;object-fit:cover;border-radius:.9rem;margin-top:1rem}
.draft-label{border:1px solid currentColor;padding:0 .4rem;border-radius:.3rem}
.preview-disclaimer{font-size:.73rem;opacity:.65;line-height:1.5;margin-top:1rem}
.preview-open{display:inline-block;margin-top:.35rem;font-size:.78rem;color:var(--primary);text-decoration:underline}

.image-upload{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.45rem 0;font-size:.78rem}.image-upload input{font-size:.76rem;max-width:100%}
.deleted-entries{display:grid;gap:.4rem;padding:.8rem 0;border-top:1px solid var(--line-divider)}.deleted-entries strong{font-size:.8rem;color:#b55050}.deleted-entries button{text-align:left;overflow-wrap:anywhere}
.history-controls{display:flex;flex-wrap:wrap;gap:.45rem;padding:.7rem 0;align-items:center}.history-controls select{max-width:100%;min-width:9rem;border:1px solid var(--line-divider);border-radius:.5rem;background:var(--card-bg);color:inherit;padding:.5rem}
.manager{overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem;border-bottom:1px solid var(--line-divider)}h2{margin:0;font-size:1.05rem}header p{margin:.25rem 0 0;font-size:.76rem;opacity:.58}.actions{display:flex;gap:.45rem}button{border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;padding:.55rem .7rem;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}button.primary{background:var(--primary);border-color:var(--primary);color:white}button.danger{color:#c43d3d;border-color:rgb(196 61 61/.3)}button:disabled{opacity:.5;cursor:not-allowed}.layout{display:grid;grid-template-columns:17rem minmax(28rem,1fr) minmax(22rem,.8fr);min-height:68vh}aside{padding:.75rem;border-right:1px solid var(--line-divider)}.search,.grid input,.grid textarea,.body textarea{width:100%;border:1px solid var(--line-divider);border-radius:.55rem;background:transparent;color:inherit;font:inherit}.search{padding:.62rem}.list{display:grid;gap:.3rem;margin-top:.6rem;max-height:64vh;overflow:auto}.list button{display:grid;text-align:left;gap:.15rem}.list button.active{border-color:var(--primary);background:color-mix(in oklab,var(--primary) 9%,transparent)}.list span,.list small{font-size:.67rem;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.editor{padding:.9rem;border-right:1px solid var(--line-divider);min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.grid label,.body{display:grid;gap:.3rem;font-size:.72rem;font-weight:700}.grid .wide{grid-column:span 2}.grid input,.grid textarea{padding:.6rem}.checks{display:flex;gap:1rem;margin:.8rem 0;font-size:.76rem}.checks label{display:flex;align-items:center;gap:.3rem}.body textarea{min-height:25rem;padding:.7rem;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6}.status{display:flex;justify-content:space-between;gap:.7rem;align-items:center;margin-top:.7rem;font-size:.7rem}.status>div:first-child{display:grid}.ok{color:#059669}.bad{color:#c43d3d}.security-warning{margin-top:.7rem;padding:.7rem .8rem;border:1px solid rgb(217 119 6/.28);border-radius:.55rem;background:rgb(217 119 6/.08);color:#b45309;font-size:.72rem;line-height:1.55}.preview{padding:1rem;overflow:auto;max-height:68vh}.preview>strong{display:block;margin-bottom:.8rem}@media(max-width:1380px){.layout{grid-template-columns:16rem minmax(0,1fr)}.preview{grid-column:1/-1;border-top:1px solid var(--line-divider);max-height:none}}@media(max-width:800px){header{align-items:flex-start;flex-direction:column}.layout{grid-template-columns:1fr}aside,.editor{border-right:0;border-bottom:1px solid var(--line-divider)}.list{max-height:16rem}.grid{grid-template-columns:1fr}.grid .wide{grid-column:auto}.status{align-items:flex-start;flex-direction:column}}

/* Responsive authoring workspace: readable editing widths and touch-first controls. */
.manager{border-radius:1rem;background:var(--card-bg);box-shadow:0 12px 38px #00000009}
.layout{grid-template-columns:minmax(13rem,16rem) minmax(20rem,1fr) minmax(20rem,1fr);min-width:0}
.layout>*{min-width:0}
.editor,.preview{min-width:0}
.editor{padding:clamp(.85rem,1.5vw,1.4rem)}
.preview{padding:clamp(.85rem,1.5vw,1.4rem);background:color-mix(in srgb,var(--card-bg) 92%,var(--primary) 8%)}
.preview-heading{position:sticky;top:0;z-index:5;padding:.8rem;border-radius:.8rem;background:var(--card-bg);border:1px solid var(--line-divider);box-shadow:0 3px 16px #00000008}
.preview-switch button{min-height:2.3rem;transition:background .16s,border-color .16s}
.preview-switch button:hover{background:color-mix(in srgb,var(--primary) 9%,transparent)}
.preview-viewport{width:100%;min-width:0}
.preview-viewport :global(.expressive-code),.preview-viewport :global(pre),.preview-viewport :global(table){max-width:100%}
.preview-viewport :global(pre),.preview-viewport :global(.expressive-code .frame){overflow-x:auto}
.preview-viewport :global(img){height:auto}
.article-preview{box-shadow:0 8px 22px #00000009}
@media(max-width:1350px){
 .layout{grid-template-columns:minmax(12rem,14rem) minmax(0,1fr)}
 .preview{grid-column:2;border-top:1px solid var(--line-divider)}
 aside{grid-row:1 / span 2}
}
@media(max-width:760px){
 .manager{border-radius:.85rem}
 .manager>header{padding:.85rem;align-items:flex-start;flex-wrap:wrap}
 .layout{display:flex;flex-direction:column;min-height:0}
 aside{border-right:0;border-bottom:1px solid var(--line-divider);padding:.75rem}
 .list{display:flex;overflow-x:auto;overflow-y:hidden;max-height:none;padding-bottom:.45rem;scroll-snap-type:x proximity}
 .list button{min-width:11rem;max-width:15rem;scroll-snap-align:start}
 .editor,.preview{padding:.85rem}
 .body textarea{min-height:16rem}
 .preview-heading{position:static;align-items:stretch}
 .preview-heading strong{width:100%}
 .preview-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
 .preview-switch button{min-height:2.65rem}
 .preview-viewport.mobile-preview{max-width:100%;padding:.4rem;border-radius:.8rem}
 .preview-viewport.mobile-preview .article-preview{padding:1rem}
 .article-preview{padding:1rem;margin-top:.65rem}
 .article-preview-header h1{font-size:1.55rem}
 .actions{width:100%;justify-content:flex-end;flex-wrap:wrap}
 button,input,select,textarea{font-size:16px}
}
@media(max-width:390px){
 .article-preview{padding:.75rem}
 .preview-heading{padding:.6rem}
 .preview-switch button{font-size:.74rem}
}


/* Paired source/preview editing; scrolling is synchronized in both directions. */
.layout.docked{grid-template-columns:minmax(0,1fr) minmax(0,1fr);height:min(82vh,960px);min-height:440px;overflow:hidden}
.layout.docked>aside{display:none}
.layout.docked>.editor,.layout.docked>.preview{min-width:0;min-height:0;overflow:hidden}
.layout.docked>.editor{display:flex;flex-direction:column;gap:.55rem}
.layout.docked>.editor>:not(.body):not(.image-upload):not(.status){display:none}
.layout.docked>.editor>.body{display:flex;flex:1;min-height:0;flex-direction:column}
.layout.docked>.editor>.body textarea{flex:1;min-height:0;height:100%;resize:none;overflow-y:auto;overscroll-behavior:contain;font-family:var(--font-jetbrains-mono),ui-monospace,monospace;line-height:1.7}
.layout.docked>.preview{display:flex;flex-direction:column;gap:.4rem}
.layout.docked>.preview>.preview-viewport{flex:1;max-height:none;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable}
.layout.docked>.preview>.preview-heading{flex:none;position:static}
.dock-toggle{border-color:var(--primary);color:var(--primary);background:color-mix(in srgb,var(--primary) 7%,var(--card-bg))}
.dock-toggle.active{background:var(--primary);color:white}
@media(max-width:760px){
 .layout.docked{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);height:76vh;min-height:390px}
 .layout.docked>.editor,.layout.docked>.preview{padding:.35rem}
 .layout.docked>.editor>.body textarea{font-size:13px;padding:.4rem}
 .layout.docked>.preview .preview-heading{padding:.4rem}
 .layout.docked>.preview .preview-heading strong,.layout.docked>.preview .preview-switch{display:none}
 .layout.docked>.preview-viewport .article-preview{padding:.45rem}
 .layout.docked>.preview-viewport{padding:.2rem}
 .layout.docked .image-upload{display:none}
}


.post-list-filter{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.35rem;margin:.65rem 0 .45rem}
.post-list-filter button{border:1px solid var(--line-divider);border-radius:.65rem;padding:.55rem .15rem;min-height:2.25rem;font-size:.7rem;font-weight:650;transition:background .15s,border-color .15s;white-space:nowrap}
.post-list-filter button:hover{background:color-mix(in srgb,var(--primary) 9%,transparent)}
.post-list-filter button.active{color:var(--primary);background:color-mix(in srgb,var(--primary) 11%,var(--card-bg));border-color:color-mix(in srgb,var(--primary) 36%,var(--line-divider))}
@media(max-width:760px){.post-list-filter{margin:.45rem 0}.post-list-filter button{min-height:2.55rem;font-size:.76rem}}

/* Writing-first workspace. The article's primary field stays prominent while
   metadata can be expanded without occupying the whole first viewport. */
.manager,.layout,.layout>aside,.layout>.editor,.layout>.preview{max-width:100%;min-width:0;box-sizing:border-box}
.editor-intro{display:flex;flex-direction:column;gap:.65rem;min-width:0;margin-bottom:.85rem}
.editor-title{display:grid;gap:.35rem;min-width:0;font-size:.76rem;font-weight:750}
.editor-title input{width:100%;max-width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--line-divider);border-radius:.65rem;padding:.75rem .85rem;background:var(--card-bg);color:inherit;font:inherit;font-size:1rem;font-weight:600}
.editor-title input:focus-visible,.body textarea:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.editor-intro-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.draft-quick-toggle{display:inline-flex;align-items:center;gap:.45rem;border-radius:.55rem;font-size:.8rem;cursor:pointer}
.draft-quick-toggle input{accent-color:var(--primary);width:1rem;height:1rem}
.quick-preview-button{display:none;color:var(--primary);border-color:color-mix(in srgb,var(--primary) 30%,var(--line-divider))}
.post-metadata{margin-bottom:.9rem;min-width:0;border:1px solid var(--line-divider);border-radius:.8rem;background:color-mix(in srgb,var(--card-bg) 94%,var(--primary) 6%)}
.post-metadata>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:.7rem;flex-wrap:wrap;padding:.85rem .9rem;font-weight:700;font-size:.83rem}
.post-metadata>summary::-webkit-details-marker{display:none}
.post-metadata>summary:after{content:"＋";color:var(--primary);font-size:1rem;margin-left:auto}
.post-metadata[open]>summary:after{content:"−"}
.post-metadata>summary small{font-size:.68rem;font-weight:450;color:var(--text-muted,#888);overflow-wrap:anywhere}
.post-metadata>.grid{padding:.2rem .85rem .85rem;min-width:0}
.post-metadata>.checks{padding:0 .9rem .85rem;margin:0;flex-wrap:wrap}
.editor .grid label,.editor .grid input,.editor .grid textarea{min-width:0;max-width:100%;box-sizing:border-box}
.editor .body{margin:0;min-width:0}
.editor .body textarea{display:block;box-sizing:border-box;min-width:0;max-width:100%;height:clamp(35rem,67vh,58rem);min-height:35rem;line-height:1.78;font-size:.89rem;padding:1rem;resize:vertical;overflow-x:auto;white-space:pre-wrap;overflow-wrap:break-word;background:var(--card-bg)}
.editor .image-upload{margin-top:.7rem;margin-bottom:.6rem}
.layout{grid-template-columns:minmax(11rem,14rem) minmax(0,1.3fr) minmax(0,1fr)}
.layout:not(.docked)>.editor{min-width:0}
.preview,.preview-viewport,.preview-viewport :global(.markdown-content){min-width:0;max-width:100%;overflow-wrap:anywhere}
.preview-viewport :global(img),.preview-viewport :global(video),.preview-viewport :global(iframe){max-width:100%}
@media (max-width:1350px){
 .layout:not(.docked){grid-template-columns:minmax(11rem,13rem) minmax(0,1fr)}
 .layout:not(.docked)>.preview{grid-column:2}
}
@media (max-width:900px){
 .layout:not(.docked){display:flex;flex-direction:column}
 .layout:not(.docked)>aside{width:100%;border-right:0;border-bottom:1px solid var(--line-divider)}
 .layout:not(.docked)>.editor,.layout:not(.docked)>.preview{width:100%;border-right:0;box-sizing:border-box}
 .layout:not(.docked) .list{display:flex;overflow-x:auto;overflow-y:hidden;max-height:none;scroll-snap-type:x proximity}
 .layout:not(.docked) .list button{flex:0 0 auto;max-width:min(15rem,75vw);min-width:min(11rem,65vw)}
 .editor .body textarea{height:clamp(32rem,65vh,48rem);min-height:32rem}
}
@media (max-width:640px){
 .manager{width:100%;max-width:100%;overflow-x:clip}
 .manager>header{padding:.75rem .7rem;gap:.5rem}
 .manager>header>div:first-child{min-width:0;max-width:100%}
 .manager>header p{overflow-wrap:anywhere}
 .layout:not(.docked)>aside,.layout:not(.docked)>.editor,.layout:not(.docked)>.preview{padding:.7rem;min-width:0;max-width:100%}
 .editor-intro{gap:.5rem;margin-bottom:.7rem}
 .editor-intro-actions{justify-content:space-between}
 .quick-preview-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.5rem}
 .post-metadata>summary{padding:.72rem;gap:.28rem}
 .post-metadata>summary small{width:100%;order:3}
 .post-metadata>.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;padding:.45rem .6rem .75rem}
 .post-metadata>.grid>label.wide{grid-column:span 2}
 .post-metadata .grid input,.post-metadata .grid textarea{font-size:16px}
 .editor .body textarea{width:100%;height:max(63dvh,29rem);min-height:29rem;padding:.8rem;line-height:1.72;font-size:16px;overflow-wrap:anywhere}
 .editor .image-upload{width:100%;overflow-wrap:anywhere}
 .editor .image-upload input{max-width:100%}
 .preview-viewport :global(pre),.preview-viewport :global(table){max-width:100%;overflow-x:auto}
 /* On phones, preserve a readable full-width source editor even when
    synchronized comparison is enabled. Desktop/tablet keep side-by-side. */
 .layout.docked{display:flex;flex-direction:column;min-height:0;height:auto;max-width:100%;overflow:visible}
 .layout.docked>.editor,.layout.docked>.preview{width:100%;max-width:100%;min-height:0;overflow:visible;padding:.65rem}
 .layout.docked>.editor>.body{display:flex;flex-direction:column;width:100%;min-height:0;flex:auto}
 .layout.docked>.editor>.body textarea{height:46dvh;min-height:max(21rem,40dvh);max-height:65dvh;flex:none;resize:vertical;white-space:pre-wrap;font-size:15px;padding:.65rem}
 .layout.docked>.preview>.preview-viewport{height:43dvh;min-height:17rem;max-height:65dvh;flex:none;overflow-y:auto;overflow-x:hidden}
 .layout.docked>.preview>.preview-heading{display:flex;position:static}
 .layout.docked>.preview>.preview-heading strong{display:block;width:auto}
 .layout.docked>.preview .preview-switch{display:none}
}
@media (max-width:360px){.post-metadata>.grid{grid-template-columns:minmax(0,1fr)}.post-metadata>.grid>label.wide{grid-column:span 1}.post-metadata>summary small{font-size:.63rem}}


/* Keep an always reachable exit from synced preview on narrow screens. */
.layout.docked>.editor>.editor-intro{display:flex !important;flex-direction:row;justify-content:flex-end;flex:0 0 auto;margin:0;min-height:2.4rem}
.layout.docked>.editor>.editor-intro .editor-title,.layout.docked>.editor>.editor-intro .draft-quick-toggle{display:none}
.layout.docked>.editor>.editor-intro .quick-preview-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.4rem}

/* Compact portrait side-by-side comparison, without widening the document.
   Independent pane scrolling keeps the source readable at every viewport. */
@media(max-width:640px){
 .layout.docked{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);width:100%;max-width:100%;height:min(80dvh,850px);min-height:450px;overflow:hidden;align-items:stretch}
 .layout.docked>.editor,.layout.docked>.preview{width:100%;max-width:100%;min-height:0;min-width:0;overflow:hidden;padding:.3rem}
 .layout.docked>.editor{display:flex;flex-direction:column;gap:.25rem}
 .layout.docked>.editor>.editor-intro{display:flex!important;flex:0 0 auto;justify-content:center;min-height:2.3rem}
 .layout.docked>.editor>.editor-intro-actions{width:100%;justify-content:center}
 .layout.docked>.editor>.editor-intro .quick-preview-button{width:100%;display:inline-flex;font-size:.66rem;padding:.3rem .15rem;white-space:nowrap}
 .layout.docked>.editor>.body{flex:1;min-height:0;max-width:100%;display:flex;flex-direction:column}
 .layout.docked>.editor>.body span{font-size:.63rem}
 .layout.docked>.editor>.body textarea{flex:1;display:block;width:100%;max-width:100%;height:100%;min-height:0;max-height:none;resize:none;font-size:12px;line-height:1.5;padding:.35rem;overflow-x:auto;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere}
 .layout.docked>.preview{display:flex;flex-direction:column;gap:0;border-left:1px solid var(--line-divider)}
 .layout.docked>.preview>.preview-heading{display:none}
 .layout.docked>.preview>.preview-viewport{flex:1;width:100%;max-width:100%;min-height:0;max-height:none;height:auto;padding:.2rem;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:auto}
 .layout.docked>.preview>.preview-viewport :global(.prose){font-size:.72rem;line-height:1.6;max-width:100%;overflow-wrap:anywhere}
 .layout.docked>.preview>.preview-viewport :global(pre){max-width:100%;overflow-x:auto;font-size:.68rem}
 .layout.docked>.preview-viewport .article-preview{padding:.25rem}
}
.mermaid-parse-error{font-size:.78rem;color:var(--primary);padding:.55rem;border:1px solid var(--line-divider);border-radius:.5rem;overflow-wrap:anywhere}
</style>
