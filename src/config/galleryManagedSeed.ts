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
	updatedAt: "2026-07-21T00:00:00.000Z",
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
			description: "这是一个测试相册管理功能的相册，放点杂图",
			date: "2026-07-21",
			location: "test",
			tags: [],
			cover: "",
			photoOrder: [
				"photos/test/ENDFIELD_SHARE_1784526812.png",
				"photos/test/ENDFIELD_SHARE_1784527037.png",
			],
		},
	],
};
