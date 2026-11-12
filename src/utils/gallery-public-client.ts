import type { PublicGalleryAlbum } from "@/types/galleryAdmin";

// Public gallery reads must never import admin auth, token storage or write APIs.
export async function fetchPublicGallery(
	albumId = "",
	summary = false,
	timeoutMs = 7000,
): Promise<{ albums: PublicGalleryAlbum[] }> {
	const customOrigin = import.meta.env.PUBLIC_GALLERY_API_ORIGIN?.trim() || "";
	const baseUrl = customOrigin || (typeof window !== "undefined" ? window.location.origin : "https://blog.casto.top");
	const endpoint = new URL("/api/gallery-public", baseUrl);
	if (albumId) endpoint.searchParams.set("album", albumId);
	if (summary) endpoint.searchParams.set("summary", "true");

	const response = await fetch(endpoint.toString(), {
		cache: "no-store",
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) throw new Error(`相册读取失败：${response.status}`);
	const payload = (await response.json()) as { albums?: PublicGalleryAlbum[] };
	if (!Array.isArray(payload.albums)) throw new Error("相册响应格式错误");
	return { albums: payload.albums };
}
