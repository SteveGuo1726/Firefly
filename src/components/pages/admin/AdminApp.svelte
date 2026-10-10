<script lang="ts">
import { onMount } from "svelte";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
	refreshOAuthAdminSession,
    logoutOAuthAdmin,
} from "@/utils/admin/github-session";
import GitHubAdminLogin from "@/components/features/GitHubAdminLogin.svelte";

const PREVIEW_DEMO_COMPILED = import.meta.env.PUBLIC_FIREFLY_PREVIEW_DEMO === "true";
const PREVIEW_HOSTS = new Set(["firefly-blog-preview.guojunyang666666.workers.dev", "v1-preview.casto.top"]);
const SANDBOX_PREVIEW_HOST = import.meta.env.PUBLIC_FIREFLY_SANDBOX_HOST?.trim() || "";
const DEMO_STORAGE_KEY = "firefly:preview-admin-demo";
type PreviewDemoType = typeof import("./PreviewDemoAdmin.svelte").default;
let PreviewDemoComponent: PreviewDemoType | null = null;
let demoSupported = false;
let demoUnlocked = false;
let demoPassword = "";
let demoError = "";
let previewPasswordLogin = false;
let previewAuthenticated = false;
let previewLoginBusy = false;
let previewPasswordValue = "";
let previewLoginError = "";


