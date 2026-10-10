import type { GalleryAdminState, GalleryManifest } from "@/types/galleryAdmin";

export type GalleryIntegrityIssue = {
 severity: "error" | "warning";
 code: string;
 albumId: string;
 message: string;
};
export type GalleryIntegrityReport = {
 albumCount: number;
 listedPhotoCount: number;
 errorCount: number;
 warningCount: number;
 issues: GalleryIntegrityIssue[];
};

function validDirectory(dir: string): boolean {
 return /^photos\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(dir);
}
function insideDirectory(key: string, dir: string): boolean {
 return key.startsWith(dir + "/") && !key.includes("..") && !key.includes("\\");
}

/** Check a local manifest without modifying it or trusting the remote photo list as complete. */
export function inspectGalleryManifest(
 manifest: GalleryManifest,
 state: GalleryAdminState | null = null,
): GalleryIntegrityReport {
 const issues: GalleryIntegrityIssue[] = [];
 const seenIds = new Set<string>(), seenDirs = new Set<string>();
 let listedPhotoCount = 0;
 const add = (severity: GalleryIntegrityIssue["severity"], code: string, albumId: string, message: string) =>
  issues.push({ severity, code, albumId, message });
 for (const album of manifest.albums) {
  const id = album.id || "(missing)";
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(album.id)) add("error","invalid-id",id,"相册 Slug 无效。");
  if (seenIds.has(album.id)) add("error","duplicate-id",id,"相册 Slug 重复。");
  seenIds.add(album.id);
  if (!validDirectory(album.sourceDir)) add("error","invalid-directory",id,"图床目录必须是 photos/ 下的安全路径。");
  if (seenDirs.has(album.sourceDir)) add("error","duplicate-directory",id,"多个相册使用同一个图床目录。");
  seenDirs.add(album.sourceDir);
  if (!album.name?.trim()) add("error","empty-name",id,"相册名称不能为空。");
  const ordered = new Set<string>();
  for (const key of album.photoOrder || []) {
   listedPhotoCount++;
   if (!insideDirectory(key,album.sourceDir)) add("error","outside-photo",id,"图片排序包含相册目录之外的文件。");
   if (ordered.has(key)) add("warning","duplicate-photo",id,"图片排序中有重复项。");
   ordered.add(key);
  }
  if (album.cover && !insideDirectory(album.cover,album.sourceDir)) add("error","outside-cover",id,"封面不属于当前相册目录。");
  if (album.cover && !ordered.has(album.cover)) add("warning","unlisted-cover",id,"封面未出现在图片排序清单中。");
  const remote = state?.albums.find((item) => item.id === album.id);
  if (remote && remote.photos.length > 0) {
   const known = new Set(remote.photos.map((photo) => photo.key));
   if (album.cover && !known.has(album.cover)) add("warning","unseen-cover",id,"当前远端图片列表未找到封面；请确认图床是否完整返回。");
   const unlisted = remote.photos.filter((photo) => !ordered.has(photo.key));
   if (unlisted.length) add("warning","unlisted-photos",id,unlisted.length + " 张远端图片尚未加入排序清单。");
  }
 }
 return {
  albumCount: manifest.albums.length,
  listedPhotoCount,
  errorCount: issues.filter((item) => item.severity === "error").length,
  warningCount: issues.filter((item) => item.severity === "warning").length,
  issues,
 };
}

export async function createGalleryManifestBackup(
 manifest: GalleryManifest, state: GalleryAdminState | null = null,
): Promise<{ json: string; sha256: string; report: GalleryIntegrityReport }> {
 const report = inspectGalleryManifest(manifest,state);
 const json = JSON.stringify({
  format: "firefly-gallery-manifest",
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  note: "Manifest metadata only. Photo files and comments are not included.",
  manifest,
  integrity: report,
 },null,2) + "\n";
 const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(json));
 const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,"0")).join("");
 return {json,sha256,report};
}
