<script lang="ts">
import { onMount } from "svelte";
import { githubAdminConfig } from "@/config/githubAdminConfig";
import {
	clearGitHubAdminSession,
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
	loginWithGitHubToken,
} from "@/utils/admin/github-session";
import { url } from "@/utils/url-utils";

let session: GitHubAdminSession | null = null;
let token = "";
let modalOpen = false;
let menuOpen = false;
let submitting = false;
let errorMessage = "";

function syncSession() {
	session = getGitHubAdminSession();
	if (!session) menuOpen = false;
}

function openLogin() {
	errorMessage = "";
	modalOpen = true;
	menuOpen = false;
}

function closeLogin() {
	if (submitting) return;
	modalOpen = false;
	token = "";
	errorMessage = "";
}

async function submitLogin() {
	submitting = true;
	errorMessage = "";
	try {
		session = await loginWithGitHubToken(token);
		token = "";
		modalOpen = false;
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "GitHub 登录失败。";
	} finally {
		submitting = false;
	}
}

function logout() {
	clearGitHubAdminSession();
	session = null;
	menuOpen = false;
}

onMount(() => {
	syncSession();
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
	return () =>
		window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
});
</script>

<div class="github-admin-login">
	{#if session}
		<button
			type="button"
			class="session-button btn-plain scale-animation"
			aria-label="GitHub 管理菜单"
			title="GitHub 管理菜单"
			aria-expanded={menuOpen}
			onclick={() => (menuOpen = !menuOpen)}
		>
			{#if session.avatarUrl}
				<img src={session.avatarUrl} alt="" />
			{:else}
				<span class="avatar-fallback">GH</span>
			{/if}
			<span class="session-label">{session.login}</span>
		</button>
		{#if menuOpen}
			<div class="session-menu">
				<div class="session-identity">
					<strong>{session.name}</strong>
					<span>{session.owner}/{session.repo}</span>
				</div>
				<a href={url("/write/")} onclick={() => (menuOpen = false)}>写作管理</a>
				<a href={url("/dynamic/#dynamic-admin")} onclick={() => (menuOpen = false)}>动态管理</a>
				<a href={url("/gallery/manage/")} onclick={() => (menuOpen = false)}>相册管理</a>
				<button type="button" class="logout-button" onclick={logout}>退出登录</button>
			</div>
		{/if}
	{:else}
		<button
			type="button"
			class="login-button btn-plain scale-animation"
			onclick={openLogin}
			aria-label="登录 GitHub"
			title="GitHub 登录"
		>
			<span class="github-mark">GH</span>
			<span>GitHub 登录</span>
		</button>
	{/if}
</div>

{#if modalOpen}
	<div class="login-backdrop" role="presentation" onclick={closeLogin}>
		<section
			class="login-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="github-login-title"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="dialog-header">
				<div>
					<h2 id="github-login-title">登录 GitHub 管理账号</h2>
					<p>验证后在此设备保留 {githubAdminConfig.sessionDays} 天。</p>
				</div>
				<button type="button" class="close-button" aria-label="关闭" onclick={closeLogin}>×</button>
			</div>
			<label class="token-field">
				<span>Fine-grained Personal Access Token</span>
				<input
					type="password"
					bind:value={token}
					placeholder="github_pat_..."
					autocomplete="off"
					onkeydown={(event) => {
						if (event.key === "Enter" && !submitting) void submitLogin();
					}}
				/>
			</label>
			<p class="login-note">
				Token 需要 {githubAdminConfig.owner}/{githubAdminConfig.repo} 的 Contents 读写权限，只保存在当前浏览器。
			</p>
			{#if errorMessage}<div class="login-error">{errorMessage}</div>{/if}
			<div class="dialog-actions">
				<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">创建 Token</a>
				<button type="button" class="submit-button" disabled={submitting || !token.trim()} onclick={submitLogin}>
					{submitting ? "验证中..." : "验证并登录"}
				</button>
			</div>
		</section>
	</div>
{/if}

<style>
	.github-admin-login {
		position: relative;
		display: flex;
		align-items: center;
	}

	.login-button,
	.session-button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 2.75rem;
		padding: 0 0.7rem;
		border-radius: 0.55rem;
		font-size: 0.82rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.github-mark,
	.avatar-fallback {
		display: grid;
		place-items: center;
		width: 1.65rem;
		height: 1.65rem;
		border-radius: 50%;
		background: #24292f;
		color: #fff;
		font-size: 0.62rem;
		font-weight: 800;
	}

	.session-button img {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		object-fit: cover;
	}

	.session-menu {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		z-index: 120;
		display: grid;
		width: 13.5rem;
		padding: 0.5rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.55rem;
		background: var(--card-bg);
		box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
		backdrop-filter: blur(16px);
	}

	.session-menu a,
	.logout-button {
		padding: 0.65rem 0.7rem;
		border-radius: 0.4rem;
		text-align: left;
		font-size: 0.85rem;
	}

	.session-menu a:hover,
	.logout-button:hover {
		background: var(--btn-plain-bg-hover);
	}

	.session-identity {
		display: grid;
		gap: 0.12rem;
		padding: 0.5rem 0.7rem 0.7rem;
		border-bottom: 1px solid var(--line-divider);
		margin-bottom: 0.25rem;
	}

	.session-identity span {
		font-size: 0.72rem;
		opacity: 0.6;
	}

	.logout-button {
		border: 0;
		background: transparent;
		color: #c43d3d;
		cursor: pointer;
	}

	.login-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(10 14 18 / 0.58);
		backdrop-filter: blur(8px);
	}

	.login-dialog {
		width: min(29rem, 100%);
		padding: 1.25rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.65rem;
		background: var(--card-bg);
		box-shadow: 0 24px 70px rgb(0 0 0 / 0.28);
	}

	.dialog-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}

	.dialog-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.dialog-header p,
	.login-note {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		line-height: 1.55;
		opacity: 0.65;
	}

	.close-button {
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 50%;
		background: transparent;
		font-size: 1.35rem;
		cursor: pointer;
	}

	.token-field {
		display: grid;
		gap: 0.45rem;
		margin-top: 1.1rem;
		font-size: 0.82rem;
		font-weight: 700;
	}

	.token-field input {
		width: 100%;
		padding: 0.72rem 0.8rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.45rem;
		background: var(--card-bg);
		color: inherit;
		font: inherit;
	}

	.login-error {
		margin-top: 0.8rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid rgb(196 61 61 / 0.3);
		border-radius: 0.4rem;
		background: rgb(196 61 61 / 0.08);
		color: #c43d3d;
		font-size: 0.8rem;
	}

	.dialog-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1rem;
	}

	.dialog-actions a {
		font-size: 0.8rem;
		color: var(--primary);
	}

	.submit-button {
		padding: 0.65rem 0.9rem;
		border: 0;
		border-radius: 0.45rem;
		background: var(--primary);
		color: white;
		font-weight: 700;
		cursor: pointer;
	}

	.submit-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	@media (max-width: 1480px) {
		.login-button span:last-child,
		.session-label {
			display: none;
		}

		.login-button,
		.session-button {
			width: 2.75rem;
			padding: 0;
			justify-content: center;
		}
	}
</style>
