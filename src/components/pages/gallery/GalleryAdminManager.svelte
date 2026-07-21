<script lang="ts">
import { onMount } from "svelte";
import type {
	GalleryAdminState,
	GalleryManifest,
	ManagedGalleryAlbum,
	ManagedGalleryPhoto,
} from "@/types/galleryAdmin";
import {
	GITHUB_SESSION_CHANGED_EVENT,
	type GitHubAdminSession,
	getGitHubAdminSession,
} from "@/utils/admin/github-session";
import {
	deleteImageBedAlbum,
	deleteImageBedFile,
	fetchGalleryAdminState,
	renameImageBedAlbum,
	renameImageBedFile,
	saveGalleryManifest,
	uploadImageBedFile,
} from "@/utils/admin/imagebed-client";

let session = $state<GitHubAdminSession | null>(null);
let state = $state<GalleryAdminState | null>(null);
let manifest = $state<GalleryManifest>({
	version: 1,
	updatedAt: "",
	albums: [],
});
let selectedId = $state("");
let loading = $state(false);
let saving = $state(false);
let uploading = $state(false);
let dirty = $state(false);
let errorMessage = $state("");
let successMessage = $state("");
let draggedAlbumId = $state("");
let draggedPhotoKey = $state("");

const selectedAlbum = $derived(
	manifest.albums.find((album) => album.id === selectedId) || null,
);
const selectedPhotos = $derived(
	state?.albums.find((album) => album.id === selectedId)?.photos || [],
);
const orderedPhotos = $derived.by(() => {
	if (!selectedAlbum) return selectedPhotos;
	const order = new Map(
		selectedAlbum.photoOrder.map((key, index) => [key, index]),
	);
	return [...selectedPhotos].sort(
		(left, right) =>
			(order.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
			(order.get(right.key) ?? Number.MAX_SAFE_INTEGER),
	);
});

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_-]/g, "")
		.replace(/-+/g, "-")
		.slice(0, 64);
}

function cloneManifest(value: GalleryManifest): GalleryManifest {
	return JSON.parse(JSON.stringify(value)) as GalleryManifest;
}

function setMessage(message: string, error = false) {
	if (error) {
		errorMessage = message;
		successMessage = "";
	} else {
		successMessage = message;
		errorMessage = "";
	}
}

function updateAlbum(patch: Partial<ManagedGalleryAlbum>) {
	if (!selectedAlbum) return;
	manifest.albums = manifest.albums.map((album) =>
		album.id === selectedAlbum.id ? { ...album, ...patch } : album,
	);
	dirty = true;
}

function updateAlbumId(value: string) {
	if (!selectedAlbum) return;
	const previousId = selectedAlbum.id;
	const nextId = slugify(value);
	manifest.albums = manifest.albums.map((album) =>
		album.id === previousId ? { ...album, id: nextId } : album,
	);
	selectedId = nextId;
	dirty = true;
}

async function refreshRemoteStatePreservingManifest() {
	const localManifest = cloneManifest(manifest);
	state = await fetchGalleryAdminState();
	manifest = localManifest;
}

async function loadState(preferredId = selectedId) {
	if (!session) {
		state = null;
		manifest = { version: 1, updatedAt: "", albums: [] };
		return;
	}
	loading = true;
	errorMessage = "";
	try {
		state = await fetchGalleryAdminState();
		manifest = cloneManifest(state.manifest);
		selectedId =
			manifest.albums.find((album) => album.id === preferredId)?.id ||
			manifest.albums[0]?.id ||
			"";
		dirty = false;
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "相册读取失败。", true);
	} finally {
		loading = false;
	}
}

function createAlbum(sourceDir = "") {
	const directoryName = sourceDir.split("/").pop() || "new-album";
	let id = slugify(directoryName) || `album-${Date.now()}`;
	let index = 2;
	while (manifest.albums.some((album) => album.id === id)) {
		id = `${slugify(directoryName) || "album"}-${index++}`;
	}
	manifest.albums = [
		...manifest.albums,
		{
			id,
			sourceDir: sourceDir || `photos/${id}`,
			name: directoryName,
			description: "",
			category: "",
			date: new Date().toISOString().slice(0, 10),
			location: "",
			tags: [],
			cover: "",
			photoOrder: [],
		},
	];
	selectedId = id;
	dirty = true;
	setMessage("已在本地新增相册，上传图片并保存后公开页即可显示。");
}