function previewOriginAllowed(): boolean {
 return typeof window !== "undefined" &&
  (PREVIEW_HOSTS.has(window.location.hostname) ||
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
 demoError="";
 demoUnlocked=true;
 try{sessionStorage.setItem(DEMO_STORAGE_KEY,"1");}catch{}
 void loadDemoView();
}
async function enterPreviewAdmin() {
 if(!previewPasswordLogin || previewLoginBusy) return;
 previewLoginBusy=true;previewLoginError="";
 try {
  const result=await fetch("/api/preview-admin/login",{
   method:"POST",credentials:"same-origin",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({password:previewPasswordValue}),
  });
  const payload=await result.json().catch(()=>({}));
  if(!result.ok)throw new Error(payload.error||"预览后台登录失败。");
  const authenticated=await refreshOAuthAdminSession();
  if(!authenticated)throw new Error("预览会话建立失败，请刷新页面重试。");
  previewAuthenticated=true;
  section=readSection();
  syncSession();
 } catch(error) {
  previewLoginError=error instanceof Error?error.message:"预览后台登录失败。";
 } finally {
  previewPasswordValue="";
  previewLoginBusy=false;
 }
}
async function exitPreviewAdmin(){
 try {await logoutOAuthAdmin();}
 catch(error) {
  previewLoginError=error instanceof Error?error.message:"退出失败，请刷新页面。";
  return;
 }
 previewAuthenticated=false;
 session=null;
 demoUnlocked=false;
}
function exitDemo(){
 demoUnlocked=false;demoError="";
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
  else if(section==="gallery"&&previewPasswordLogin){sectionLoading=false;}
  else if(section==="gallery"){const module=await import("../gallery/GalleryAdminManager.svelte");if(generation===loadGeneration)GalleryComponent=module.default;}
  else if(section==="dashboard"){const module=await import("./AdminDashboard.svelte");if(generation===loadGeneration)DashboardComponent=module.default;}
  else{const module=await import("./AdminBackup.svelte");if(generation===loadGeneration)BackupComponent=module.default;}
 }catch(e){if(generation===loadGeneration)sectionError=e instanceof Error?e.message:"后台模块加载失败";}
 finally{if(generation===loadGeneration)sectionLoading=false;}
}
onMount(()=>{
 demoSupported=PREVIEW_DEMO_COMPILED && previewOriginAllowed();
 // Cloudflare preview performs server-side password authentication. The
 // ephemeral Sandbox still offers only the isolated read-only demo.
 previewPasswordLogin=PREVIEW_HOSTS.has(window.location.hostname);
 if(previewPasswordLogin){
  demoSupported=false;
  section=readSection();
  void refreshOAuthAdminSession().then(current=>{
   previewAuthenticated=Boolean(current);
   syncSession();
  });
  window.addEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
  return()=>window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
 }
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
   <p>本 Sandbox 入口仅提供公开数据的只读体验，不需要密码；正式编辑与保存请使用 Cloudflare 实验站的服务端密码登录。</p>
   <button type="button" onclick={enterDemo}>进入公开只读演示</button>
   {#if demoError}<p role="alert" class="demo-error">{demoError}</p>{/if}
  </section>
 {/if}
{:else if previewPasswordLogin && !previewAuthenticated}
 <section class="demo-entry card-base">
  <span class="eyebrow">FIREFLY · CLOUDFLARE PREVIEW</span>
  <h1>实验内容后台登录</h1>
  <p>此密码仅开启预览 KV 中的文章和动态真实编辑，不授予 GitHub 提交权限。由于相册仍使用正式图床，照片上传、移动和删除在此模式下不开放。</p>
  <form onsubmit={(event)=>{event.preventDefault();void enterPreviewAdmin();}}>
   <label for="preview-real-password">预览管理密码</label>
   <input id="preview-real-password" type="password" autocomplete="off" bind:value={previewPasswordValue} placeholder="输入实验密码" disabled={previewLoginBusy}/>
   <button type="submit" disabled={previewLoginBusy}>{previewLoginBusy?"验证中...":"进入真实内容编辑器"}</button>
  </form>
  {#if previewLoginError}<p role="alert" class="demo-error">{previewLoginError}</p>{/if}
 </section>
{:else}
<div class="admin-shell">
	<header class="admin-heading card-base">
		<div><span class="eyebrow">FIREFLY ADMIN</span><h1>内容后台</h1><p>{previewPasswordLogin?"实验模式：文章与动态保存到 Cloudflare 预览 KV；未修改 GitHub、生产 Blob 或正式图床。":"正式模式：实时内容存储独立于 GitHub 源码归档。"}</p></div>
		{#if session}<div class="identity"><strong>{session.login}</strong><span>{session.owner}/{session.repo} · {session.branch}</span></div>{/if}
			{#if previewPasswordLogin}
            <button type="button" onclick={()=>{void exitPreviewAdmin();}}>退出实验管理</button>
          {:else}
            <GitHubAdminLogin />
          {/if}
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
        {#if previewPasswordLogin && section==="gallery"}
         <section class="login-hint card-base"><h2>相册仍使用正式图床</h2><p>为了防止实验密码删除或移动正式图片，暂不提供这里的图床写操作。相册公开页与清单检查可以继续预览；图片存储位置仍为 img.casto.top。</p><a href="/gallery/">查看公开相册</a></section>
        {:else if GalleryComponent}<div hidden={section!=="gallery"}><GalleryComponent/></div>{/if}
	{/if}
</div>
{/if}
<style>
.demo-entry{width:min(36rem,calc(100% - 1rem));margin:6rem auto 1rem;padding:1.5rem;display:grid;gap:1rem}.demo-entry h1{font-size:1.5rem;font-weight:800;margin:0}.demo-entry p{font-size:.9rem;line-height:1.65;opacity:.8}.demo-entry form{display:grid;gap:.65rem}.demo-entry label{font-size:.85rem;font-weight:700}.demo-entry input{padding:.8rem;border-radius:.55rem;background:transparent;color:inherit;border:1px solid var(--line-divider);font:inherit}.demo-entry button{justify-self:start;padding:.7rem 1.1rem;background:var(--primary);color:white;border:0;border-radius:.55rem;font-weight:700;cursor:pointer}.demo-error{color:#c43d3d}

.admin-shell{display:grid;gap:1rem}.admin-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 1.2rem}.eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.16em;opacity:.45}h1{margin:.15rem 0 0;font-size:1.55rem}.admin-heading p,.login-hint p{margin:.3rem 0 0;font-size:.82rem;opacity:.62}.identity{display:grid;text-align:right}.identity span{font-size:.72rem;opacity:.55}.login-hint{padding:1.2rem}.login-hint h2{margin:0;font-size:1rem}.admin-tabs{display:flex;flex-wrap:wrap;gap:.35rem;padding:.45rem}.admin-tabs button,.admin-tabs a{border:0;border-radius:.6rem;padding:.65rem .95rem;background:transparent;color:inherit;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.admin-tabs button.active,.admin-tabs button:hover,.admin-tabs a:hover{background:color-mix(in oklab,var(--primary) 11%,transparent)}@media(max-width:760px){.admin-heading{align-items:flex-start;flex-direction:column}.identity{text-align:left}}
</style>
