import { galleryManagedSeed } from "../src/config/galleryManagedSeed";
import type {
	GalleryAdminState,
	GalleryManifest,
	ManagedGalleryAlbum,
	ManagedGalleryPhoto,
	PublicGalleryAlbum,
} from "../src/types/galleryAdmin";

type GalleryManifestStore = {
	get(key: string, type: "json"): Promise<unknown>;
	put(key: string, value: string): Promise<void>;
};

type Env = {
	ASSETS?: { fetch(request: Request): Promise<Response> };
	GALLERY_MANIFEST?: GalleryManifestStore;
	IMAGEBED_TOKEN?: string;
	IMAGEBED_BASE_URL?: string;
	IMAGE_PUBLIC_BASE_URL?: string;
	GITHUB_ADMIN_LOGIN?: string;
	GITHUB_REPO?: string;
	FIREFLY_ADMIN_SERVICE_SECRET?: string;
	ALLOWED_ORIGIN?: string;
};

type ImageBedFile = {
	name?: string;
	metadata?: Record<string, unknown>;
};

type ImageBedList = {
	files?: ImageBedFile[];
	directories?: string[];
};

const IMAGE_EXTENSIONS = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const MANIFEST_DIR = "photos/.firefly-gallery";
const MANIFEST_KV_KEY = "gallery-manifest:v1";
const MANIFEST_VERSION = 1;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const AUTH_CACHE_MS = 5 * 60 * 1000;
const GALLERY_CACHE_MS = 10 * 1000;

const authCache = new Map<string, number>();
let galleryCache: { expiresAt: number; state: GalleryAdminState } | null = null;
let manifestCache: { expiresAt: number; manifest: GalleryManifest } | null =
	null;

function json(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "same-origin");
	return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(message: string, status: number): Response {
	return json({ error: message }, { status });
}

function isAllowedOrigin(request: Request, env: Env): boolean {
	const origin = request.headers.get("Origin");
	return !origin || origin === (env.ALLOWED_ORIGIN || "https://blog.casto.top");
}

function withCors(response: Response, request: Request, env: Env): Response {
	const origin = request.headers.get("Origin");
	if (!origin || !isAllowedOrigin(request, env)) return response;
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
	headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
	headers.set("Access-Control-Max-Age", "86400");
	headers.append("Vary", "Origin");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function imageBedBaseUrl(env: Env): string {
	return (env.IMAGEBED_BASE_URL || "https://img.casto.top").replace(/\/+$/, "");
}

function imagePublicBaseUrl(env: Env): string {
	return (env.IMAGE_PUBLIC_BASE_URL || imageBedBaseUrl(env) + "/file").replace(
		/\/+$/,
		"",
	);
}
function publicImageUrl(env: Env, key: string): string {
	return imagePublicBaseUrl(env) + "/" + encodeKey(key);
}
function encodeKey(key: string): string {
	return key.split("/").map(encodeURIComponent).join("/");
}

function cleanPath(value: unknown): string {
	if (typeof value !== "string") return "";
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/\/{2,}/g, "/");
}

function isSafePath(value: string): boolean {
	return (
		!!value &&
		!value.includes("..") &&
		!value.includes("\0") &&
		(value === "blog" ||
			value.startsWith("blog/") ||
			value === "photos" ||
			value.startsWith("photos/"))
	);
}

function isUserAlbumDir(value: string): boolean {
	return (
		/^photos\/[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) && value !== MANIFEST_DIR
	);
}

