export type ManagedGalleryAlbum = {
	id: string;
	sourceDir: string;
	name: string;
	description?: string;
	category?: string;
	date?: string;
	location?: string;
	tags?: string[];
	cover?: string;
	photoOrder: string[];
};

export type GalleryManifest = {
	version: 1;
	updatedAt: string;
	albums: ManagedGalleryAlbum[];
};

export type ManagedGalleryPhoto = {
	key: string;
	url: string;
	name: string;
	size: number;
	width?: number;
	height?: number;
	timestamp?: number;
};

export type PublicGalleryAlbum = ManagedGalleryAlbum & {
	photos: ManagedGalleryPhoto[];
	photoCount: number;
	coverUrl: string;
};

export type GalleryAdminState = {
	/** Experimental blog backend: read-only projection of the existing public gallery. */
	readOnly?: boolean;
	source?: "imagebed-admin" | "public-gallery-bridge";
	manifest: GalleryManifest;
	albums: PublicGalleryAlbum[];
	directories: string[];
	unmappedDirectories: string[];
};