function moveAlbum(id: string, offset: number) {
	const index = manifest.albums.findIndex((album) => album.id === id);
	const target = index + offset;
	if (index < 0 || target < 0 || target >= manifest.albums.length) return;
	const albums = [...manifest.albums];
	[albums[index], albums[target]] = [albums[target], albums[index]];
	manifest.albums = albums;
	dirty = true;
}

function dropAlbum(targetId: string) {
	if (!draggedAlbumId || draggedAlbumId === targetId) return;
	const albums = [...manifest.albums];
	const from = albums.findIndex((album) => album.id === draggedAlbumId);
	const to = albums.findIndex((album) => album.id === targetId);
	if (from < 0 || to < 0) return;
	const [moved] = albums.splice(from, 1);
	albums.splice(to, 0, moved);
	manifest.albums = albums;
	draggedAlbumId = "";
	dirty = true;
}

function movePhoto(key: string, offset: number) {
	if (!selectedAlbum) return;
	const keys = orderedPhotos.map((photo) => photo.key);
	const index = keys.indexOf(key);
	const target = index + offset;
	if (index < 0 || target < 0 || target >= keys.length) return;
	[keys[index], keys[target]] = [keys[target], keys[index]];
	updateAlbum({ photoOrder: keys });
}

function dropPhoto(targetKey: string) {
	if (!selectedAlbum || !draggedPhotoKey || draggedPhotoKey === targetKey)
		return;
	const keys = orderedPhotos.map((photo) => photo.key);
	const from = keys.indexOf(draggedPhotoKey);
	const to = keys.indexOf(targetKey);
	if (from < 0 || to < 0) return;
	const [moved] = keys.splice(from, 1);
	keys.splice(to, 0, moved);
	updateAlbum({ photoOrder: keys });
	draggedPhotoKey = "";
}

async function saveAll() {
	saving = true;
	errorMessage = "";
	try {
		const saved = await saveGalleryManifest(manifest);
		manifest = cloneManifest(saved);
		dirty = false;
		setMessage("相册元数据和排序已保存到图床，公开页将在约 60 秒内更新。");
		await loadState(selectedId);
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "相册保存失败。", true);
	} finally {
		saving = false;
	}
}

async function uploadFiles(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const files = Array.from(input.files || []);
	if (!selectedAlbum || files.length === 0) return;
	uploading = true;
	errorMessage = "";
	try {
		const uploaded: ManagedGalleryPhoto[] = [];
		for (const file of files) {
			uploaded.push(await uploadImageBedFile(file, selectedAlbum.sourceDir));
		}
		const originalOrder = [...selectedAlbum.photoOrder];
		const newKeys = uploaded.map((photo) => photo.key);
		await refreshRemoteStatePreservingManifest();
		updateAlbum({
			photoOrder: [
				...originalOrder.filter((key) => !newKeys.includes(key)),
				...newKeys,
			],
		});
		setMessage(
			`已上传 ${uploaded.length} 张图片，点击“保存更改”写入展示顺序。`,
		);
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "图片上传失败。", true);
	} finally {
		uploading = false;
		input.value = "";
	}
}

async function removePhoto(photo: ManagedGalleryPhoto) {
	if (
		!selectedAlbum ||
		!confirm(`确定删除 ${photo.name}？图床原文件会被永久删除。`)
	)
		return;
	try {
		await deleteImageBedFile(photo.key);
		const nextOrder = selectedAlbum.photoOrder.filter(
			(key) => key !== photo.key,
		);
		const nextCover =
			selectedAlbum.cover === photo.key
				? nextOrder[0] || ""
				: selectedAlbum.cover;
		await refreshRemoteStatePreservingManifest();
		updateAlbum({ photoOrder: nextOrder, cover: nextCover });
		setMessage("图片已从图床删除；请保存相册清单。");
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "图片删除失败。", true);
	}
}

async function renamePhoto(photo: ManagedGalleryPhoto) {
	if (!selectedAlbum) return;
	const nextName = prompt("输入新文件名", photo.name)?.trim();
	if (!nextName || nextName === photo.name || nextName.includes("/")) return;
	const newKey = `${selectedAlbum.sourceDir}/${nextName}`;
	try {
		const result = await renameImageBedFile(photo.key, newKey);
		const nextOrder = selectedAlbum.photoOrder.map((key) =>
			key === photo.key ? result.newKey : key,
		);
		const nextCover =
			selectedAlbum.cover === photo.key ? result.newKey : selectedAlbum.cover;
		await refreshRemoteStatePreservingManifest();
		updateAlbum({ photoOrder: nextOrder, cover: nextCover });
		setMessage("图片已重命名；请保存相册清单。");
	} catch (error) {
		setMessage(
			error instanceof Error ? error.message : "图片重命名失败。",
			true,
		);
	}
}