async function tokenHash(token: string): Promise<string> {
	const bytes = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function trustedAdminService(request:Request,env:Env):Promise<boolean>{
 const supplied=request.headers.get("X-Firefly-Service-Key")||"";
 const configured=env.FIREFLY_ADMIN_SERVICE_SECRET||"";
 if(!configured||configured.length<32||!supplied)return false;
 const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 const [left,right]=await Promise.all([hash(supplied),hash(configured)]);
 let diff=0;
 for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}

async function requireGitHubAdmin(
	request: Request,
	env: Env,
): Promise<Response | null> {
	if(await trustedAdminService(request,env))return null;
	const authorization = request.headers.get("Authorization") || "";
	const token = authorization.startsWith("Bearer ")
		? authorization.slice(7).trim()
		: "";
	if (!token) return errorResponse("需要 GitHub 管理登录。", 401);

	const hash = await tokenHash(token);
	if ((authCache.get(hash) || 0) > Date.now()) return null;

	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"User-Agent": "Firefly-Gallery-Admin",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const userResponse = await fetch("https://api.github.com/user", { headers });
	const user = (await userResponse.json().catch(() => ({}))) as {
		login?: string;
	};
	const allowedLogin = env.GITHUB_ADMIN_LOGIN || "SteveGuo1726";
	if (
		!userResponse.ok ||
		user.login?.toLowerCase() !== allowedLogin.toLowerCase()
	) {
		return errorResponse("GitHub 账号验证失败。", 403);
	}

	const repository = env.GITHUB_REPO || "SteveGuo1726/Firefly";
	const repoResponse = await fetch(
		`https://api.github.com/repos/${repository}`,
		{
			headers,
		},
	);
	const repo = (await repoResponse.json().catch(() => ({}))) as {
		permissions?: { push?: boolean };
	};
	if (!repoResponse.ok || repo.permissions?.push !== true) {
		return errorResponse("GitHub 仓库写入权限验证失败。", 403);
	}

	authCache.set(hash, Date.now() + AUTH_CACHE_MS);
	return null;
}

async function imageBedFetch(
	env: Env,
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	if (!env.IMAGEBED_TOKEN) {
		throw new Error("服务端尚未配置 IMAGEBED_TOKEN。 ");
	}
	const headers = new Headers(init.headers);
	headers.set("Authorization", env.IMAGEBED_TOKEN);
	return fetch(`${imageBedBaseUrl(env)}${path}`, { ...init, headers });
}

async function imageBedJson<T>(
	env: Env,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await imageBedFetch(env, path, init);
	const payload = (await response.json().catch(() => ({}))) as T & {
		error?: string;
		message?: string;
	};
	if (!response.ok) {
		throw new Error(
			payload.message || payload.error || `图床请求失败：${response.status}`,
		);
	}
	return payload;
}

async function listRemoteFiles(
	env: Env,
	dir: string,
	recursive = true,
): Promise<ImageBedList> {
	const search = new URLSearchParams({
		dir,
		count: "-1",
		recursive: String(recursive),
	});
	return imageBedJson<ImageBedList>(
		env,
		`/api/manage/list?${search.toString()}`,
	);
}

function toPhoto(env: Env, file: ImageBedFile): ManagedGalleryPhoto | null {
	const key = cleanPath(file.name);
	if (!isSafePath(key) || !IMAGE_EXTENSIONS.test(key)) return null;
	const metadata = file.metadata || {};
	return {
		key,
		url: publicImageUrl(env, key),
		name: key.split("/").pop() || key,
		size: Number(metadata.FileSizeBytes || 0),
		width: Number(metadata.Width || 0) || undefined,
		height: Number(metadata.Height || 0) || undefined,
		timestamp: Number(metadata.TimeStamp || 0) || undefined,
	};
}

function cloneSeed(): GalleryManifest {
	return JSON.parse(JSON.stringify(galleryManagedSeed)) as GalleryManifest;
}

function normalizeString(value: unknown, maxLength: number): string {
	return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeManifest(input: unknown): GalleryManifest {
	const source = input as Partial<GalleryManifest> | null;
	if (!source || !Array.isArray(source.albums)) {
		throw new Error("相册清单格式无效。");
	}
	if (source.albums.length > 100) throw new Error("相册数量超过限制。");

	const ids = new Set<string>();
	const directories = new Set<string>();
	const albums: ManagedGalleryAlbum[] = source.albums.map((albumValue) => {
		const album = albumValue as Partial<ManagedGalleryAlbum>;
		const id = normalizeString(album.id, 64).toLowerCase();
		const sourceDir = cleanPath(album.sourceDir);
		const name = normalizeString(album.name, 100);
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
			throw new Error(`相册 slug 无效：${id || "空值"}`);
		}
		if (!isUserAlbumDir(sourceDir)) {
			throw new Error(`相册目录必须是 photos/ 下的单层目录：${sourceDir}`);
		}
		if (!name) throw new Error(`相册 ${id} 缺少名称。`);
		if (ids.has(id) || directories.has(sourceDir)) {
			throw new Error(`相册 slug 或目录重复：${id}`);
		}
		ids.add(id);
		directories.add(sourceDir);

		const photoOrder = Array.isArray(album.photoOrder)
			? album.photoOrder
					.map(cleanPath)
					.filter(
						(key, index, list) =>
							key.startsWith(`${sourceDir}/`) &&
							IMAGE_EXTENSIONS.test(key) &&
							list.indexOf(key) === index,
					)
					.slice(0, 2000)
			: [];
		const cover = cleanPath(album.cover);
		return {
			id,
			sourceDir,
			name,
			description: normalizeString(album.description, 500),
			category: normalizeString(album.category, 80),
			date: normalizeString(album.date, 20),
			location: normalizeString(album.location, 120),
			tags: Array.isArray(album.tags)
				? album.tags
						.map((tag) => normalizeString(tag, 40))
						.filter(Boolean)
						.slice(0, 30)
				: [],
			cover:
				cover.startsWith(`${sourceDir}/`) && IMAGE_EXTENSIONS.test(cover)
					? cover
					: "",
			photoOrder,
		};
	});

	const rawUpdatedAt = normalizeString(source.updatedAt, 64);
	const updatedAt = Number.isNaN(Date.parse(rawUpdatedAt))
		? new Date().toISOString()
		: new Date(rawUpdatedAt).toISOString();
	return { version: MANIFEST_VERSION, updatedAt, albums };
}

async function loadManifest(env: Env, force = false): Promise<GalleryManifest> {
	if (!force && manifestCache && manifestCache.expiresAt > Date.now())
		return manifestCache.manifest;
	if (env.GALLERY_MANIFEST) {
		try {
			const stored = await env.GALLERY_MANIFEST.get(MANIFEST_KV_KEY, "json");
			if (stored) {
				const manifest = normalizeManifest(stored);
				manifestCache = { expiresAt: Date.now() + GALLERY_CACHE_MS, manifest };
				return manifest;
			}
		} catch {}
	}
	try {
		const list = await listRemoteFiles(env, MANIFEST_DIR, false);
		const keys = (list.files || [])
			.map((file) => cleanPath(file.name))
			.filter(
				(key) => key.startsWith(`${MANIFEST_DIR}/`) && key.endsWith(".json"),
			)
			.sort((left, right) => right.localeCompare(left));
		for (const key of keys) {
			const response = await fetch(
				`${imageBedBaseUrl(env)}/file/${encodeKey(key)}`,
				{ cache: "no-store" },
			);
			if (!response.ok) continue;
			try {
				const manifest = normalizeManifest(await response.json());
				manifestCache = { expiresAt: Date.now() + GALLERY_CACHE_MS, manifest };
				return manifest;
			} catch {
				// Try an older manifest if the newest upload is incomplete.
			}
		}
	} catch {
		// The seed keeps existing albums available before the first manifest save.
	}
	const manifest = cloneSeed();
	manifestCache = { expiresAt: Date.now() + GALLERY_CACHE_MS, manifest };
	return manifest;
}

function buildManifestAlbums(
	env: Env,
	manifest: GalleryManifest,
): PublicGalleryAlbum[] {
	return manifest.albums.map((album) => {
		const photos = album.photoOrder.map((key) => ({
			key,
			url: publicImageUrl(env, key),
			name: key.split("/").pop() || key,
			size: 0,
		}));
		const cover = album.cover || photos[0]?.key || "";
		return {
			...album,
			photos,
			photoCount: photos.length,
			coverUrl: cover ? publicImageUrl(env, cover) : "",
		};
	});
}

function buildAlbums(
	manifest: GalleryManifest,
	photos: ManagedGalleryPhoto[],
): PublicGalleryAlbum[] {
	return manifest.albums.map((album) => {
		const order = new Map(album.photoOrder.map((key, index) => [key, index]));
		const albumPhotos = photos
			.filter((photo) => photo.key.startsWith(`${album.sourceDir}/`))
			.sort((left, right) => {
				const leftOrder = order.get(left.key);
				const rightOrder = order.get(right.key);
				if (leftOrder !== undefined || rightOrder !== undefined) {
					return (
						(leftOrder ?? Number.MAX_SAFE_INTEGER) -
						(rightOrder ?? Number.MAX_SAFE_INTEGER)
					);
				}
				return left.name.localeCompare(right.name, "zh-CN", { numeric: true });
			});
		const coverPhoto =
			albumPhotos.find((photo) => photo.key === album.cover) || albumPhotos[0];
		return {
			...album,
			photoOrder: albumPhotos.map((photo) => photo.key),
			photos: albumPhotos,
			photoCount: albumPhotos.length,
			coverUrl: coverPhoto?.url || "",
		};
	});
}

async function loadGalleryState(
	env: Env,
	force = false,
): Promise<GalleryAdminState> {
	if (!force && galleryCache && galleryCache.expiresAt > Date.now()) {
		return galleryCache.state;
	}
	const [manifest, list] = await Promise.all([
		loadManifest(env, force),
		listRemoteFiles(env, "photos", true),
	]);
	const photos = (list.files || [])
		.map((file) => toPhoto(env, file))
		.filter((photo): photo is ManagedGalleryPhoto => !!photo);
	const directories = Array.from(
		new Set(
			(list.directories || [])
				.map(cleanPath)
				.concat(
					photos.map((photo) => photo.key.split("/").slice(0, 2).join("/")),
				)
				.filter(isUserAlbumDir),
		),
	).sort();
	// Remote listing can temporarily be empty or incomplete. Admin GET must be
	// read-only: never persist a reconciliation that could erase saved photo order
	// and covers during a transient image-bed failure or consistency delay.
	const albums = buildAlbums(manifest, photos);
	const mapped = new Set(manifest.albums.map((album) => album.sourceDir));
	const state = {
		manifest,
		albums,
		directories,
		unmappedDirectories: directories.filter(
			(directory) => !mapped.has(directory),
		),
	};
	galleryCache = { expiresAt: Date.now() + GALLERY_CACHE_MS, state };
	return state;
}

function clearGalleryCache(): void {
	galleryCache = null;
}

async function deleteRemoteKey(env: Env, key: string): Promise<void> {
	await imageBedJson(env, `/api/manage/delete/${encodeKey(key)}`, {
		method: "GET",
	});
}

async function renameRemoteKey(
	env: Env,
	key: string,
	newKey: string,
): Promise<string> {
	const payload = await imageBedJson<{ newFileId?: string }>(
		env,
		`/api/manage/rename/${encodeKey(key)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newFileId: newKey }),
		},
	);
	return cleanPath(payload.newFileId) || newKey;
}

async function uploadRemoteFile(
	env: Env,
	file: File,
	folder: string,
): Promise<ManagedGalleryPhoto> {
	const form = new FormData();
	form.append("file", file, file.name);
	const search = new URLSearchParams({
		uploadFolder: folder,
		uploadNameType: "origin",
		returnFormat: "full",
	});
	const payload = await imageBedJson<
		Array<{ src?: string; publicUrl?: string }>
	>(env, `/upload?${search.toString()}`, { method: "POST", body: form });
	const returnedUrl = payload[0]?.publicUrl || payload[0]?.src || "";
	const marker = "/file/";
	const markerIndex = returnedUrl.indexOf(marker);
	if (markerIndex < 0) throw new Error("图床未返回文件路径。");
	const key = decodeURIComponent(
		returnedUrl.slice(markerIndex + marker.length),
	);
	return {
		key,
		url: publicImageUrl(env, key),
		name: key.split("/").pop() || file.name,
		size: file.size,
	};
}

async function saveLegacyManifest(
	env: Env,
	manifest: GalleryManifest,
): Promise<void> {
	const existing = await listRemoteFiles(env, MANIFEST_DIR, false);
	const previousKeys = (existing.files || [])
		.map((file) => cleanPath(file.name))
		.filter(
			(key) => key.startsWith(MANIFEST_DIR + "/") && key.endsWith(".json"),
		).sort((left, right) => right.localeCompare(left));
	const file = new File(
		[JSON.stringify(manifest)],
		String(Date.now()) + ".json",
		{ type: "application/json" },
	);
	await uploadRemoteFile(env, file, MANIFEST_DIR);
	// Keep four earlier manifests in addition to the new one. A broken
	// latest upload can then be recovered without relying solely on KV.
	await Promise.allSettled(
		previousKeys.slice(4).map((key) => deleteRemoteKey(env, key)),
	);
}
async function saveManifest(
	env: Env,
	input: unknown,
): Promise<GalleryManifest> {
	const manifest = normalizeManifest(input);
	manifest.updatedAt = new Date().toISOString();
	if (env.GALLERY_MANIFEST) {
		await env.GALLERY_MANIFEST.put(MANIFEST_KV_KEY, JSON.stringify(manifest));
		await saveLegacyManifest(env, manifest).catch((error) =>
			console.warn("Gallery legacy manifest backup failed", error),
		);
	} else await saveLegacyManifest(env, manifest);
	galleryCache = null;
	manifestCache = { expiresAt: Date.now() + GALLERY_CACHE_MS, manifest };
	return manifest;
}

async function handlePublicGallery(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const manifest = await loadManifest(env);
		const albumId = url.searchParams.get("album")?.trim();
		const summary = url.searchParams.get("summary") === "true";
		const all = buildManifestAlbums(env, manifest);
		const albums = albumId ? all.filter((album) => album.id === albumId) : all;
		const etag = '"gallery-' + manifest.updatedAt + '"';
		const headers = {
			"Cache-Control":
				"public, max-age=15, s-maxage=30, stale-while-revalidate=300",
			ETag: etag,
		};
		if (request.headers.get("If-None-Match") === etag)
			return new Response(null, { status: 304, headers });
		return json(
			{
				albums: summary
					? albums.map((album) => ({ ...album, photos: [] }))
					: albums,
				updatedAt: manifest.updatedAt,
			},
			{ headers },
		);
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : "相册读取失败。",
			503,
		);
	}
}

async function handleAdminApi(request: Request, env: Env): Promise<Response> {
	const authError = await requireGitHubAdmin(request, env);
	if (authError) return authError;
	const url = new URL(request.url);

	try {
		if (
			url.pathname === "/api/admin/gallery/state" &&
			request.method === "GET"
		) {
			return json(await loadGalleryState(env), {
				headers: { "Cache-Control": "no-store" },
			});
		}

		if (
			url.pathname === "/api/admin/gallery/manifest" &&
			request.method === "PUT"
		) {
			const submitted = await request.json() as Partial<GalleryManifest>;
			if (!submitted || typeof submitted.updatedAt !== "string") {
				return errorResponse("相册清单缺少版本时间，请先刷新。", 400);
			}
			// Best-effort stale-tab protection. KV itself has no cross-region CAS:
			// never promise this prevents simultaneous writes in different isolates.
			const current = await loadManifest(env, true);
			if (submitted.updatedAt !== current.updatedAt) {
				return errorResponse("相册已在其他标签页或设备被更新，请先刷新并合并改动。", 409);
			}
			return json({ manifest: await saveManifest(env, submitted) });
		}

		if (
			url.pathname === "/api/admin/imagebed/list" &&
			request.method === "GET"
		) {
			const dir = cleanPath(url.searchParams.get("dir"));
			if (!isSafePath(dir)) return errorResponse("图床目录无效。", 400);
			const list = await listRemoteFiles(
				env,
				dir,
				url.searchParams.get("recursive") !== "false",
			);
			return json({
				files: (list.files || [])
					.map((file) => toPhoto(env, file))
					.filter(Boolean),
				directories: (list.directories || []).map(cleanPath).filter(isSafePath),
			});
		}

		if (
			url.pathname === "/api/admin/imagebed/upload" &&
			request.method === "POST"
		) {
			const folder = cleanPath(url.searchParams.get("folder"));
			if (!isSafePath(folder) || folder === "photos") {
				return errorResponse("上传目录无效。", 400);
			}
			const form = await request.formData();
			const file = form.get("file");
			if (!(file instanceof File) || !file.type.startsWith("image/")) {
				return errorResponse("只能上传图片文件。", 400);
			}
			if (file.size > MAX_FILE_BYTES)
				return errorResponse("图片不能超过 30 MB。", 413);
			const photo = await uploadRemoteFile(env, file, folder);
			clearGalleryCache();
			return json(photo);
		}

		if (
			url.pathname === "/api/admin/imagebed/delete" &&
			request.method === "POST"
		) {
			const body = (await request.json()) as { key?: string };
			const key = cleanPath(body.key);
			if (!isSafePath(key) || !IMAGE_EXTENSIONS.test(key) ||
				key.startsWith(`${MANIFEST_DIR}/`)) {
				return errorResponse("只能删除明确的图片文件，不能删除目录或相册清单。", 400);
			}
			await deleteRemoteKey(env, key);
			clearGalleryCache();
			return json({ success: true });
		}

		if (
			url.pathname === "/api/admin/imagebed/rename" &&
			request.method === "POST"
		) {
			const body = (await request.json()) as { key?: string; newKey?: string };
			const key = cleanPath(body.key);
			const newKey = cleanPath(body.newKey);
			if (
				!isSafePath(key) ||
				!isSafePath(newKey) ||
				!IMAGE_EXTENSIONS.test(key) ||
				!IMAGE_EXTENSIONS.test(newKey) ||
				key.startsWith(`${MANIFEST_DIR}/`) ||
				newKey.startsWith(`${MANIFEST_DIR}/`)
			) {
				return errorResponse("文件路径无效。", 400);
			}
			const renamedKey = await renameRemoteKey(env, key, newKey);
			clearGalleryCache();
			return json({ newKey: renamedKey });
		}

		if (
			url.pathname === "/api/admin/gallery/delete-album" &&
			request.method === "POST"
		) {
			const body = (await request.json()) as { sourceDir?: string };
			const sourceDir = cleanPath(body.sourceDir);
			if (!isUserAlbumDir(sourceDir))
				return errorResponse("相册目录无效。", 400);
			const list = await listRemoteFiles(env, sourceDir, true);
			const keys = (list.files || [])
				.map((file) => cleanPath(file.name))
				.filter((key) => key.startsWith(`${sourceDir}/`));
			const results = await Promise.allSettled(
				keys.map((key) => deleteRemoteKey(env, key)),
			);
			const failed = results.filter(
				(result) => result.status === "rejected",
			).length;
			if (failed) return errorResponse(`${failed} 个文件删除失败。`, 502);
			clearGalleryCache();
			return json({ success: true, deleted: keys.length });
		}

		if (
			url.pathname === "/api/admin/gallery/rename-album" &&
			request.method === "POST"
		) {
			const body = (await request.json()) as {
				sourceDir?: string;
				newSourceDir?: string;
			};
			const sourceDir = cleanPath(body.sourceDir);
			const newSourceDir = cleanPath(body.newSourceDir);
			if (!isUserAlbumDir(sourceDir) || !isUserAlbumDir(newSourceDir) ||
				sourceDir === newSourceDir) {
				return errorResponse("相册目录无效或未更改。", 400);
			}
			const destination = await listRemoteFiles(env, newSourceDir, true);
			if ((destination.files || []).some(file =>
				cleanPath(file.name).startsWith(`${newSourceDir}/`))) {
				return errorResponse("目标相册目录已有文件，已取消重命名以防覆盖。", 409);
			}
			const list = await listRemoteFiles(env, sourceDir, true);
			const keys = (list.files || [])
				.map((file) => cleanPath(file.name))
				.filter((key) => key.startsWith(`${sourceDir}/`));
			const moved: Record<string, string> = {};
			try {
				for (const key of keys) {
					const target = `${newSourceDir}/${key.slice(sourceDir.length + 1)}`;
					moved[key] = await renameRemoteKey(env, key, target);
				}
			} catch (error) {
				const failedRollbacks: string[] = [];
				for (const [original, renamed] of Object.entries(moved).reverse()) {
					try {
						await renameRemoteKey(env, renamed, original);
					} catch {
						failedRollbacks.push(original);
					}
				}
				clearGalleryCache();
				if (failedRollbacks.length) {
					return errorResponse("目录重命名失败，且部分图片回滚失败；请立即核对图床并避免覆盖原相册清单。", 502);
				}
				return errorResponse("目录重命名失败，已回滚已移动的图片。", 502);
			}
			clearGalleryCache();
			return json({ moved });
		}

		return errorResponse("管理接口不存在。", 404);
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : "管理操作失败。",
			500,
		);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const pathname = new URL(request.url).pathname;
		if (pathname.startsWith("/api/") && !isAllowedOrigin(request, env)) {
			return errorResponse("请求来源不受信任。", 403);
		}
		if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
			return withCors(new Response(null, { status: 204 }), request, env);
		}
		if (pathname === "/api/gallery/public" && request.method === "GET") {
			return withCors(await handlePublicGallery(request, env), request, env);
		}
		if (pathname.startsWith("/api/admin/")) {
			return withCors(await handleAdminApi(request, env), request, env);
		}
		return env.ASSETS?.fetch(request) ?? errorResponse("接口不存在。", 404);
	},
};
