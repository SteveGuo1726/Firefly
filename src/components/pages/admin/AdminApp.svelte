<script lang="ts">
import { onMount } from "svelte";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
	refreshOAuthAdminSession,
} from "@/utils/admin/github-session";
import GitHubAdminLogin from "@/components/features/GitHubAdminLogin.svelte";

const PREVIEW_DEMO_COMPILED = import.meta.env.PUBLIC_FIREFLY_PREVIEW_DEMO === "true";
const PREVIEW_HOST = "firefly-blog-preview.guojunyang666666.workers.dev";
const SANDBOX_PREVIEW_HOST = import.meta.env.PUBLIC_FIREFLY_SANDBOX_HOST?.trim() || "";
const DEMO_STORAGE_KEY = "firefly:preview-admin-demo";
type PreviewDemoType = typeof import("./PreviewDemoAdmin.svelte").default;
let PreviewDemoComponent: PreviewDemoType | null = null;
let demoSupported = false;
let demoUnlocked = false;
let demoPassword = "";
let demoError = "";

function previewOriginAllowed(): boolean {
 return typeof window !== "undefined" &&
  (window.location.hostname === PREVIEW_HOST ||
   (import.meta.env.DEV && (
    /^(localhost|127\\.0\\.0\\.1)$/.test(window.location.hostname) ||
    (SANDBOX_PREVIEW_HOST !== "" && window.location.hostname === SANDBOX_PREVIEW_HOST)
   )));
}
async function loadDemoView(){
 if(!demoSupported) return;
 try {PreviewDemoComponent=(await import("./PreviewDemoAdmin.svelte")).default;}
 catch {demoError="演示模块加载失败，请刷新后重试。";}
}
function enterDemo(){
 if(!demoSupported) return;
 if(demoPassword !== "admin"){demoError="测试密码错误。";demoPassword="";return;}
 demoPassword="";
 demoError="";
 demoUnlocked=true;
 try{sessionStorage.setItem(DEMO_STORAGE_KEY,"1");}catch{}
 void loadDemoView();
}
function exitDemo(){
 demoUnlocked=false;demoPassword="";demoError="";
 try{sessionStorage.removeItem(DEMO_STORAGE_KEY);}catch{}
}



type Section="dashboard"|"posts"|"dynamic"|"gallery"|"backup";
type DashboardComponentType=typeof import("./AdminDashboard.svelte").default;
type BackupComponentType=typeof import("./AdminBackup.svelte").default;
type PostComponentType=typeof import("./AdminPostManager.svelte").default;
type DynamicComponentType=typeof import("./AdminDynamicManager.svelte").default;
type GalleryComponentType=typeof import("../gallery/GalleryAdminManager.svelte").default;
let DashboardComponent:DashboardComponentType|null=null;
let BackupComponent:BackupComponentType|null=null;
let PostComponent:PostComponentType|null=null;
let DynamicComponent:DynamicComponentType|null=null;
let GalleryComponent:GalleryComponentType|null=null;
let sectionLoading=false;
let sectionError="";
let loadGeneration=0;
let session:GitHubAdminSession|null=null;
let section:Section="dashboard";

function readSection():Section{
	if(typeof window==="undefined")return"dashboard";
	const value=new URLSearchParams(window.location.search).get("section");
	return value==="posts"||value==="dynamic"||value==="gallery"||value==="dashboard"||value==="backup"?value:"dashboard";
}
function choose(next:Section){
	section=next;
	void ensureSectionLoaded();
	const url=new URL(window.location.href);
	url.searchParams.set("section",next);
	history.replaceState(history.state,"",url);
}
function syncSession(){session=getGitHubAdminSession();void ensureSectionLoaded();}
async function ensureSectionLoaded(){
 const generation=++loadGeneration;
 if(!session){sectionLoading=false;sectionError="";return;}
 sectionError="";
 if((section==="posts"&&PostComponent)||(section==="dynamic"&&DynamicComponent)||(section==="gallery"&&GalleryComponent)||(section==="dashboard"&&DashboardComponent)||(section==="backup"&&BackupComponent)){sectionLoading=false;return;}
 sectionLoading=true;sectionError="";
 try{
  if(section==="posts"){const module=await import("./AdminPostManager.svelte");if(generation===loadGeneration)PostComponent=module.default;}
  else if(section==="dynamic"){const module=await import("./AdminDynamicManager.svelte");if(generation===loadGeneration)DynamicComponent=module.default;}
  else if(section==="gallery"){const module=await import("../gallery/GalleryAdminManager.svelte");if(generation===loadGeneration)GalleryComponent=module.default;}
  else if(section==="dashboard"){const module=await import("./AdminDashboard.svelte");if(generation===loadGeneration)DashboardComponent=module.default;}
  else{const module=await import("./AdminBackup.svelte");if(generation===loadGeneration)BackupComponent=module.default;}
 }catch(e){if(generation===loadGeneration)sectionError=e instanceof Error?e.message:"后台模块加载失败";}
 finally{if(generation===loadGeneration)sectionLoading=false;}
}
onMount(()=>{
 demoSupported=PREVIEW_DEMO_COMPILED && previewOriginAllowed();
 if(demoSupported){
  try {demoUnlocked=sessionStorage.getItem(DEMO_STORAGE_KEY)==="1";} catch {demoUnlocked=false;}
  if(demoUnlocked) void loadDemoView();
  return;
 }
	section=readSection();
	syncSession();
	void refreshOAuthAdminSession().then(syncSession);
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
	return()=>window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
});
</script>