async function renameDirectory() {
	if (!selectedAlbum) return;
	const current = selectedAlbum.sourceDir;
	const value = prompt(
		"输入 photos/ 下的新目录名",
		current.slice("photos/".length),
	)?.trim();
	if (!value || value.includes("/") || `photos/${value}` === current) return;
	const nextDir = `photos/${value}`;
	try {
		const moved = await renameImageBedAlbum(current, nextDir);
		const nextOrder = selectedAlbum.photoOrder.map(
			(key) => moved[key] || `${nextDir}/${key.slice(current.length + 1)}`,
		);
		const nextCover = selectedAlbum.cover
			? moved[selectedAlbum.cover] ||
				`${nextDir}/${selectedAlbum.cover.slice(current.length + 1)}`
			: "";
		updateAlbum({
			sourceDir: nextDir,
			photoOrder: nextOrder,
			cover: nextCover,
		});
		const saved = await saveGalleryManifest(manifest);
		manifest = cloneManifest(saved);
		await loadState(selectedId);
		setMessage("图床目录和相册清单已同步重命名。");
	} catch (error) {
		setMessage(
			error instanceof Error ? error.message : "目录重命名失败。",
			true,
		);
	}
}

async function removeAlbum() {
	if (!selectedAlbum) return;
	const album = selectedAlbum;
	if (!confirm(`确定移除相册“${album.name}”？`)) return;
	const deleteFiles = confirm(
		"同时永久删除图床目录内的全部图片？\n选择“取消”只移除公开相册记录。",
	);
	try {
		if (deleteFiles) await deleteImageBedAlbum(album.sourceDir);
		manifest.albums = manifest.albums.filter((item) => item.id !== album.id);
		selectedId = manifest.albums[0]?.id || "";
		dirty = true;
		setMessage("相册已从本地清单移除，点击“保存更改”生效。");
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "相册删除失败。", true);
	}
}

function syncSession() {
	session = getGitHubAdminSession();
	void loadState();
}

onMount(() => {
	syncSession();
	window.addEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
	return () =>
		window.removeEventListener(GITHUB_SESSION_CHANGED_EVENT, syncSession);
});
</script>

