import type { PublicGalleryAlbum } from "@/types/galleryAdmin";

// Public gallery reads must never import admin auth, token storage or write APIs.
const DEFAULT_ORIGIN = "https://gallery-api.casto.top";
const origin = (import.meta.env.PUBLIC_GALLERY_API_ORIGIN?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, "");

export async function fetchPublicGallery(
 albumId = "",
 summary = false,
 timeoutMs = 7000,
): Promise<{ albums: PublicGalleryAlbum[] }> {
 const endpoint = new URL("/api/gallery/public", origin);
 if (albumId) endpoint.searchParams.set("album", albumId);
 if (summary) endpoint.searchParams.set("summary", "true");
 // Fail back to the prerendered gallery instead of leaving mainland visitors
 // waiting indefinitely when the gallery API route is slow or unreachable.
 const response = await fetch(endpoint, {
  cache:"no-store",
  signal:AbortSignal.timeout(timeoutMs),
 });
 if (!response.ok) throw new Error(`相册读取失败：${response.status}`);
 const payload = await response.json() as {albums?:PublicGalleryAlbum[]};
 if (!Array.isArray(payload.albums)) throw new Error("相册响应格式错误");
 return {albums:payload.albums};
}
