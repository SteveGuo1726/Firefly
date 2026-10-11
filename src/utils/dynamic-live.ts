export type DynamicImage = {
	alt: string;
	src: string;
	title?: string;
};

export type DynamicData = {
	id: string;
	published: number;
	html: string;
	images: DynamicImage[];
	searchText: string;
	pinned?: boolean;
	location?: string;
};

export type LiveDynamicIndexEntry = {
	id: string;
	deleted?: boolean;
	meta?: {
		published?: string;
		pinned?: boolean;
		location?: string;
		searchText?: string;
		html?: string;
		images?: DynamicImage[];
	};
};

export function parseLiveDynamicPublished(value: string | undefined): number {
	if (!value) return 0;
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
		? value.replace(" ", "T") + "Z"
		: value;
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeLiveDynamicEntries(
	baseEntries: DynamicData[],
	liveEntries: LiveDynamicIndexEntry[],
): DynamicData[] {
	const map = new Map(baseEntries.map((entry) => [entry.id, entry]));

	for (const live of liveEntries) {
		if (!live?.id) continue;
		if (live.deleted) {
			map.delete(live.id);
			continue;
		}
		const meta = live.meta || {};
		const published = parseLiveDynamicPublished(meta.published);
		if (!published || !meta.html) continue;
		map.set(live.id, {
			id: live.id,
			published,
			html: String(meta.html),
			images: Array.isArray(meta.images) ? meta.images : [],
			searchText: String(meta.searchText || "").toLocaleLowerCase(),
			pinned: Boolean(meta.pinned),
			location: String(meta.location || ""),
		});
	}

	return [...map.values()].sort((a, b) => {
		if (a.pinned && !b.pinned) return -1;
		if (!a.pinned && b.pinned) return 1;
		return b.published - a.published;
	});
}