{#if !session}
	<div class="admin-notice card-base">
		请先使用网页右上角的 GitHub 登录按钮验证管理账号。图床 Token 只保存在服务端，不会发送到浏览器。
	</div>
{:else}
	<div class="admin-toolbar card-base">
		<div>
			<strong>图床相册</strong>
			<span>{manifest.albums.length} 个相册 · 拖动后统一保存，不触发博客构建</span>
		</div>
		<div class="toolbar-actions">
			<button type="button" onclick={() => loadState()} disabled={loading || saving}>刷新</button>
			<button type="button" onclick={() => createAlbum()} disabled={loading || saving}>新建相册</button>
			<button class="primary" type="button" onclick={saveAll} disabled={!dirty || loading || saving}>
				{saving ? "保存中..." : "保存更改"}
			</button>
		</div>
	</div>

	{#if errorMessage}<div class="message error">{errorMessage}</div>{/if}
	{#if successMessage}<div class="message success">{successMessage}</div>{/if}

	{#if state?.unmappedDirectories.length}
		<div class="unmapped card-base">
			<strong>发现未纳入网站的图床目录</strong>
			<div>
				{#each state.unmappedDirectories as directory}
					<button type="button" onclick={() => createAlbum(directory)}>+ {directory}</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="admin-layout">
		<aside class="album-panel card-base">
			<div class="panel-title">相册顺序</div>
			{#if loading}
				<div class="empty">正在读取图床...</div>
			{:else if manifest.albums.length === 0}
				<div class="empty">暂无相册</div>
			{:else}
				<div class="album-list">
					{#each manifest.albums as album, index (album.id)}
						<div
							class:selected={album.id === selectedId}
							class="album-row"
							draggable="true"
							ondragstart={() => (draggedAlbumId = album.id)}
							ondragover={(event) => event.preventDefault()}
							ondrop={() => dropAlbum(album.id)}
						>
							<button class="album-select" type="button" onclick={() => (selectedId = album.id)}>
								<span>{album.name}</span>
								<small>{album.sourceDir}</small>
							</button>
							<div class="order-actions">
								<button title="上移" aria-label="上移" type="button" onclick={() => moveAlbum(album.id, -1)} disabled={index === 0}>↑</button>
								<button title="下移" aria-label="下移" type="button" onclick={() => moveAlbum(album.id, 1)} disabled={index === manifest.albums.length - 1}>↓</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</aside>

		<main class="editor-panel card-base">
			{#if selectedAlbum}
				<div class="editor-heading">
					<div>
						<h2>{selectedAlbum.name}</h2>
						<p>{selectedAlbum.sourceDir}</p>
					</div>
					<div class="toolbar-actions">
						<button type="button" onclick={renameDirectory}>重命名目录</button>
						<button class="danger" type="button" onclick={removeAlbum}>删除相册</button>
					</div>
				</div>

				<div class="metadata-grid">
					<label><span>网站 Slug</span><input value={selectedAlbum.id} oninput={(event) => updateAlbumId(event.currentTarget.value)} /></label>
					<label><span>图床目录</span><input value={selectedAlbum.sourceDir} readonly /></label>
					<label><span>相册名称</span><input value={selectedAlbum.name} oninput={(event) => updateAlbum({ name: event.currentTarget.value })} /></label>
					<label><span>分类</span><input value={selectedAlbum.category || ""} oninput={(event) => updateAlbum({ category: event.currentTarget.value })} /></label>
					<label><span>日期</span><input type="date" value={selectedAlbum.date || ""} oninput={(event) => updateAlbum({ date: event.currentTarget.value })} /></label>
					<label><span>地点</span><input value={selectedAlbum.location || ""} oninput={(event) => updateAlbum({ location: event.currentTarget.value })} /></label>
					<label class="wide"><span>标签（逗号分隔）</span><input value={(selectedAlbum.tags || []).join(", ")} oninput={(event) => updateAlbum({ tags: event.currentTarget.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })} /></label>
					<label class="wide"><span>描述</span><textarea rows="3" value={selectedAlbum.description || ""} oninput={(event) => updateAlbum({ description: event.currentTarget.value })}></textarea></label>
				</div>

				<div class="photo-toolbar">
					<div>
						<strong>图片顺序</strong>
						<span>{orderedPhotos.length} 张 · 拖动图片调整顺序</span>
					</div>
					<label class="upload-button">
						{uploading ? "上传中..." : "批量上传"}
						<input type="file" accept="image/*" multiple disabled={uploading} onchange={uploadFiles} />
					</label>
				</div>

				{#if orderedPhotos.length === 0}
					<div class="empty photo-empty">这个目录还没有图片。</div>
				{:else}
					<div class="photo-grid">
						{#each orderedPhotos as photo, index (photo.key)}
							<article
								class:cover={selectedAlbum.cover === photo.key}
								class="photo-item"
								draggable="true"
								ondragstart={() => (draggedPhotoKey = photo.key)}
								ondragover={(event) => event.preventDefault()}
								ondrop={() => dropPhoto(photo.key)}
							>
								<div class="photo-preview"><img src={photo.url} alt={photo.name} loading="lazy" /></div>
								<div class="photo-name" title={photo.key}>{photo.name}</div>
								<div class="photo-actions">
									<button type="button" onclick={() => updateAlbum({ cover: photo.key })}>{selectedAlbum.cover === photo.key ? "封面" : "设封面"}</button>
									<button title="前移" aria-label="前移" type="button" onclick={() => movePhoto(photo.key, -1)} disabled={index === 0}>↑</button>
									<button title="后移" aria-label="后移" type="button" onclick={() => movePhoto(photo.key, 1)} disabled={index === orderedPhotos.length - 1}>↓</button>
									<button type="button" onclick={() => renamePhoto(photo)}>重命名</button>
									<button class="danger" type="button" onclick={() => removePhoto(photo)}>删除</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="empty">选择或新建一个相册。</div>
			{/if}
		</main>
	</div>
{/if}

<style>
	:global(*) { box-sizing: border-box; }
	button, input, textarea { font: inherit; color: inherit; }
	button { cursor: pointer; }
	button:disabled { cursor: not-allowed; opacity: 0.45; }
	.admin-notice, .admin-toolbar, .unmapped, .album-panel, .editor-panel { border: 1px solid var(--line-divider); }
	.admin-notice { padding: 1rem; font-size: 0.88rem; line-height: 1.65; }
	.admin-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; margin-bottom: 0.75rem; }
	.admin-toolbar > div:first-child, .photo-toolbar > div { display: grid; gap: 0.16rem; }
	.admin-toolbar span, .photo-toolbar span { font-size: 0.75rem; opacity: 0.6; }
	.toolbar-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; justify-content: flex-end; }
	button, .upload-button { min-height: 2.25rem; padding: 0.45rem 0.7rem; border: 1px solid var(--line-divider); border-radius: 0.4rem; background: transparent; }
	button:hover, .upload-button:hover { background: var(--btn-plain-bg-hover); }
	button.primary { border-color: transparent; background: var(--primary); color: white; font-weight: 700; }
	button.danger { color: #c43d3d; }
	.message { margin: 0.75rem 0; padding: 0.7rem 0.85rem; border-radius: 0.4rem; font-size: 0.82rem; }
	.message.error { border: 1px solid rgb(196 61 61 / 0.3); background: rgb(196 61 61 / 0.08); color: #c43d3d; }
	.message.success { border: 1px solid rgb(35 139 82 / 0.25); background: rgb(35 139 82 / 0.08); color: #238b52; }
	.unmapped { padding: 0.8rem 1rem; margin-bottom: 0.75rem; }
	.unmapped > div { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-top: 0.55rem; }
	.admin-layout { display: grid; grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr); gap: 0.8rem; align-items: start; }
	.album-panel, .editor-panel { padding: 0.85rem; min-width: 0; }
	.panel-title { padding: 0.1rem 0.25rem 0.7rem; font-weight: 800; }
	.album-list { display: grid; gap: 0.4rem; }
	.album-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border: 1px solid var(--line-divider); border-radius: 0.4rem; overflow: hidden; }
	.album-row.selected { border-color: var(--primary); background: color-mix(in oklab, var(--primary) 8%, transparent); }
	.album-select { display: grid; justify-items: start; gap: 0.15rem; border: 0; border-radius: 0; min-width: 0; text-align: left; }
	.album-select span, .album-select small { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.album-select small { font-size: 0.68rem; opacity: 0.55; }
	.order-actions { display: grid; grid-template-columns: 1fr 1fr; padding-right: 0.3rem; }
	.order-actions button { width: 1.8rem; min-height: 1.8rem; padding: 0; }
	.editor-heading, .photo-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; }
	.editor-heading h2 { margin: 0; font-size: 1.15rem; }
	.editor-heading p { margin: 0.2rem 0 0; font-size: 0.72rem; opacity: 0.55; }
	.metadata-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin: 1rem 0 1.2rem; }
	.metadata-grid label { display: grid; gap: 0.35rem; min-width: 0; }
	.metadata-grid label.wide { grid-column: 1 / -1; }
	.metadata-grid span { font-size: 0.75rem; font-weight: 700; }
	input, textarea { width: 100%; border: 1px solid var(--line-divider); border-radius: 0.4rem; padding: 0.6rem 0.7rem; background: color-mix(in oklab, var(--card-bg) 95%, transparent); }
	input[readonly] { opacity: 0.62; }
	.photo-toolbar { padding-top: 1rem; border-top: 1px solid var(--line-divider); }
	.upload-button { display: inline-flex; align-items: center; font-weight: 700; white-space: nowrap; }
	.upload-button input { display: none; }
	.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.65rem; margin-top: 0.8rem; }
	.photo-item { min-width: 0; border: 1px solid var(--line-divider); border-radius: 0.45rem; overflow: hidden; background: color-mix(in oklab, var(--card-bg) 96%, transparent); }
	.photo-item.cover { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
	.photo-preview { aspect-ratio: 4 / 3; overflow: hidden; background: rgb(127 127 127 / 0.1); }
	.photo-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.photo-name { padding: 0.45rem 0.5rem 0.2rem; font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.photo-actions { display: flex; gap: 0.25rem; padding: 0.3rem 0.4rem 0.5rem; flex-wrap: wrap; }
	.photo-actions button { min-height: 1.75rem; padding: 0.25rem 0.4rem; font-size: 0.66rem; }
	.empty { padding: 2rem 0.6rem; text-align: center; font-size: 0.82rem; opacity: 0.55; }
	.photo-empty { border: 1px dashed var(--line-divider); margin-top: 0.8rem; border-radius: 0.4rem; }
	@media (max-width: 800px) {
		.admin-toolbar, .editor-heading, .photo-toolbar { align-items: flex-start; flex-direction: column; }
		.toolbar-actions { justify-content: flex-start; }
		.admin-layout { grid-template-columns: 1fr; }
		.album-list { grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
		.metadata-grid { grid-template-columns: 1fr; }
		.metadata-grid label.wide { grid-column: auto; }
		.photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
</style>
