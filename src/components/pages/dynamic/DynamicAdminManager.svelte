<script lang="ts">
import { onMount } from "svelte";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
	getGitHubRepoConfigFromSession,
} from "@/utils/admin/github-session";
import {
	deleteRepoFile,
	fetchRepoFile,
	listRepoTree,
	saveRepoFile,
} from "@/utils/write/github";

interface Props {
	timezone: string;
}

type DynamicFile = {
	path: string;
	sha: string;
	published: string;
	body: string;
};

const { timezone }: Props = $props();

let session = $state<GitHubAdminSession | null>(null);
let items = $state<DynamicFile[]>([]);
let selectedPath = $state("");
let published = $state("");
let body = $state("");
let currentSha = $state("");
let loading = $state(false);
let saving = $state(false);
let deleting = $state(false);
let errorMessage = $state("");
let successMessage = $state("");
let query = $state("");

const filteredItems = $derived(
	items.filter((item) => {
		const keyword = query.trim().toLowerCase();
		if (!keyword) return true;
		return [item.path, item.published, item.body]
			.join(" ")
			.toLowerCase()
			.includes(keyword);
	}),
);

function parseDynamic(path: string, sha: string, source: string): DynamicFile {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	const frontmatter = match?.[1] || "";
	const publishedMatch = frontmatter.match(/^published:\s*(.+)$/m);
	const rawPublished = publishedMatch?.[1]?.trim() || "";
	return {
		path,
		sha,
		published: rawPublished.replace(/^(["'])(.*)\1$/, "$2"),
		body: match ? source.slice(match[0].length).replace(/^\n+/, "") : source,
	};
}

function buildDynamicSource(): string {
	return `---\npublished: ${published.trim()}\n---\n\n${body.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
}

function summary(value: string): string {
	return value
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " [图片] ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[`*_>#~-]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 46);
}

function timestampParts(): Record<string, string> {
	return Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone || "Asia/Shanghai",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(new Date())
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, part.value]),
	);
}

function createNew() {
	const time = timestampParts();
	published = `${time.year}-${time.month}-${time.day} ${time.hour}:${time.minute}:${time.second}`;
	selectedPath = `src/content/dynamic/${time.year}-${time.month}-${time.day}-${time.hour}${time.minute}${time.second}.md`;
	currentSha = "";
	body = "";
	errorMessage = "";
	successMessage = "填写正文后保存，将创建新的 GitHub 提交。";
}

function selectItem(item: DynamicFile) {
	selectedPath = item.path;
	currentSha = item.sha;
	published = item.published;
	body = item.body;
	errorMessage = "";
	successMessage = "";
}

async function loadDynamics(preferredPath = "") {
	const config = getGitHubRepoConfigFromSession(session);
	if (!config) return;
	loading = true;
	errorMessage = "";
	try {
		const tree = await listRepoTree(config);
		const paths = tree
			.filter(
				(entry) =>
					entry.type === "blob" &&
					entry.path.startsWith("src/content/dynamic/") &&
					entry.path.endsWith(".md"),
			)
			.map((entry) => entry.path)
			.sort((left, right) => right.localeCompare(left));
		items = await Promise.all(
			paths.map(async (path) => {
				const file = await fetchRepoFile(config, path);
				return parseDynamic(path, file.sha, file.content);
			}),
		);
		const target =
			items.find((item) => item.path === preferredPath) ||
			items.find((item) => item.path === selectedPath) ||
			items[0];
		if (target) selectItem(target);
		else createNew();
	} catch (error) {
		errorMessage =
			error instanceof Error ? error.message : "动态列表读取失败。";
	} finally {
		loading = false;
	}
}

async function saveCurrent() {
	const config = getGitHubRepoConfigFromSession(session);
	if (!config) {
		errorMessage = "GitHub 登录已失效，请重新登录。";
		return;
	}
	if (!/^\d{4}-\d{2}-\d{2} [0-2]\d:[0-5]\d:[0-5]\d$/.test(published.trim())) {
		errorMessage = "发布时间格式必须为 YYYY-MM-DD HH:mm:ss。";
		return;
	}
	if (!body.trim()) {
		errorMessage = "动态正文不能为空。";
		return;
	}

	saving = true;
	errorMessage = "";
	successMessage = "";
	try {
		const result = await saveRepoFile({
			config,
			filePath: selectedPath,
			content: buildDynamicSource(),
			message: currentSha ? "update dynamic" : "create dynamic",
			sha: currentSha || undefined,
		});
		const savedMessage = result.commitUrl
			? `已提交：${result.commitUrl}。部署完成后公开动态列表会更新。`
			: "已提交。部署完成后公开动态列表会更新。";
		await loadDynamics(selectedPath);
		successMessage = savedMessage;
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "动态保存失败。";
	} finally {
		saving = false;
	}
}

async function deleteCurrent() {
	const config = getGitHubRepoConfigFromSession(session);
	if (!config || !currentSha) return;
	if (!confirm(`确定删除 ${selectedPath}？此操作会创建 GitHub 删除提交。`))
		return;
	deleting = true;
	errorMessage = "";
	successMessage = "";
	try {
		await deleteRepoFile({
			config,
			filePath: selectedPath,
			message: "delete dynamic",
			sha: currentSha,
		});
		selectedPath = "";
		currentSha = "";
		published = "";
		body = "";
		await loadDynamics();
		successMessage = "动态已删除并提交。";
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "动态删除失败。";
	} finally {
		deleting = false;
	}
}

function syncSession() {
	session = getGitHubAdminSession();
	if (session) void loadDynamics();
	else {
		items = [];
		selectedPath = "";
	}
}

onMount(() => {
	syncSession();
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
	return () =>
		window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
});
</script>

