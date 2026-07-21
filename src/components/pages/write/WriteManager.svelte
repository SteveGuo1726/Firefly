<script lang="ts">
import { onMount, tick } from "svelte";
import { coverImageConfig, siteConfig } from "@/config";
import { githubAdminConfig } from "@/config/githubAdminConfig";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	getGitHubAdminSession,
} from "@/utils/admin/github-session";
import { getApiUrlList } from "@/utils/image-utils";
import type { PostFrontmatter } from "@/utils/write/frontmatter";
import { buildPostSource, parsePostSource } from "@/utils/write/frontmatter";
import {
	buildGitHubSourceUrl,
	fetchRepoFile,
	type GitHubRepoConfig,
	listRepoTree,
	saveRepoFile,
} from "@/utils/write/github";
import {
	enhanceFireflyPreview,
	renderFireflyPreview,
	resolvePreviewAssetCandidates,
	resolvePreviewAssetUrl,
} from "@/utils/write/preview";

type PostListItem = {
	id: string;
	title: string;
	description: string;
	published: number;
	category: string;
	password: boolean;
	draft: boolean;
	filePath: string;
};

type RepoForm = {
	owner: string;
	repo: string;
	branch: string;
	token: string;
};

type ImageBedForm = {
	baseUrl: string;
	token: string;
	folder: string;
};

type ImageItem = {
	key: string;
	url: string;
	size: number;
};

const IMAGE_BED_STORAGE_KEY = "FIREFLY_WRITE_IMAGE_BED_CONFIG";
const DEFAULT_POST_BODY = `# 新文章

这里开始写正文。
`;

const EMPTY_POST = (): PostFrontmatter => ({
	title: "",
	slug: "",
	published: new Date().toISOString().slice(0, 10),
	updated: "",
	description: "",
	image: "",
	tags: [],
	category: "",
	lang: "",
	draft: false,
	pinned: false,
	author: "",
	sourceLink: "",
	licenseName: "",
	licenseUrl: "",
	comment: true,
	password: "",
	passwordHint: "",
});

let mounted = false;
let isConnected = false;
let isConnecting = false;
let loadingPosts = false;
let loadingArticle = false;
let savingArticle = false;
let previewLoading = false;
let loadingImages = false;
let uploadingImage = false;

let repoForm: RepoForm = {
	owner: githubAdminConfig.owner,
	repo: githubAdminConfig.repo,
	branch: githubAdminConfig.branch,
	token: "",
};

let imageBedForm: ImageBedForm = {
	baseUrl: "",
	token: "",
	folder: "blog",
};

let posts: PostListItem[] = [];
let filteredPosts: PostListItem[] = [];
let searchKeyword = "";
let imageItems: ImageItem[] = [];
let imageErrorMessage = "";

let selectedPostId = "";
let currentFilePath = "";
let currentFileSha = "";
let currentSourceUrl = "";
let currentDownloadUrl = "";
let currentExtraBlocks: string[] = [];
let currentExtension: "md" | "mdx" = "md";
let sourceBody = DEFAULT_POST_BODY;
let form = EMPTY_POST();

let saveMessage = "";
let loadMessage = "";
let errorMessage = "";
let previewHtml = "";
let coverPreviewSource = "";
let coverPreviewCandidates: string[] = [];
let targetFilePath = "src/content/posts/new-post.md";
let previewTrigger = "";

let previewContainer: HTMLDivElement | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-/]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeSlugPath(value: string): string {
	return value
		.split("/")
		.map((segment) => slugify(segment))
		.filter(Boolean)
		.join("/");
}

function normalizeRepoConfig(formValue: RepoForm): GitHubRepoConfig | null {
	if (
		!formValue.owner.trim() ||
		!formValue.repo.trim() ||
		!formValue.branch.trim() ||
		!formValue.token.trim()
	) {
		return null;
	}

	return {
		owner: formValue.owner.trim(),
		repo: formValue.repo.trim(),
		branch: formValue.branch.trim(),
		token: formValue.token.trim(),
	};
}

function persistImageBedConfig() {
	if (!mounted) return;

	localStorage.setItem(
		IMAGE_BED_STORAGE_KEY,
		JSON.stringify({
			baseUrl: imageBedForm.baseUrl.trim(),
			token: imageBedForm.token.trim(),
			folder: imageBedForm.folder.trim() || "blog",
		}),
	);
}

function loadStoredImageBedConfig() {
	const raw = localStorage.getItem(IMAGE_BED_STORAGE_KEY);
	if (!raw) return;

	try {
		const parsed = JSON.parse(raw) as Partial<ImageBedForm>;
		imageBedForm = {
			baseUrl: parsed.baseUrl || "",
			token: parsed.token || "",
			folder: parsed.folder || "blog",
		};
	} catch {
		// ignore malformed storage
	}
}

