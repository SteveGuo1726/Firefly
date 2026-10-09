<script lang="ts">
import { onMount } from "svelte";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
} from "@/utils/admin/github-session";
import AdminDynamicManager from "./AdminDynamicManager.svelte";
import AdminPostManager from "./AdminPostManager.svelte";

type Section="posts"|"dynamic";
let session:GitHubAdminSession|null=null;
let section:Section="posts";

function readSection():Section{
	if(typeof window==="undefined")return"posts";
	return new URLSearchParams(window.location.search).get("section")==="dynamic"?"dynamic":"posts";
}
function choose(next:Section){
	section=next;
	const url=new URL(window.location.href);
	url.searchParams.set("section",next);
	history.replaceState(history.state,"",url);
}
function syncSession(){session=getGitHubAdminSession();}
onMount(()=>{
	section=readSection();
	syncSession();
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
	return()=>window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT,syncSession);
});
</script>

<div class="admin-shell">
	<header class="admin-heading card-base">
		<div><span class="eyebrow">FIREFLY ADMIN</span><h1>内容后台</h1><p>实时保存到 EdgeOne Blob；GitHub 只作为源码基线和后续定时归档。</p></div>
		{#if session}<div class="identity"><strong>{session.login}</strong><span>{session.owner}/{session.repo} · {session.branch}</span></div>{/if}
	</header>
	{#if !session}
		<section class="login-hint card-base"><h2>需要 GitHub 管理身份</h2><p>请使用右上角 GitHub 登录。Token 只保存在当前标签页，用于读取 Git 基线和验证管理权限。</p></section>
	{:else}
		<nav class="admin-tabs card-base" aria-label="内容管理">
			<button class:active={section==="posts"} onclick={()=>choose("posts")}>文章</button>
			<button class:active={section==="dynamic"} onclick={()=>choose("dynamic")}>动态</button>
			<a href="/gallery/manage/">相册</a>
		</nav>
		{#if section==="posts"}<AdminPostManager {session}/>{:else}<AdminDynamicManager {session}/>{/if}
	{/if}
</div>
<style>
.admin-shell{display:grid;gap:1rem}.admin-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 1.2rem}.eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.16em;opacity:.45}h1{margin:.15rem 0 0;font-size:1.55rem}.admin-heading p,.login-hint p{margin:.3rem 0 0;font-size:.82rem;opacity:.62}.identity{display:grid;text-align:right}.identity span{font-size:.72rem;opacity:.55}.login-hint{padding:1.2rem}.login-hint h2{margin:0;font-size:1rem}.admin-tabs{display:flex;gap:.35rem;padding:.45rem}.admin-tabs button,.admin-tabs a{border:0;border-radius:.6rem;padding:.65rem .95rem;background:transparent;color:inherit;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.admin-tabs button.active,.admin-tabs button:hover,.admin-tabs a:hover{background:color-mix(in oklab,var(--primary) 11%,transparent)}@media(max-width:760px){.admin-heading{align-items:flex-start;flex-direction:column}.identity{text-align:left}}
</style>
