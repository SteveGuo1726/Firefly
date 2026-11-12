<script lang="ts">
import { onMount } from "svelte";

interface ImageItem {
	key: string;
	url: string;
	name: string;
	size: number;
	ext: string;
	time: number;
}

let images = $state<ImageItem[]>([]);
let loading = $state(true);
let uploading = $state(false);
let uploadMessage = $state("");
let searchQuery = $state("");
let selectedExt = $state("all");
let token = $state("");
let showTokenModal = $state(false);
let isDraggingOver = $state(false);
let selectedImage = $state<ImageItem | null>(null);
let copiedType = $state<string | null>(null);

function formatSize(bytes: number): string {
	if (!bytes || bytes === 0) return "未知大小";
	if (bytes < 1024) return bytes + " B";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
	return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDate(ts: number): string {
	if (!ts) return "";
	const d = new Date(ts);
	return d.toLocaleDateString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

function fullUrl(path: string): string {
	if (!path) return "";
	if (/^(https?:)?\/\//i.test(path)) return path;
	if (typeof window !== "undefined") {
		return window.location.origin + path;
	}
	return path;
}

const exts = $derived(
	["all", ...Array.from(new Set(images.map((img) => img.ext.toLowerCase()))).filter(Boolean)].sort(),
);

const filteredImages = $derived(
	images.filter((img) => {
		const matchExt = selectedExt === "all" || img.ext.toLowerCase() === selectedExt.toLowerCase();
		const matchSearch =
			!searchQuery.trim() ||
			img.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
			img.key.toLowerCase().includes(searchQuery.trim().toLowerCase());
		return matchExt && matchSearch;
	}),
);

const totalBytes = $derived(images.reduce((acc, cur) => acc + (cur.size || 0), 0));

async function fetchImages() {
	loading = true;
	try {
		const res = await fetch("/api/imagebed/list");
		const data = await res.json();
		if (data.ok && Array.isArray(data.data)) {
			images = data.data;
		}
	} catch (e) {
		console.error("Failed to load imagebed list:", e);
	} finally {
		loading = false;
	}
}

async function uploadFiles(files: FileList | File[]) {
	if (!files || files.length === 0) return;
	uploading = true;
	uploadMessage = `正在上传 ${files.length} 个文件...`;

	const uploadedItems: ImageItem[] = [];
	let failureCount = 0;

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		uploadMessage = `正在上传 (${i + 1}/${files.length}): ${file.name}`;

		const form = new FormData();
		form.append("file", file);
		form.append("folder", "photos/upload");

		const headers: Record<string, string> = {};
		if (token.trim()) {
			headers["x-imagebed-token"] = token.trim();
		}

		try {
			const res = await fetch("/api/imagebed/upload", {
				method: "POST",
				headers,
				body: form,
			});

			const json = await res.json();
			if (res.ok && json.ok && json.data) {
				uploadedItems.push({
					key: json.data.key,
					url: json.data.url,
					name: json.data.name,
					size: json.data.size,
					ext: json.data.url.split(".").pop()?.toLowerCase() || "webp",
					time: json.data.time || Date.now(),
				});
			} else {
				failureCount++;
				console.error("Upload failed for file:", file.name, json.error);
			}
		} catch (e) {
			failureCount++;
			console.error("Upload network error:", e);
		}
	}

	if (uploadedItems.length > 0) {
		images = [...uploadedItems, ...images];
		uploadMessage = `成功上传 ${uploadedItems.length} 张图片！` + (failureCount > 0 ? ` (${failureCount} 失败)` : "");
	} else if (failureCount > 0) {
		uploadMessage = "上传失败，请检查文件类型（仅限图片）或上传密钥！";
	}

	setTimeout(() => {
		uploading = false;
		uploadMessage = "";
	}, 4000);
}

function handleFileSelect(e: Event) {
	const target = e.target as HTMLInputElement;
	if (target.files) {
		uploadFiles(target.files);
		target.value = "";
	}
}

function handlePaste(e: ClipboardEvent) {
	const items = e.clipboardData?.items;
	if (!items) return;

	const imageFiles: File[] = [];
	for (let i = 0; i < items.length; i++) {
		if (items[i].type.startsWith("image/")) {
			const file = items[i].getAsFile();
			if (file) imageFiles.push(file);
		}
	}

	if (imageFiles.length > 0) {
		uploadFiles(imageFiles);
	}
}

async function copyText(text: string, type: string) {
	try {
		await navigator.clipboard.writeText(text);
		copiedType = type;
		setTimeout(() => {
			if (copiedType === type) copiedType = null;
		}, 2000);
	} catch (e) {
		console.error("Copy failed:", e);
	}
}

async function deleteImage(item: ImageItem, e?: Event) {
	if (e) e.stopPropagation();
	if (!confirm(`确定从 EdgeOne Blob 中彻底删除图片 [${item.name}] 吗？`)) return;

	try {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (token.trim()) {
			headers["x-imagebed-token"] = token.trim();
		}

		const res = await fetch("/api/imagebed/delete", {
			method: "POST",
			headers,
			body: JSON.stringify({ key: item.key }),
		});

		const json = await res.json();
		if (res.ok && json.ok) {
			images = images.filter((img) => img.key !== item.key);
			if (selectedImage?.key === item.key) selectedImage = null;
		} else {
			alert("删除失败: " + (json.error || "权限不足"));
		}
	} catch (e) {
		alert("网络错误，删除失败");
	}
}

function saveToken(val: string) {
	token = val;
	if (typeof window !== "undefined") {
		localStorage.setItem("firefly_imagebed_token", val);
	}
	showTokenModal = false;
}

onMount(() => {
	if (typeof window !== "undefined") {
		token = localStorage.getItem("firefly_imagebed_token") || "";
	}
	fetchImages();

	window.addEventListener("paste", handlePaste);
	return () => window.removeEventListener("paste", handlePaste);
});
</script>

<div class="imagebed-container">
	<!-- 顶部控制面板 -->
	<header class="card-base p-6 mb-6">
		<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
			<div class="flex items-center gap-3">
				<div class="w-12 h-12 rounded-2xl bg-(--primary)/10 text-(--primary) flex items-center justify-center text-2xl shadow-inner">
					✦
				</div>
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
						EdgeOne Blob 图床画廊
						<span class="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							BGP 极速加速
						</span>
					</h1>
					<p class="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
						原生托管于腾讯云 EdgeOne Blob 存储，支持拖拽与 Ctrl+V 剪贴板一键上传。
					</p>
				</div>
			</div>

			<!-- 右侧功能按钮组 -->
			<div class="flex items-center gap-2.5 flex-wrap">
				<label class="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-(--primary) hover:opacity-90 shadow-sm transition-all duration-200">
					<span>📤 上传图片</span>
					<input type="file" multiple accept="image/*" class="hidden" onchange={handleFileSelect} />
				</label>

				<button
					onclick={() => (showTokenModal = true)}
					class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all duration-200"
				>
					<span>🔑 密钥设置</span>
					{#if token}
						<span class="w-2 h-2 rounded-full bg-emerald-500"></span>
					{/if}
				</button>

				<a
					href="/gallery/"
					class="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all duration-200"
				>
					<span>相册集 →</span>
				</a>
			</div>
		</div>

		<!-- 统计栏与拖拽上传区 -->
		<div
			class="dropzone relative rounded-2xl border-2 border-dashed border-(--line-divider) hover:border-(--primary) bg-neutral-50/50 dark:bg-neutral-900/40 p-6 text-center transition-all duration-200 cursor-pointer"
			class:dragover={isDraggingOver}
			ondragover={(e) => { e.preventDefault(); isDraggingOver = true; }}
			ondragleave={() => { isDraggingOver = false; }}
			ondrop={(e) => {
				e.preventDefault();
				isDraggingOver = false;
				if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files);
			}}
			role="region"
			aria-label="图片上传拖拽区"
		>
			<input type="file" multiple accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onchange={handleFileSelect} />
			<div class="pointer-events-none flex flex-col items-center justify-center">
				<div class="text-3xl mb-2 text-(--primary) opacity-80">☁️</div>
				<div class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
					点击选择图片，或将图片文件拖放到这里
				</div>
				<div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
					支持 JPEG、PNG、WebP、AVIF、GIF 等格式 · 页面内可直接按 Ctrl+V 快速粘贴上传
				</div>
			</div>

			{#if uploading}
				<div class="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-(--primary)/15 text-(--primary) animate-pulse">
					<span>⏳ {uploadMessage}</span>
				</div>
			{:else if uploadMessage}
				<div class="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
					<span>✓ {uploadMessage}</span>
				</div>
			{/if}
		</div>

		<!-- 过滤筛选与搜索栏 -->
		<div class="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-(--line-divider)">
			<!-- 分类格式筛选 -->
			<div class="flex items-center gap-1.5 flex-wrap">
				{#each exts as ext}
					<button
						onclick={() => (selectedExt = ext)}
						class="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200"
						class:active-chip={selectedExt === ext}
						class:inactive-chip={selectedExt !== ext}
					>
						{ext === "all" ? "全部图片" : ext.toUpperCase()}
					</button>
				{/each}
			</div>

			<!-- 搜索与计数 -->
			<div class="flex items-center gap-3">
				<span class="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
					共 {filteredImages.length} 张 ({formatSize(totalBytes)})
				</span>
				<div class="relative w-44 sm:w-56">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="搜索图片名称..."
						class="w-full pl-3 pr-3 py-1.5 rounded-lg border border-(--line-divider) bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 text-xs focus:border-(--primary) focus:ring-1 focus:ring-(--primary) outline-none transition-all"
					/>
				</div>
			</div>
		</div>
	</header>

	<!-- 流水瀑布流展示区 (Masonry Waterfall Grid) -->
	{#if loading}
		<div class="card-base py-20 flex flex-col items-center justify-center text-neutral-400">
			<div class="animate-spin text-3xl mb-3">⟳</div>
			<p class="text-sm">正在加载 EdgeOne Blob 图床流...</p>
		</div>
	{:else if filteredImages.length === 0}
		<div class="card-base py-20 flex flex-col items-center justify-center text-neutral-400">
			<div class="text-5xl mb-3 opacity-40">🖼️</div>
			<p class="text-base font-medium">暂无符合条件的图片</p>
			<p class="text-xs text-neutral-500 mt-1">拖拽图片或使用 Ctrl+V 开始上传第一张照片吧</p>
		</div>
	{:else}
		<div class="waterfall-grid">
			{#each filteredImages as item (item.key)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="waterfall-card card-base group relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 mb-4 break-inside-avoid"
					onclick={() => (selectedImage = item)}
				>
					<!-- 图片容器 -->
					<div class="relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
						<img
							src={item.url}
							alt={item.name}
							loading="lazy"
							class="w-full h-auto object-cover transition-transform duration-500 ease-out group-hover:scale-105"
						/>

						<!-- 悬浮操作覆盖层 -->
						<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
							<div class="flex items-center justify-between text-xs text-white/90">
								<span class="px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm uppercase font-mono text-[10px]">
									{item.ext}
								</span>
								<span class="px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm text-[10px]">
									{formatSize(item.size)}
								</span>
							</div>

							<div>
								<div class="text-xs font-medium text-white truncate drop-shadow-md mb-2">
									{item.name}
								</div>
								<div class="flex items-center gap-1.5" onclick={(e) => e.stopPropagation()}>
									<button
										type="button"
										onclick={() => copyText(fullUrl(item.url), "url_" + item.key)}
										class="px-2 py-1 rounded bg-white/20 hover:bg-white/35 backdrop-blur-sm text-white text-[11px] font-medium transition-colors"
									>
										{copiedType === "url_" + item.key ? "✓ 已复制直链" : "直链"}
									</button>
									<button
										type="button"
										onclick={() => copyText(`![${item.name}](${fullUrl(item.url)})`, "md_" + item.key)}
										class="px-2 py-1 rounded bg-white/20 hover:bg-white/35 backdrop-blur-sm text-white text-[11px] font-medium transition-colors"
									>
										{copiedType === "md_" + item.key ? "✓ 已复制MD" : "Markdown"}
									</button>
									{#if token}
										<button
											type="button"
											onclick={(e) => deleteImage(item, e)}
											class="ml-auto p-1 rounded bg-red-500/40 hover:bg-red-500/70 text-white text-xs transition-colors"
											title="删除"
										>
											🗑
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Lightbox 详情弹窗 -->
{#if selectedImage}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
		onclick={() => (selectedImage = null)}
	>
		<div
			class="relative max-w-4xl w-full bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- 头部 -->
			<div class="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
				<div class="text-sm font-semibold text-neutral-200 truncate pr-4">
					{selectedImage.name}
				</div>
				<button
					onclick={() => (selectedImage = null)}
					class="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center transition-colors"
				>
					✕
				</button>
			</div>

			<!-- 大图展示 -->
			<div class="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40 min-h-[300px]">
				<img
					src={selectedImage.url}
					alt={selectedImage.name}
					class="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md"
				/>
			</div>

			<!-- 外链与信息操作栏 -->
			<div class="p-5 bg-neutral-900/90 border-t border-neutral-800 space-y-3">
				<div class="flex items-center gap-4 text-xs text-neutral-400 flex-wrap">
					<span>大小: <strong class="text-neutral-200">{formatSize(selectedImage.size)}</strong></span>
					<span>格式: <strong class="text-neutral-200 uppercase">{selectedImage.ext}</strong></span>
					<span>存储路径: <code class="text-neutral-300 font-mono text-[11px] bg-neutral-800 px-1.5 py-0.5 rounded">{selectedImage.key}</code></span>
				</div>

				<!-- 快捷复制按钮组 -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
					<div class="flex items-center bg-neutral-800 rounded-lg p-1.5 pr-2">
						<span class="text-neutral-400 font-mono text-[10px] w-14 shrink-0 px-1">URL</span>
						<input readonly value={fullUrl(selectedImage.url)} class="bg-transparent text-neutral-200 w-full text-xs font-mono outline-none" />
						<button
							onclick={() => copyText(fullUrl(selectedImage!.url), "modal_url")}
							class="ml-2 px-2.5 py-1 rounded bg-(--primary) text-white font-medium text-[11px] hover:opacity-90 shrink-0"
						>
							{copiedType === "modal_url" ? "已复制" : "复制"}
						</button>
					</div>

					<div class="flex items-center bg-neutral-800 rounded-lg p-1.5 pr-2">
						<span class="text-neutral-400 font-mono text-[10px] w-14 shrink-0 px-1">Markdown</span>
						<input readonly value={`![${selectedImage.name}](${fullUrl(selectedImage.url)})`} class="bg-transparent text-neutral-200 w-full text-xs font-mono outline-none" />
						<button
							onclick={() => copyText(`![${selectedImage!.name}](${fullUrl(selectedImage!.url)})`, "modal_md")}
							class="ml-2 px-2.5 py-1 rounded bg-(--primary) text-white font-medium text-[11px] hover:opacity-90 shrink-0"
						>
							{copiedType === "modal_md" ? "已复制" : "复制"}
						</button>
					</div>

					<div class="flex items-center bg-neutral-800 rounded-lg p-1.5 pr-2">
						<span class="text-neutral-400 font-mono text-[10px] w-14 shrink-0 px-1">HTML</span>
						<input readonly value={`<img src="${fullUrl(selectedImage.url)}" alt="${selectedImage.name}" />`} class="bg-transparent text-neutral-200 w-full text-xs font-mono outline-none" />
						<button
							onclick={() => copyText(`<img src="${fullUrl(selectedImage!.url)}" alt="${selectedImage!.name}" />`, "modal_html")}
							class="ml-2 px-2.5 py-1 rounded bg-(--primary) text-white font-medium text-[11px] hover:opacity-90 shrink-0"
						>
							{copiedType === "modal_html" ? "已复制" : "复制"}
						</button>
					</div>

					<div class="flex items-center bg-neutral-800 rounded-lg p-1.5 pr-2">
						<span class="text-neutral-400 font-mono text-[10px] w-14 shrink-0 px-1">BBCode</span>
						<input readonly value={`[img]${fullUrl(selectedImage.url)}[/img]`} class="bg-transparent text-neutral-200 w-full text-xs font-mono outline-none" />
						<button
							onclick={() => copyText(`[img]${fullUrl(selectedImage!.url)}[/img]`, "modal_bb")}
							class="ml-2 px-2.5 py-1 rounded bg-(--primary) text-white font-medium text-[11px] hover:opacity-90 shrink-0"
						>
							{copiedType === "modal_bb" ? "已复制" : "复制"}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- 上传密钥设置弹窗 -->
{#if showTokenModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
		onclick={() => (showTokenModal = false)}
	>
		<div
			class="card-base max-w-md w-full p-6 shadow-2xl relative"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">
				图床上传密钥设置
			</h3>
			<p class="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
				如果 EdgeOne 环境变量配置了 <code>FIREFLY_IMAGEBED_TOKEN</code> 或管理员密码，请在此输入对应的上传 Token。密钥将加密保存在你的浏览器本地。
			</p>

			<input
				type="password"
				value={token}
				id="token_input"
				placeholder="输入上传密钥 Token / 管理员密码..."
				class="w-full px-3.5 py-2.5 rounded-xl border border-(--line-divider) bg-transparent text-neutral-900 dark:text-neutral-100 text-sm focus:border-(--primary) focus:ring-1 focus:ring-(--primary) outline-none transition-all mb-4"
			/>

			<div class="flex items-center justify-end gap-2.5">
				<button
					onclick={() => saveToken("")}
					class="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
				>
					清空密钥
				</button>
				<button
					onclick={() => {
						const input = document.getElementById("token_input") as HTMLInputElement;
						saveToken(input?.value || "");
					}}
					class="px-4 py-2 rounded-xl text-xs font-medium text-white bg-(--primary) hover:opacity-90 transition-opacity"
				>
					保存并生效
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.imagebed-container {
		width: 100%;
	}

	.active-chip {
		background-color: var(--primary);
		color: #ffffff;
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
	}

	.inactive-chip {
		background-color: rgba(120, 120, 120, 0.1);
		color: inherit;
		opacity: 0.8;
	}

	.inactive-chip:hover {
		opacity: 1;
		background-color: rgba(120, 120, 120, 0.18);
	}

	.dropzone.dragover {
		border-color: var(--primary);
		background-color: rgba(var(--primary-rgb, 99, 102, 241), 0.1);
		transform: scale(1.01);
	}

	/* 流水瀑布流布局 (Masonry) */
	.waterfall-grid {
		column-count: 2;
		column-gap: 1rem;
	}

	@media (min-width: 640px) {
		.waterfall-grid {
			column-count: 3;
		}
	}

	@media (min-width: 1024px) {
		.waterfall-grid {
			column-count: 4;
		}
	}

	@media (min-width: 1280px) {
		.waterfall-grid {
			column-count: 4;
		}
	}

	.waterfall-card {
		break-inside: avoid;
	}
</style>