{#if session}
	<section id="dynamic-admin" class="dynamic-admin card-base" aria-labelledby="dynamic-admin-title">
		<header class="dynamic-admin-header">
			<div>
				<h2 id="dynamic-admin-title">动态管理</h2>
				<p>以 {session.login} 身份直接提交到 {session.owner}/{session.repo}。</p>
			</div>
			<div class="dynamic-admin-actions">
				<button type="button" onclick={() => loadDynamics()} disabled={loading}>刷新</button>
				<button type="button" class="primary" onclick={createNew}>新建动态</button>
			</div>
		</header>

		<div class="dynamic-admin-layout">
			<aside class="dynamic-admin-list">
				<input type="search" bind:value={query} placeholder="搜索动态" aria-label="搜索动态" />
				<div class="dynamic-admin-items">
					{#if loading}
						<div class="admin-empty">正在读取 GitHub 动态...</div>
					{:else if filteredItems.length === 0}
						<div class="admin-empty">暂无动态</div>
					{:else}
						{#each filteredItems as item}
							<button
								type="button"
								class:active={item.path === selectedPath}
								onclick={() => selectItem(item)}
							>
								<strong>{summary(item.body) || "空动态"}</strong>
								<span>{item.published}</span>
							</button>
						{/each}
					{/if}
				</div>
			</aside>

			<div class="dynamic-admin-editor">
				<label>
					<span>发布时间</span>
					<input bind:value={published} placeholder="2026-07-19 15:30:00" />
				</label>
				<label>
					<span>Markdown 正文</span>
					<textarea bind:value={body} placeholder="写一条新动态..."></textarea>
				</label>
				<div class="dynamic-file-path">{selectedPath || "尚未选择动态"}</div>
				{#if errorMessage}<div class="admin-message error">{errorMessage}</div>{/if}
				{#if successMessage}<div class="admin-message success">{successMessage}</div>{/if}
				<div class="editor-actions">
					<button type="button" class="danger" onclick={deleteCurrent} disabled={!currentSha || deleting || saving}>
						{deleting ? "删除中..." : "删除"}
					</button>
					<button type="button" class="primary" onclick={saveCurrent} disabled={!selectedPath || saving || deleting}>
						{saving ? "提交中..." : "保存到 GitHub"}
					</button>
				</div>
			</div>
		</div>
	</section>
{/if}

<style>
	.dynamic-admin {
		margin-bottom: 1rem;
		overflow: hidden;
	}

	.dynamic-admin-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-bottom: 1px solid var(--line-divider);
	}

	.dynamic-admin-header h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.dynamic-admin-header p {
		margin: 0.25rem 0 0;
		font-size: 0.78rem;
		opacity: 0.62;
	}

	.dynamic-admin-actions,
	.editor-actions {
		display: flex;
		gap: 0.55rem;
	}

	.dynamic-admin button {
		border: 1px solid var(--line-divider);
		border-radius: 0.42rem;
		background: transparent;
		color: inherit;
		padding: 0.55rem 0.75rem;
		cursor: pointer;
	}

	.dynamic-admin button.primary {
		border-color: var(--primary);
		background: var(--primary);
		color: white;
		font-weight: 700;
	}

	.dynamic-admin button.danger {
		border-color: rgb(196 61 61 / 0.35);
		color: #c43d3d;
	}

	.dynamic-admin button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dynamic-admin-layout {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr);
		min-height: 25rem;
	}

	.dynamic-admin-list {
		padding: 0.85rem;
		border-right: 1px solid var(--line-divider);
	}

	.dynamic-admin-list input,
	.dynamic-admin-editor input,
	.dynamic-admin-editor textarea {
		width: 100%;
		border: 1px solid var(--line-divider);
		border-radius: 0.42rem;
		background: color-mix(in oklab, var(--card-bg) 92%, transparent);
		color: inherit;
		font: inherit;
	}

	.dynamic-admin-list input,
	.dynamic-admin-editor input {
		padding: 0.62rem 0.7rem;
	}

	.dynamic-admin-items {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.65rem;
		max-height: 25rem;
		overflow-y: auto;
	}

	.dynamic-admin-items button {
		display: grid;
		gap: 0.2rem;
		text-align: left;
		padding: 0.65rem;
	}

	.dynamic-admin-items button.active {
		border-color: var(--primary);
		background: color-mix(in oklab, var(--primary) 10%, transparent);
	}

	.dynamic-admin-items strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.82rem;
	}

	.dynamic-admin-items span,
	.dynamic-file-path,
	.admin-empty {
		font-size: 0.72rem;
		opacity: 0.6;
	}

	.dynamic-admin-editor {
		display: grid;
		gap: 0.9rem;
		align-content: start;
		padding: 1rem;
	}

	.dynamic-admin-editor label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.dynamic-admin-editor textarea {
		min-height: 15rem;
		padding: 0.75rem;
		resize: vertical;
		font-family: Consolas, "Cascadia Mono", monospace;
		line-height: 1.6;
	}

	.admin-message {
		padding: 0.65rem 0.75rem;
		border-radius: 0.4rem;
		font-size: 0.78rem;
		line-height: 1.5;
		word-break: break-word;
	}

	.admin-message.error {
		background: rgb(196 61 61 / 0.08);
		color: #c43d3d;
	}

	.admin-message.success {
		background: color-mix(in oklab, var(--primary) 10%, transparent);
		color: var(--primary);
	}

	.editor-actions {
		justify-content: space-between;
	}

	@media (max-width: 760px) {
		.dynamic-admin-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.dynamic-admin-layout {
			grid-template-columns: 1fr;
		}

		.dynamic-admin-list {
			border-right: 0;
			border-bottom: 1px solid var(--line-divider);
		}

		.dynamic-admin-items {
			max-height: 12rem;
		}
	}
</style>
