import type {
	GalleryManifest,
	ManagedGalleryAlbum,
	PublicGalleryAlbum,
} from "@/types/galleryAdmin";

function imageBedUrl(key: string): string {
	return `https://img.casto.top/file/${key
		.split("/")
		.map(encodeURIComponent)
		.join("/")}`;
}

export function createManagedPublicAlbum(
	album: ManagedGalleryAlbum,
): PublicGalleryAlbum {
	const photos = album.photoOrder.map((key) => ({
		key,
		url: imageBedUrl(key),
		name: key.split("/").pop() || key,
		size: 0,
	}));
	return {
		...album,
		photos,
		photoCount: photos.length,
		coverUrl: album.cover ? imageBedUrl(album.cover) : photos[0]?.url || "",
	};
}

export const galleryManagedSeed: GalleryManifest = {
	version: 1,
	updatedAt: "2026-07-23T00:00:00.000Z",
	albums: [
		{
			id: "castorice-2026",
			sourceDir: "photos/castorice",
			name: "遐蝶图集",
			description: "星穹漫遐，蝶携清梦。",
			category: "崩坏：星穹铁道",
			date: "2026-06-25",
			location: "崩坏：星穹铁道",
			tags: [],
			cover: "photos/castorice/d2.webp",
			photoOrder: [
				"photos/castorice/d2.webp",
				"photos/castorice/d3.webp",
				"photos/castorice/d1.webp",
				"photos/castorice/d4.webp",
				"photos/castorice/m4.webp",
				"photos/castorice/m1.webp",
				"photos/castorice/m2.webp",
			],
		},
		{
			id: "test",
			sourceDir: "photos/test",
			name: "test",
			description: "这是一个用于测试手机同步功能的相册。",
			date: "2026-07-22",
			location: "test",
			tags: [],
			cover: "photos/test/ENDFIELD_SHARE_1784526812.png",
			photoOrder: [
				"photos/test/1750521068016.jpg",
				"photos/test/1751328966507.jpg",
				"photos/test/1751723204251.webp",
				"photos/test/1758430420145.png",
				"photos/test/1762689391165.jpeg",
				"photos/test/1782174530943.jpeg",
				"photos/test/1783175257280.jpeg",
				"photos/test/1784453238201.jpeg",
				"photos/test/ENDFIELD_SHARE_1784526812.png",
				"photos/test/ENDFIELD_SHARE_1784527037.png",
			],
		},
	],
};