function refreshFilteredPosts() {
	const keyword = searchKeyword.trim().toLowerCase();
	if (!keyword) {
		filteredPosts = posts;
		return;
	}

	filteredPosts = posts.filter((post) => {
		const haystack = [
			post.title,
			post.description,
			post.category,
			post.id,
			post.filePath,
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(keyword);
	});
}

async function fetchPostList() {
	const repoConfig = normalizeRepoConfig(repoForm);
	if (!repoConfig) {
		posts = [];
		filteredPosts = [];
		return;
	}

	loadingPosts = true;
	errorMessage = "";

	try {
		const tree = await listRepoTree(repoConfig);
		const postFiles = tree
			.filter(
				(entry) =>
					entry.type === "blob" &&
					entry.path.startsWith("src/content/posts/") &&
					/\.(md|mdx)$/i.test(entry.path),
			)
			.sort((left, right) => right.path.localeCompare(left.path));

		const entries = await Promise.all(
			postFiles.map(async (entry) => {
				const repoFile = await fetchRepoFile(repoConfig, entry.path);
				const parsed = parsePostSource(repoFile.content);
				const relativePath = entry.path.replace(/^src\/content\/posts\//, "");
				const stem = relativePath.replace(/\.(md|mdx)$/i, "");
				const publishedAt = parsed.fields.published
					? new Date(parsed.fields.published).getTime()
					: Date.now();

				return {
					id: stem,
					title: parsed.fields.title || stem,
					description: parsed.fields.description || "",
					published: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
					category: parsed.fields.category || "",
					password: !!parsed.fields.password,
					draft: !!parsed.fields.draft,
					filePath: entry.path,
				} satisfies PostListItem;
			}),
		);

		posts = entries.sort((left, right) => right.published - left.published);
		refreshFilteredPosts();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "文章列表加载失败";
		throw error;
	} finally {
		loadingPosts = false;
	}
}

function deriveCurrentContentDirectory(): string {
	const slugPath = normalizeSlugPath(form.slug.trim());
	if (!selectedPostId && slugPath.includes("/")) {
		const lastSlashIndex = slugPath.lastIndexOf("/");
		return `src/content/posts/${slugPath.slice(0, lastSlashIndex)}`;
	}

	if (!currentFilePath.trim()) {
		return "src/content/posts";
	}

	const normalized = currentFilePath.trim().replace(/^\/+/, "");
	const lastSlashIndex = normalized.lastIndexOf("/");
	if (lastSlashIndex === -1) {
		return "src/content/posts";
	}

	return normalized.slice(0, lastSlashIndex);
}

function deriveCurrentStem(): string {
	const slugPath = normalizeSlugPath(form.slug.trim());
	if (slugPath) {
		const segments = slugPath.split("/");
		return segments[segments.length - 1] || "new-post";
	}

	if (selectedPostId && currentFilePath.trim()) {
		const filename = currentFilePath.split("/").pop() || "new-post.md";
		return filename.replace(/\.(md|mdx)$/i, "");
	}

	return slugify(form.title || "new-post") || "new-post";
}

function resetEditor() {
	selectedPostId = "";
	currentFilePath = "";
	currentFileSha = "";
	currentSourceUrl = "";
	currentDownloadUrl = "";
	currentExtraBlocks = [];
	currentExtension = "md";
	form = EMPTY_POST();
	sourceBody = DEFAULT_POST_BODY;
	saveMessage = "";
	loadMessage = "";
	errorMessage = "";
}

function createNewPost() {
	resetEditor();
	form.published = new Date().toISOString().slice(0, 10);
	loadMessage = "已新建草稿，可以直接开始写。";
}

function parseTagInput(value: string): string[] {
	return value
		.split(/[,\n]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function updateTagsFromInput(event: Event) {
	const target = event.currentTarget as HTMLInputElement;
	form.tags = parseTagInput(target.value);
}

function formatPostDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("zh-CN");
}

function updateCoverPreviewSource() {
	const imageValue = form.image.trim();
	if (!imageValue) {
		coverPreviewCandidates = [];
		coverPreviewSource = "";
		return;
	}

	if (imageValue === "api") {
		const apiCandidates = getApiUrlList("api", targetFilePath);
		const fallbackPath = coverImageConfig.randomCoverImage.fallback
			? resolvePreviewAssetUrl(
					coverImageConfig.randomCoverImage.fallback,
					normalizeRepoConfig(repoForm),
					targetFilePath,
				)
			: "";
		coverPreviewCandidates = [...apiCandidates, fallbackPath].filter(Boolean);
		coverPreviewSource = coverPreviewCandidates[0] || "";
		return;
	}

	// 相对路径基于当前目标文章文件所在目录解析；外链和 / 开头路径保持原逻辑
	coverPreviewCandidates = [
		...resolvePreviewAssetCandidates(
			imageValue,
			normalizeRepoConfig(repoForm),
			targetFilePath,
		),
	];
	coverPreviewCandidates = coverPreviewCandidates.filter(Boolean);
	coverPreviewSource = coverPreviewCandidates[0] || "";
}

function handleCoverPreviewError() {
	if (coverPreviewCandidates.length <= 1) {
		return;
	}

	coverPreviewCandidates = coverPreviewCandidates.slice(1);
	coverPreviewSource = coverPreviewCandidates[0] || "";
}

function normalizeImageBedUrl(): string {
	return imageBedForm.baseUrl.trim().replace(/\/+$/, "");
}

function canUseImageBed(): boolean {
	return !!normalizeImageBedUrl() && !!imageBedForm.token.trim();
}

function buildMarkdownImage(url: string, alt = ""): string {
	return `![${alt}](${url})`;
}

function insertTextAtCursor(text: string) {
	const textarea = document.querySelector<HTMLTextAreaElement>(".write-editor");
	if (!textarea) {
		sourceBody += sourceBody.endsWith("\n") ? text : `\n${text}`;
		return;
	}

	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const before = sourceBody.slice(0, start);
	const after = sourceBody.slice(end);
	sourceBody = `${before}${text}${after}`;

	requestAnimationFrame(() => {
		textarea.focus();
		const cursor = start + text.length;
		textarea.setSelectionRange(cursor, cursor);
	});
}

function insertImageIntoArticle(image: ImageItem) {
	insertTextAtCursor(`${buildMarkdownImage(image.url, image.key)}\n`);
}

async function fetchImageList() {
	if (!canUseImageBed()) {
		imageItems = [];
		return;
	}

	loadingImages = true;
	imageErrorMessage = "";

	try {
		const listUrl = new URL("/api/manage/list", normalizeImageBedUrl());
		listUrl.searchParams.set("dir", imageBedForm.folder.trim() || "blog");
		listUrl.searchParams.set("recursive", "true");
		listUrl.searchParams.set("count", "-1");

		const response = await fetch(listUrl.toString(), {
			headers: {
				Authorization: imageBedForm.token.trim(),
			},
		});

		if (!response.ok) {
			throw new Error(`图床列表加载失败：${response.status}`);
		}

		const payload = (await response.json()) as {
			files?: Array<{
				name?: string;
				metadata?: Record<string, string | number>;
			}>;
		};

		imageItems = (payload.files || [])
			.filter(
				(
					item,
				): item is {
					name: string;
					metadata?: Record<string, string | number>;
				} => typeof item.name === "string",
			)
			.map((item) => ({
				key: item.name,
				size: Number(item.metadata?.FileSizeBytes || 0),
				url: `${normalizeImageBedUrl()}/file/${item.name}`,
			}));
	} catch (error) {
		imageErrorMessage =
			error instanceof Error ? error.message : "图床列表加载失败";
	} finally {
		loadingImages = false;
	}
}

async function uploadImage(event: Event) {
	const target = event.currentTarget as HTMLInputElement;
	const file = target.files?.[0];
	if (!file || !canUseImageBed()) return;

	uploadingImage = true;
	imageErrorMessage = "";

	try {
		const formData = new FormData();
		formData.append("file", file);

		const uploadUrl = new URL("/upload", normalizeImageBedUrl());
		uploadUrl.searchParams.set(
			"uploadFolder",
			imageBedForm.folder.trim() || "blog",
		);

		const response = await fetch(uploadUrl.toString(), {
			method: "POST",
			headers: {
				Authorization: imageBedForm.token.trim(),
			},
			body: formData,
		});

		if (!response.ok) {
			throw new Error(`图床上传失败：${response.status}`);
		}

		const payload = (await response.json()) as Array<{
			src?: string;
			publicUrl?: string;
		}>;
		const imageUrl =
			payload[0]?.publicUrl ||
			(payload[0]?.src ? `${normalizeImageBedUrl()}${payload[0].src}` : "");

		if (!imageUrl) {
			throw new Error("图床没有返回可用的图片地址");
		}

		insertTextAtCursor(`${buildMarkdownImage(imageUrl, file.name)}\n`);
		await fetchImageList();
	} catch (error) {
		imageErrorMessage = error instanceof Error ? error.message : "图床上传失败";
	} finally {
		uploadingImage = false;
		target.value = "";
	}
}

async function deleteImage(image: ImageItem) {
	if (!canUseImageBed()) return;

	imageErrorMessage = "";
	try {
		const deleteUrl = new URL(
			`/api/manage/delete/${image.key}`,
			normalizeImageBedUrl(),
		);
		const response = await fetch(deleteUrl.toString(), {
			method: "GET",
			headers: {
				Authorization: imageBedForm.token.trim(),
			},
		});

		if (!response.ok) {
			throw new Error(`图床删除失败：${response.status}`);
		}

		await fetchImageList();
	} catch (error) {
		imageErrorMessage = error instanceof Error ? error.message : "图床删除失败";
	}
}

async function renameImage(image: ImageItem) {
	if (!canUseImageBed()) return;

	const nextName = window.prompt("输入新的图片文件名", image.key);
	if (!nextName || nextName.trim() === image.key) {
		return;
	}

	imageErrorMessage = "";
	try {
		const renameUrl = new URL("/api/manage/rename", normalizeImageBedUrl());
		const response = await fetch(renameUrl.toString(), {
			method: "POST",
			headers: {
				Authorization: imageBedForm.token.trim(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				oldKey: image.key,
				newKey: nextName.trim(),
			}),
		});

		if (!response.ok) {
			throw new Error(`图床重命名失败：${response.status}`);
		}

		await fetchImageList();
	} catch (error) {
		imageErrorMessage =
			error instanceof Error ? error.message : "图床重命名失败";
	}
}

async function updatePreview() {
	previewLoading = true;

	try {
		previewHtml = await renderFireflyPreview({
			source: sourceBody,
			calloutTheme: siteConfig.post.rehypeCallouts.theme,
		});
		await tick();

		if (previewContainer) {
			await enhanceFireflyPreview({
				container: previewContainer,
				repoConfig: normalizeRepoConfig(repoForm),
				postFilePath: targetFilePath,
			});
		}
	} catch (error) {
		previewHtml = `<div class="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">${error instanceof Error ? error.message : "预览渲染失败"}</div>`;
	} finally {
		previewLoading = false;
	}
}

function schedulePreview() {
	if (!mounted || !isConnected) return;
	if (previewTimer) {
		clearTimeout(previewTimer);
	}

	previewTimer = setTimeout(() => {
		void updatePreview();
	}, 150);
}

async function connectRepository() {
	const repoConfig = normalizeRepoConfig(repoForm);
	if (!repoConfig) {
		errorMessage = "请完整填写 owner、repo、branch 和 GitHub Token。";
		return;
	}

	isConnecting = true;
	errorMessage = "";

	try {
		await fetchPostList();
		isConnected = true;
		if (!selectedPostId) {
			createNewPost();
		}
	} catch {
		isConnected = false;
	} finally {
		isConnecting = false;
	}
}

function syncGitHubSession() {
	const session = getGitHubAdminSession();
	if (!session) {
		repoForm = {
			owner: githubAdminConfig.owner,
			repo: githubAdminConfig.repo,
			branch: githubAdminConfig.branch,
			token: "",
		};
		isConnected = false;
		posts = [];
		filteredPosts = [];
		errorMessage = "请先使用网页右上角的 GitHub 登录按钮完成验证。";
		return;
	}

	repoForm = {
		owner: session.owner,
		repo: session.repo,
		branch: session.branch,
		token: session.token,
	};
	void connectRepository();
}

async function openPost(post: PostListItem) {
	const repoConfig = normalizeRepoConfig(repoForm);
	if (!repoConfig) {
		errorMessage = "请先填写仓库 owner、repo、branch 和 GitHub Token。";
		return;
	}

	loadingArticle = true;
	errorMessage = "";
	saveMessage = "";
	loadMessage = "";

	try {
		const repoFile = await fetchRepoFile(repoConfig, post.filePath);
		const parsed = parsePostSource(repoFile.content);

		selectedPostId = post.id;
		currentFilePath = post.filePath;
		currentFileSha = repoFile.sha;
		currentSourceUrl = repoFile.htmlUrl;
		currentDownloadUrl = repoFile.downloadUrl;
		currentExtraBlocks = parsed.extraBlocks;
		currentExtension = post.filePath.endsWith(".mdx") ? "mdx" : "md";
		form = {
			...EMPTY_POST(),
			...parsed.fields,
			slug: parsed.fields.slug || post.id,
		};
		sourceBody = parsed.body || "";
		loadMessage = "文章源码已载入。";
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "文章加载失败";
	} finally {
		loadingArticle = false;
	}
}

async function saveCurrentPost() {
	const repoConfig = normalizeRepoConfig(repoForm);
	if (!repoConfig) {
		errorMessage = "请先填写仓库 owner、repo、branch 和 GitHub Token。";
		return;
	}

	if (!form.title.trim()) {
		errorMessage = "文章标题不能为空。";
		return;
	}

	savingArticle = true;
	errorMessage = "";
	saveMessage = "";

	try {
		const normalizedFields: PostFrontmatter = {
			...form,
			title: form.title.trim(),
			slug: normalizeSlugPath(form.slug.trim()),
			published: form.published || new Date().toISOString().slice(0, 10),
			updated: form.updated.trim(),
			description: form.description.trim(),
			image: form.image.trim(),
			tags: form.tags,
			category: form.category.trim(),
			lang: form.lang.trim(),
			author: form.author.trim(),
			sourceLink: form.sourceLink.trim(),
			licenseName: form.licenseName.trim(),
			licenseUrl: form.licenseUrl.trim(),
			password: form.password.trim(),
			passwordHint: form.passwordHint.trim(),
		};

		const finalSource = buildPostSource(
			normalizedFields,
			sourceBody,
			currentExtraBlocks,
		);
		const commitMessage = selectedPostId
			? `update post: ${normalizedFields.title}`
			: `create post: ${normalizedFields.title}`;

		const result = await saveRepoFile({
			config: repoConfig,
			filePath: targetFilePath,
			content: finalSource,
			message: commitMessage,
			sha: currentFileSha || undefined,
		});

		currentFilePath = targetFilePath;
		currentSourceUrl = buildGitHubSourceUrl(repoConfig, targetFilePath);
		saveMessage = result.commitUrl
			? `已提交保存，提交记录：${result.commitUrl}`
			: "已提交保存。";
		loadMessage = "";
		await fetchPostList();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "保存失败";
	} finally {
		savingArticle = false;
	}
}

$: refreshFilteredPosts();
$: persistImageBedConfig();
$: targetFilePath = (() => {
	const slugPath = normalizeSlugPath(form.slug.trim());
	if (slugPath) {
		return `src/content/posts/${slugPath}.${currentExtension}`;
	}
	return `${deriveCurrentContentDirectory()}/${deriveCurrentStem()}.${currentExtension}`;
})();
$: updateCoverPreviewSource();
$: previewTrigger = [
	sourceBody,
	form.title,
	form.slug,
	form.description,
	form.image,
	form.category,
	form.tags.join(","),
	form.author,
	form.lang,
	form.sourceLink,
	form.published,
	form.updated,
	form.draft ? "1" : "0",
	form.pinned ? "1" : "0",
	form.comment ? "1" : "0",
	currentExtension,
	currentFilePath,
	targetFilePath,
	repoForm.owner,
	repoForm.repo,
	repoForm.branch,
].join("|");
$: if (mounted && isConnected && previewTrigger) {
	schedulePreview();
}

onMount(() => {
	mounted = true;
	loadStoredImageBedConfig();
	createNewPost();
	localStorage.removeItem("FIREFLY_WRITE_REPO_CONFIG");
	syncGitHubSession();
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT, syncGitHubSession);
	return () =>
		window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT, syncGitHubSession);
});
</script>

{#if !isConnected}
	<div class="write-session-notice">
		当前未登录 GitHub。工作台已直接开放；读取文章和提交保存前，请使用网页右上角的 GitHub 登录按钮。
	</div>
{/if}

<div class="write-workbench">
		<aside class="write-panel write-panel-left">
			<section class="write-card">
				<div class="write-card-header">
					<div>
						<div class="write-card-title">GitHub 会话</div>
						<div class="write-card-subtitle">
							{isConnected ? "已复用右上角登录状态。" : "尚未登录，当前只可编辑本地表单。"}
						</div>
					</div>
					<button type="button" class="write-ghost-button" disabled={!isConnected || loadingPosts} onclick={fetchPostList}>
						{loadingPosts ? "读取中..." : "刷新文章"}
					</button>
				</div>

				<div class="write-session-repo">
					<strong>{repoForm.owner}/{repoForm.repo}</strong>
					<span>{repoForm.branch}</span>
				</div>
			</section>

			<section class="write-card">
				<div class="write-card-header">
					<div>
						<div class="write-card-title">图床接入</div>
						<div class="write-card-subtitle">
							填写图床地址和 API Token 后，可以列图、上传、删除、重命名，并快速插入正文。
						</div>
					</div>
					<button
						type="button"
						class="write-ghost-button"
						onclick={fetchImageList}
						disabled={loadingImages}
					>
						{loadingImages ? "读取中..." : "刷新"}
					</button>
				</div>

				<div class="write-form-stack">
					<label class="write-field">
						<span>图床地址</span>
						<input
							bind:value={imageBedForm.baseUrl}
							placeholder="https://img.casto.top"
						/>
					</label>
					<label class="write-field">
						<span>API Token</span>
						<input
							bind:value={imageBedForm.token}
							type="password"
							placeholder="图床 API Token"
						/>
					</label>
					<label class="write-field">
						<span>目录</span>
						<input bind:value={imageBedForm.folder} placeholder="blog" />
					</label>
					<label class="write-field">
						<span>上传图片</span>
						<input type="file" accept="image/*" oninput={uploadImage} />
					</label>
				</div>

				{#if imageErrorMessage}
					<div class="write-message write-message-error">{imageErrorMessage}</div>
				{/if}

				<div class="write-image-list">
					{#if imageItems.length === 0}
						<div class="write-empty-state">还没有加载图片列表。</div>
					{:else}
						{#each imageItems as image}
							<div class="write-image-item">
								<div class="write-image-preview">
									<img src={image.url} alt={image.key} />
								</div>
								<div class="write-image-meta">
									<div class="write-image-key">{image.key}</div>
									<div class="write-image-url">{image.url}</div>
								</div>
								<div class="write-image-actions">
									<button
										type="button"
										class="write-ghost-button"
										onclick={() => insertImageIntoArticle(image)}
									>
										插入
									</button>
									<button
										type="button"
										class="write-ghost-button"
										onclick={() => renameImage(image)}
									>
										重命名
									</button>
									<button
										type="button"
										class="write-ghost-button"
										onclick={() => deleteImage(image)}
									>
										删除
									</button>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="write-card">
				<div class="write-card-header">
					<div>
						<div class="write-card-title">文章管理</div>
						<div class="write-card-subtitle">
							认证后从 GitHub 仓库直接拉文章，不依赖公开文章列表。
						</div>
					</div>
					<button class="write-ghost-button" type="button" onclick={createNewPost}>
						新建
					</button>
				</div>

				<label class="write-field">
					<span>筛选</span>
					<input bind:value={searchKeyword} placeholder="标题 / 分类 / 路径" />
				</label>

				<div class="write-post-list">
					{#if loadingPosts}
						<div class="write-empty-state">正在读取文章列表...</div>
					{:else if filteredPosts.length === 0}
						<div class="write-empty-state">没有匹配的文章。</div>
					{:else}
						{#each filteredPosts as post}
							<button
								type="button"
								class:selected={selectedPostId === post.id}
								class="write-post-item"
								onclick={() => openPost(post)}
							>
								<div class="write-post-title-row">
								<div class="write-post-title">{post.title}</div>
									{#if post.password}
										<span class="write-post-badge">加密</span>
									{/if}
									{#if post.draft}
										<span class="write-post-badge">草稿</span>
									{/if}
								</div>
								<div class="write-post-description">
									{post.description || "无摘要"}
								</div>
								<div class="write-post-meta">
									<span>{formatPostDate(post.published)}</span>
									{#if post.category}
										<span>{post.category}</span>
									{/if}
								</div>
								<div class="write-post-path">{post.filePath}</div>
							</button>
						{/each}
					{/if}
				</div>
			</section>

			<section class="write-card">
				<div class="write-card-header">
					<div>
						<div class="write-card-title">文章信息</div>
						<div class="write-card-subtitle">
							这些字段会写回 frontmatter，支持目录型 slug。
						</div>
					</div>
				</div>

				<div class="write-form-grid">
					<label class="write-field write-field-span-2">
						<span>标题</span>
						<input bind:value={form.title} />
					</label>
					<label class="write-field">
						<span>Slug</span>
						<input bind:value={form.slug} placeholder="moments/mmd-start" />
					</label>
					<label class="write-field">
						<span>格式</span>
						<select bind:value={currentExtension}>
							<option value="md">Markdown (.md)</option>
							<option value="mdx">MDX (.mdx)</option>
						</select>
					</label>
					<label class="write-field">
						<span>发布日期</span>
						<input bind:value={form.published} type="date" />
					</label>
					<label class="write-field">
						<span>更新日期</span>
						<input bind:value={form.updated} type="date" />
					</label>
					<label class="write-field write-field-span-2">
						<span>摘要</span>
						<textarea bind:value={form.description} rows="3"></textarea>
					</label>
					<label class="write-field write-field-span-2">
						<span>封面图</span>
						<input
							bind:value={form.image}
							placeholder="/images/cover.webp / https://... / api"
						/>
					</label>
					<label class="write-field">
						<span>分类</span>
						<input bind:value={form.category} />
					</label>
					<label class="write-field">
						<span>标签</span>
						<input
							value={form.tags.join(", ")}
							oninput={updateTagsFromInput}
							placeholder="标签1, 标签2"
						/>
					</label>
					<label class="write-field">
						<span>作者</span>
						<input bind:value={form.author} />
					</label>
					<label class="write-field">
						<span>语言</span>
						<input bind:value={form.lang} placeholder="zh_CN / en" />
					</label>
					<label class="write-field write-field-span-2">
						<span>来源链接</span>
						<input bind:value={form.sourceLink} />
					</label>
				</div>

				<div class="write-toggle-row">
					<label><input bind:checked={form.draft} type="checkbox" /> 草稿</label>
					<label><input bind:checked={form.pinned} type="checkbox" /> 置顶</label>
					<label
						><input bind:checked={form.comment} type="checkbox" /> 开启评论</label
					>
				</div>

				<div class="write-file-meta">
					<div>目标文件：{targetFilePath}</div>
					{#if currentSourceUrl}
						<a href={currentSourceUrl} target="_blank" rel="noopener noreferrer">
							打开源文件
						</a>
					{/if}
				</div>

				{#if form.image}
					<div class="write-cover-preview">
						<div class="write-cover-label">封面预览</div>
						<div class="write-cover-hint">{coverPreviewSource}</div>
						<div class="write-cover-frame">
							<img
								src={coverPreviewSource}
								alt="封面预览"
								onerror={handleCoverPreviewError}
							/>
						</div>
					</div>
				{/if}
			</section>
		</aside>

		<section class="write-panel write-panel-center">
			<div class="write-preview-shell">
				<div class="write-preview-header">
					<div>
						<div class="write-card-title">实时预览</div>
						<div class="write-card-subtitle">
							尽量按 Firefly 当前正文样式渲染，图片会按仓库路径解析。
						</div>
					</div>
					{#if previewLoading}
						<div class="write-status-text">渲染中...</div>
					{/if}
				</div>

				<div class="write-preview-body">
					<div
						bind:this={previewContainer}
						class="prose prose-base max-w-none custom-md dark:prose-invert"
					>
						{@html previewHtml}
					</div>
				</div>
			</div>
		</section>

		<aside class="write-panel write-panel-right">
			<section class="write-card write-editor-card">
				<div class="write-card-header">
					<div>
						<div class="write-card-title">正文写作</div>
						<div class="write-card-subtitle">
							直接写 Markdown / MDX / HTML，预览会自动刷新。
						</div>
					</div>
					<button
						type="button"
						class="write-primary-button"
						disabled={savingArticle || loadingArticle}
						onclick={saveCurrentPost}
					>
						{savingArticle ? "提交中..." : "提交保存"}
					</button>
				</div>

				<textarea
					bind:value={sourceBody}
					class="write-editor"
					placeholder="在这里写 Markdown / MDX / HTML 正文"
				></textarea>

				{#if loadMessage}
					<div class="write-message write-message-success">{loadMessage}</div>
				{/if}
				{#if saveMessage}
					<div class="write-message write-message-success">{saveMessage}</div>
				{/if}
				{#if errorMessage}
					<div class="write-message write-message-error">{errorMessage}</div>
				{/if}
			</section>
		</aside>
	</div>

<style>
	.write-session-notice {
		margin-bottom: 1rem;
		padding: 0.8rem 1rem;
		border: 1px solid color-mix(in oklab, var(--primary) 35%, var(--line-divider));
		border-radius: var(--radius-large);
		background: color-mix(in oklab, var(--primary) 8%, var(--card-bg));
		font-size: 0.86rem;
		line-height: 1.6;
	}

	.write-session-repo {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
		border-radius: 0.55rem;
		background: color-mix(in oklab, var(--card-bg) 82%, var(--primary) 8%);
		font-size: 0.82rem;
	}

	.write-session-repo span {
		opacity: 0.58;
	}

	.write-workbench {
		display: grid;
		grid-template-columns: minmax(18rem, 24rem) minmax(0, 1.2fr) minmax(
				22rem,
				0.95fr
			);
		gap: 1rem;
		align-items: start;
	}

	.write-panel {
		min-width: 0;
	}

	.write-panel-left,
	.write-panel-right {
		position: sticky;
		top: 5.5rem;
		display: grid;
		gap: 1rem;
		max-height: calc(100vh - 7rem);
		overflow: auto;
		padding-right: 0.125rem;
	}

	.write-card,
	.write-preview-shell {
		border-radius: var(--radius-large);
		border: 1px solid var(--line-divider);
		background: color-mix(in oklab, var(--card-bg) 92%, transparent);
		backdrop-filter: blur(12px);
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.06);
	}

	.write-card {
		padding: 1.1rem;
	}

	.write-preview-shell {
		overflow: hidden;
	}

	.write-card-header,
	.write-preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.write-card-title {
		font-size: 1rem;
		font-weight: 700;
		color: rgb(20 20 24 / 0.92);
	}

	:global(.dark) .write-card-title {
		color: rgb(255 255 255 / 0.92);
	}

	.write-card-subtitle,
	.write-status-text {
		margin-top: 0.3rem;
		font-size: 0.82rem;
		line-height: 1.55;
		color: rgb(20 20 24 / 0.5);
	}

	:global(.dark) .write-card-subtitle,
	:global(.dark) .write-status-text {
		color: rgb(255 255 255 / 0.48);
	}

	.write-form-stack,
	.write-form-grid {
		display: grid;
		gap: 0.85rem;
	}

	.write-form-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.write-field {
		display: grid;
		gap: 0.42rem;
		font-size: 0.82rem;
	}

	.write-field-span-2 {
		grid-column: span 2;
	}

	.write-field span {
		color: rgb(20 20 24 / 0.68);
	}

	:global(.dark) .write-field span {
		color: rgb(255 255 255 / 0.68);
	}

	.write-field input,
	.write-field select,
	.write-field textarea,
	.write-editor {
		width: 100%;
		border-radius: 0.95rem;
		border: 1px solid var(--line-divider);
		background: transparent;
		padding: 0.78rem 0.9rem;
		outline: none;
		transition:
			border-color 0.2s ease,
			background-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.write-field textarea {
		resize: vertical;
	}

	.write-field input:focus,
	.write-field select:focus,
	.write-field textarea:focus,
	.write-editor:focus {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent);
	}

	.write-toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem 1.2rem;
		margin-top: 1rem;
		font-size: 0.86rem;
	}

	.write-toggle-row label {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.write-file-meta {
		display: grid;
		gap: 0.35rem;
		margin-top: 1rem;
		padding: 0.85rem 0.95rem;
		border-radius: 0.95rem;
		border: 1px dashed var(--line-divider);
		font-size: 0.76rem;
		color: rgb(20 20 24 / 0.5);
	}

	.write-file-meta a {
		color: var(--primary);
	}

	:global(.dark) .write-file-meta {
		color: rgb(255 255 255 / 0.48);
	}

	.write-cover-preview {
		margin-top: 1rem;
	}

	.write-cover-label {
		margin-bottom: 0.55rem;
		font-size: 0.8rem;
		color: rgb(20 20 24 / 0.58);
	}

	.write-cover-hint {
		margin-bottom: 0.55rem;
		font-size: 0.72rem;
		color: rgb(20 20 24 / 0.42);
		word-break: break-all;
	}

	:global(.dark) .write-cover-label {
		color: rgb(255 255 255 / 0.56);
	}

	:global(.dark) .write-cover-hint {
		color: rgb(255 255 255 / 0.42);
	}

	.write-cover-frame {
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid var(--line-divider);
		background: rgb(255 255 255 / 0.45);
		aspect-ratio: 16 / 9;
	}

	.write-cover-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.write-post-list {
		display: grid;
		gap: 0.75rem;
		max-height: 24rem;
		overflow: auto;
		padding-right: 0.1rem;
	}

	.write-post-item {
		width: 100%;
		text-align: left;
		padding: 0.9rem;
		border-radius: 1rem;
		border: 1px solid var(--line-divider);
		background: transparent;
		transition:
			border-color 0.2s ease,
			background-color 0.2s ease,
			transform 0.2s ease;
	}

	.write-post-item:hover {
		border-color: var(--primary);
		transform: translateY(-1px);
	}

	.write-post-item.selected {
		border-color: var(--primary);
		background: color-mix(in oklab, var(--primary) 8%, transparent);
	}

	.write-post-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.write-post-title {
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.35;
	}

	.write-post-badge {
		flex: none;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--primary) 14%, transparent);
		color: var(--primary);
		font-size: 0.7rem;
	}

	.write-post-description {
		margin-top: 0.45rem;
		font-size: 0.76rem;
		line-height: 1.55;
		color: rgb(20 20 24 / 0.48);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .write-post-description,
	:global(.dark) .write-post-meta,
	:global(.dark) .write-post-path,
	:global(.dark) .write-empty-state {
		color: rgb(255 255 255 / 0.48);
	}

	.write-post-meta,
	.write-post-path,
	.write-empty-state {
		margin-top: 0.45rem;
		font-size: 0.72rem;
		color: rgb(20 20 24 / 0.45);
	}

	.write-post-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	.write-post-path {
		word-break: break-all;
	}

	.write-empty-state {
		padding: 1rem;
		border-radius: 1rem;
		border: 1px dashed var(--line-divider);
	}

	.write-image-list {
		display: grid;
		gap: 0.75rem;
		margin-top: 1rem;
		max-height: 24rem;
		overflow: auto;
	}

	.write-image-item {
		display: grid;
		gap: 0.7rem;
		padding: 0.8rem;
		border-radius: 1rem;
		border: 1px solid var(--line-divider);
	}

	.write-image-preview {
		overflow: hidden;
		border-radius: 0.8rem;
		aspect-ratio: 16 / 9;
		background: rgb(255 255 255 / 0.45);
	}

	.write-image-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.write-image-meta {
		display: grid;
		gap: 0.25rem;
		font-size: 0.75rem;
	}

	.write-image-key {
		font-weight: 600;
		word-break: break-all;
	}

	.write-image-url {
		color: rgb(20 20 24 / 0.45);
		word-break: break-all;
	}

	:global(.dark) .write-image-url {
		color: rgb(255 255 255 / 0.45);
	}

	.write-image-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.write-preview-header {
		padding: 1.1rem 1.15rem 0;
	}

	.write-preview-body {
		min-height: calc(100vh - 10rem);
		padding: 0.9rem 1.15rem 1.25rem;
	}

	.write-editor-card {
		display: flex;
		flex-direction: column;
	}

	.write-editor {
		min-height: calc(100vh - 18rem);
		resize: vertical;
		font-family:
			var(--font-jetbrains-mono),
			ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			"Liberation Mono",
			"Courier New",
			monospace;
		font-size: 0.88rem;
		line-height: 1.75;
	}

	.write-message {
		margin-top: 0.9rem;
		padding: 0.8rem 0.9rem;
		border-radius: 0.95rem;
		font-size: 0.82rem;
		line-height: 1.55;
		word-break: break-word;
	}

	.write-message-success {
		border: 1px solid rgb(16 185 129 / 0.2);
		background: rgb(16 185 129 / 0.08);
		color: rgb(4 120 87);
	}

	.write-message-error {
		border: 1px solid rgb(239 68 68 / 0.2);
		background: rgb(239 68 68 / 0.08);
		color: rgb(220 38 38);
	}

	:global(.dark) .write-message-success {
		color: rgb(110 231 183);
	}

	:global(.dark) .write-message-error {
		color: rgb(252 165 165);
	}

	.write-primary-button,
	.write-ghost-button {
		border: none;
		border-radius: 0.95rem;
		padding: 0.72rem 1rem;
		font-size: 0.84rem;
		font-weight: 600;
		transition:
			transform 0.2s ease,
			opacity 0.2s ease,
			background-color 0.2s ease;
	}

	.write-primary-button {
		background: var(--primary);
		color: white;
	}

	:global(.dark) .write-primary-button {
		color: rgb(0 0 0 / 0.82);
	}

	.write-ghost-button {
		background: var(--btn-regular-bg);
		color: var(--btn-content);
	}

	.write-primary-button:hover,
	.write-ghost-button:hover {
		transform: translateY(-1px);
	}

	.write-primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	@media (max-width: 1400px) {
		.write-workbench {
			grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
		}

		.write-panel-center {
			grid-column: 2;
			grid-row: 1 / span 2;
		}

		.write-panel-right {
			position: static;
			max-height: none;
			overflow: visible;
		}
	}

	@media (max-width: 1024px) {
		.write-workbench {
			grid-template-columns: 1fr;
		}

		.write-panel-left,
		.write-panel-right {
			position: static;
			max-height: none;
			overflow: visible;
		}

		.write-panel-center {
			grid-column: auto;
			grid-row: auto;
		}

		.write-preview-body,
		.write-editor {
			min-height: 24rem;
		}
	}

	@media (max-width: 640px) {
		.write-form-grid {
			grid-template-columns: 1fr;
		}

		.write-field-span-2 {
			grid-column: auto;
		}
	}
</style>
