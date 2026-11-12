import fs from "node:fs";
import path from "node:path";
import { galleryManagedSeed } from "../config/galleryManagedSeed";
import type { GalleryAlbum } from "@/types/config";
import { url } from "./url-utils";

function withBase(assetPath: string): string {
	if (!assetPath) return "";
	if (/^(https?:)?\/\//i.test(assetPath) || /^(data|blob):/i.test(assetPath)) {
		return assetPath;
	}
	const normalizedPath = assetPath.startsWith("/")
		? assetPath
		: `/${assetPath}`;
	const base = import.meta.env.BASE_URL || "/";
	if (base !== "/" && normalizedPath.startsWith(base)) {
		return normalizedPath;
	}
	return url(normalizedPath);
}

/**
 * 扫描相册目录中的所有图片文件（结合本地文件与 EdgeOne 托管种子）
 */
export function scanAlbumPhotos(albumId: string): string[] {
	const dir = path.join(process.cwd(), "public", "gallery", albumId);
	let localPhotos: string[] = [];

	if (fs.existsSync(dir)) {
		const files = fs
			.readdirSync(dir)
			.filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f))
			.sort();
		// 将 cover.* 排到第一位
		const coverIdx = files.findIndex((f) => /^cover\./i.test(f));
		if (coverIdx > 0) {
			const [coverFile] = files.splice(coverIdx, 1);
			files.unshift(coverFile);
		}
		localPhotos = files.map((f) => withBase(`/gallery/${albumId}/${f}`));

		// 读取 urls.txt 中的远程图片 URL
		const urlsFile = path.join(dir, "urls.txt");
		if (fs.existsSync(urlsFile)) {
			const remotePhotos = fs
				.readFileSync(urlsFile, "utf-8")
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));
			localPhotos.push(...remotePhotos);
		}
	}

	// 如果本地已经有图片，优先使用本地文件，避免追加重复或跨域的远程种子
	if (localPhotos.length > 0) {
		return localPhotos;
	}

	// 检查 EdgeOne 托管相册种子数据（作为本地无文件时的远程回退）
	const managed = galleryManagedSeed.albums.find((a) => a.id === albumId);
	const managedPhotos =
		managed?.photoOrder?.map((key) => {
			if (/^(https?:)?\/\//i.test(key)) return key;
			if (key.startsWith("/file/")) return `https://img.casto.top${key}`;
			return "https://img.casto.top/file/" + key.split("/").map(encodeURIComponent).join("/");
		}) || [];

	return managedPhotos;
}

/**
 * 获取相册封面图
 * 优先级：手动指定 > 本地 cover.* 文件 > 本地第一张图片 > 托管种子封面
 */
export function getAlbumCover(album: GalleryAlbum, photos: string[]): string {
	if (album.cover) return withBase(album.cover);

	const coverFile = photos.find((p) => /\/cover\./i.test(p));
	if (coverFile) return coverFile;

	if (photos.length > 0 && photos[0]) {
		return photos[0];
	}

	const managed = galleryManagedSeed.albums.find((a) => a.id === album.id);
	if (managed?.cover) {
		const c = managed.cover;
		if (/^(https?:)?\/\//i.test(c)) return c;
		if (c.startsWith("/file/")) return `https://img.casto.top${c}`;
		return "https://img.casto.top/file/" + c.split("/").map(encodeURIComponent).join("/");
	}

	return "";
}
