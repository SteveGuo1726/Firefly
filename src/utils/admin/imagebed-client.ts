import type {
	GalleryAdminState,
	GalleryManifest,
	ManagedGalleryPhoto,
	PublicGalleryAlbum,
} from "@/types/galleryAdmin";
import { getGitHubAdminSession } from "@/utils/admin/github-session";

type ImageBedListResponse = {
	files: ManagedGalleryPhoto[];
	directories: string[];
};

const GALLERY_API_ORIGIN = "https://gallery-api.casto.top";

function apiUrl(path: string): URL {
	return new URL(path, GALLERY_API_ORIGIN);
}

function adminHeaders(contentType?: string): HeadersInit {
	const session = getGitHubAdminSession();
	if (!session) throw new Error("GitHub 登录已失效，请重新登录。");
	return {
		Authorization: `Bearer ${session.token}`,
		...(contentType ? { "Content-Type": contentType } : {}),
	};
}

async function readJson<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & {
		error?: string;
		message?: string;
	};
	if (!response.ok) {
		throw new Error(
			payload.message || payload.error || `请求失败：${response.status}`,
		);
	}
	return payload;
}

export async function fetchGalleryAdminState(): Promise<GalleryAdminState> {
	const response = await fetch(apiUrl("/api/admin/gallery/state"), {
		headers: adminHeaders(),
		cache: "no-store",
	});
	return readJson<GalleryAdminState>(response);
}

export async function fetchPublicGallery(
	albumId = "",
): Promise<{ albums: PublicGalleryAlbum[] }> {
	const url = apiUrl("/api/gallery/public");
	if (albumId) url.searchParams.set("album", albumId);
	const response = await fetch(url, { cache: "no-store" });
	return readJson<{ albums: PublicGalleryAlbum[] }>(response);
}

export async function saveGalleryManifest(
	manifest: GalleryManifest,
): Promise<GalleryManifest> {
	const response = await fetch(apiUrl("/api/admin/gallery/manifest"), {
		method: "PUT",
		headers: adminHeaders("application/json"),
		body: JSON.stringify(manifest),
	});
	const payload = await readJson<{ manifest: GalleryManifest }>(response);
	return payload.manifest;
}

export async function listImageBedFiles(
	dir: string,
): Promise<ImageBedListResponse> {
	const url = apiUrl("/api/admin/imagebed/list");
	url.searchParams.set("dir", dir);
	url.searchParams.set("recursive", "true");
	const response = await fetch(url, {
		headers: adminHeaders(),
		cache: "no-store",
	});
	return readJson<ImageBedListResponse>(response);
}

export async function uploadImageBedFile(
	file: File,
	folder: string,
): Promise<ManagedGalleryPhoto> {
	const formData = new FormData();
	formData.append("file", file);
	const url = apiUrl("/api/admin/imagebed/upload");
	url.searchParams.set("folder", folder);
	const response = await fetch(url, {
		method: "POST",
		headers: adminHeaders(),
		body: formData,
	});
	return readJson<ManagedGalleryPhoto>(response);
}

export async function deleteImageBedFile(key: string): Promise<void> {
	const response = await fetch(apiUrl("/api/admin/imagebed/delete"), {
		method: "POST",
		headers: adminHeaders("application/json"),
		body: JSON.stringify({ key }),
	});
	await readJson(response);
}

export async function renameImageBedFile(
	key: string,
	newKey: string,
): Promise<{ newKey: string }> {
	const response = await fetch(apiUrl("/api/admin/imagebed/rename"), {
		method: "POST",
		headers: adminHeaders("application/json"),
		body: JSON.stringify({ key, newKey }),
	});
	return readJson<{ newKey: string }>(response);
}

export async function deleteImageBedAlbum(sourceDir: string): Promise<void> {
	const response = await fetch(apiUrl("/api/admin/gallery/delete-album"), {
		method: "POST",
		headers: adminHeaders("application/json"),
		body: JSON.stringify({ sourceDir }),
	});
	await readJson(response);
}

export async function renameImageBedAlbum(
	sourceDir: string,
	newSourceDir: string,
): Promise<Record<string, string>> {
	const response = await fetch(apiUrl("/api/admin/gallery/rename-album"), {
		method: "POST",
		headers: adminHeaders("application/json"),
		body: JSON.stringify({ sourceDir, newSourceDir }),
	});
	const payload = await readJson<{ moved: Record<string, string> }>(response);
	return payload.moved;
}