{#if demoSupported}
 {#if demoUnlocked}
  {#if PreviewDemoComponent}
   <PreviewDemoComponent onLogout={exitDemo}/>
  {:else}
   <section class="demo-entry card-base"><h1>正在加载预览后台...</h1>{#if demoError}<p role="alert">{demoError}<button type="button" onclick={loadDemoView}>重试加载</button></p>{/if}</section>
  {/if}
 {:else}
  <section class="demo-entry card-base">
   <span class="eyebrow">FIREFLY · PREVIEW ONLY</span>
   <h1>内容后台测试入口</h1>
   <p>实验站临时密码为 admin。仅进入只读演示，浏览器内的编辑不会保存到服务器，也不能访问草稿、私有备份或操作图床。</p>
   <form onsubmit={(event)=>{event.preventDefault();enterDemo();}}>
    <label for="preview-admin-password">测试密码</label>
    <input id="preview-admin-password" type="password" autocomplete="off" bind:value={demoPassword} placeholder="输入 admin"/>
    <button type="submit">进入预览后台</button>
   </form>
   {#if demoError}<p role="alert" class="demo-error">{demoError}</p>{/if}
  </section>
 {/if}
{:else}
<div class="admin-shell">
	<header class="admin-heading card-base">
		<div><span class="eyebrow">FIREFLY ADMIN</span><h1>内容后台</h1><p>实时保存到 EdgeOne Blob；GitHub 只作为源码基线和后续定时归档。</p></div>
		{#if session}<div class="identity"><strong>{session.login}</strong><span>{session.owner}/{session.repo} · {session.branch}</span></div>{/if}
			<GitHubAdminLogin />
	</header>
	{#if !session}
		<section class="login-hint card-base"><h2>需要 GitHub 管理身份</h2><p>请使用上方 GitHub 登录。在配置 OAuth 的站点上使用服务端安全会话；未配置的预览环境暂时保留 PAT 登录。</p></section>
	{:else}
		<nav class="admin-tabs card-base" aria-label="内容管理">
			<button class:active={section==="dashboard"} onclick={()=>choose("dashboard")}>仪表盘</button>
			<button class:active={section==="posts"} onclick={()=>choose("posts")}>文章</button>
			<button class:active={section==="dynamic"} onclick={()=>choose("dynamic")}>动态</button>
			<button class:active={section==="gallery"} onclick={()=>choose("gallery")}>相册</button>
			<button class:active={section==="backup"} onclick={()=>choose("backup")}>备份</button>
		</nav>
		{#if sectionLoading}<section class="login-hint card-base" role="status">正在加载管理模块...</section>
		{:else if sectionError}<section class="login-hint card-base" role="alert">{sectionError}<button onclick={()=>ensureSectionLoaded()}>重试</button></section>
		{/if}
		{#if DashboardComponent}<div hidden={section!=="dashboard"}><DashboardComponent {session}/></div>{/if}
		{#if BackupComponent}<div hidden={section!=="backup"}><BackupComponent {session}/></div>{/if}
		{#if PostComponent}<div hidden={section!=="posts"}><PostComponent {session}/></div>{/if}
		{#if DynamicComponent}<div hidden={section!=="dynamic"}><DynamicComponent {session}/></div>{/if}
		{#if GalleryComponent}<div hidden={section!=="gallery"}><GalleryComponent/></div>{/if}
	{/if}
</div>
{/if}
<style>
.demo-entry{width:min(36rem,calc(100% - 1rem));margin:6rem auto 1rem;padding:1.5rem;display:grid;gap:1rem}.demo-entry h1{font-size:1.5rem;font-weight:800;margin:0}.demo-entry p{font-size:.9rem;line-height:1.65;opacity:.8}.demo-entry form{display:grid;gap:.65rem}.demo-entry label{font-size:.85rem;font-weight:700}.demo-entry input{padding:.8rem;border-radius:.55rem;background:transparent;color:inherit;border:1px solid var(--line-divider);font:inherit}.demo-entry button{justify-self:start;padding:.7rem 1.1rem;background:var(--primary);color:white;border:0;border-radius:.55rem;font-weight:700;cursor:pointer}.demo-error{color:#c43d3d}

.admin-shell{display:grid;gap:1rem}.admin-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 1.2rem}.eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.16em;opacity:.45}h1{margin:.15rem 0 0;font-size:1.55rem}.admin-heading p,.login-hint p{margin:.3rem 0 0;font-size:.82rem;opacity:.62}.identity{display:grid;text-align:right}.identity span{font-size:.72rem;opacity:.55}.login-hint{padding:1.2rem}.login-hint h2{margin:0;font-size:1rem}.admin-tabs{display:flex;flex-wrap:wrap;gap:.35rem;padding:.45rem}.admin-tabs button,.admin-tabs a{border:0;border-radius:.6rem;padding:.65rem .95rem;background:transparent;color:inherit;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.admin-tabs button.active,.admin-tabs button:hover,.admin-tabs a:hover{background:color-mix(in oklab,var(--primary) 11%,transparent)}@media(max-width:760px){.admin-heading{align-items:flex-start;flex-direction:column}.identity{text-align:left}}
</style>
