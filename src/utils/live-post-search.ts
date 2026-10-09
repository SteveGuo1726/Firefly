import type { SearchResult } from "../global";

export type LivePostSearchEntry = {
	id: string;
	deleted?: boolean;
	hidden?: boolean;
	meta?: {
		title?: string;
		description?: string;
		category?: string;
		tags?: string[];
		searchText?: string;
	};
};

export type LivePostSearchOptions = {
	indexUrl?: string;
	postUrl?: (id: string) => string;
};

const liveIndexCache = new Map<
	string,
	{ expiresAt: number; entries: LivePostSearchEntry[] }
>();
const liveIndexPromises = new Map<string, Promise<LivePostSearchEntry[]>>();

export const escapeSearchHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

export const escapeSearchRegExp = (value: string): string =>
	value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

export function highlightSearchText(value: string, keyword: string): string {
	const needle = keyword.trim();
	if (!needle) return escapeSearchHtml(value);
	const regex = new RegExp(`(${escapeSearchRegExp(needle)})`, "ig");
	return value
		.split(regex)
		.map((part, index) =>
			index % 2 === 1
				? `<mark>${escapeSearchHtml(part)}</mark>`
				: escapeSearchHtml(part),
		)
		.join("");
}

export function livePostPath(id: string): string {
	return "/posts/" + id.split("/").map(encodeURIComponent).join("/") + "/";
}

function liveExcerpt(entry: LivePostSearchEntry, keyword: string): string {
	const description = String(entry.meta?.description || "");
	const searchText = String(entry.meta?.searchText || "");
	const needle = keyword.trim().toLocaleLowerCase();
	if (!needle) return highlightSearchText(description, keyword);
	if (description.toLocaleLowerCase().includes(needle)) {
		return highlightSearchText(description, keyword);
	}
	const index = searchText.toLocaleLowerCase().indexOf(needle);
	if (index < 0) return highlightSearchText(description, keyword);
	const start = Math.max(0, index - 70);
	const end = Math.min(searchText.length, index + needle.length + 110);
	return (
		(start > 0 ? "…" : "") +
		highlightSearchText(searchText.slice(start, end), keyword) +
		(end < searchText.length ? "…" : "")
	);
}

export function mergeLiveSearchEntries(
	pagefindResults: SearchResult[],
	liveEntries: LivePostSearchEntry[],
	keyword: string,
	postUrl: (id: string) => string = livePostPath,
): SearchResult[] {
	const merged = new Map(pagefindResults.map((entry) => [entry.url, entry]));
	const needle = keyword.trim().toLocaleLowerCase();

	for (const entry of liveEntries) {
		if (!entry?.id) continue;
		const itemUrl = postUrl(entry.id);
		merged.delete(itemUrl);
		if (entry.deleted || entry.hidden || !entry.meta?.title) continue;

		const title = String(entry.meta.title);
		const description = String(entry.meta.description || "");
		const category = String(entry.meta.category || "");
		const tags = Array.isArray(entry.meta.tags) ? entry.meta.tags.map(String) : [];
		const searchText = String(entry.meta.searchText || "");
		const haystack = [title, description, category, tags.join(" "), searchText]
			.join(" ")
			.toLocaleLowerCase();
		if (needle && !haystack.includes(needle)) continue;

		merged.set(itemUrl, {
			url: itemUrl,
			meta: { title: highlightSearchText(title, keyword) },
			excerpt: liveExcerpt(entry, keyword),
		});
	}
	return [...merged.values()];
}

export function invalidateLivePostSearchIndex(indexUrl?: string): void {
 if (indexUrl) liveIndexCache.delete(indexUrl);
 else liveIndexCache.clear();
}
export async function getLivePostSearchIndex(
	indexUrl = "/api/live-content/index?kind=post",
): Promise<LivePostSearchEntry[]> {
	const cached = liveIndexCache.get(indexUrl);
	if (cached && cached.expiresAt > Date.now()) return cached.entries;
	const pending = liveIndexPromises.get(indexUrl);
	if (pending) return pending;

	const promise = fetch(indexUrl, { cache: "no-store" })
		.then(async (response) => {
			if (!response.ok) return [];
			const payload = await response.json();
			const entries = Array.isArray(payload?.entries) ? payload.entries : [];
			liveIndexCache.set(indexUrl, {
				expiresAt: Date.now() + 30_000,
				entries,
			});
			return entries;
		})
		.catch((error) => {
			console.warn("Live post search overlay unavailable", error);
			return [];
		})
		.finally(() => {
			liveIndexPromises.delete(indexUrl);
		});
	liveIndexPromises.set(indexUrl, promise);
	return promise;
}

export async function mergeLiveSearchResults(
	pagefindResults: SearchResult[],
	keyword: string,
	options: LivePostSearchOptions = {},
): Promise<SearchResult[]> {
	return mergeLiveSearchEntries(
		pagefindResults,
		await getLivePostSearchIndex(options.indexUrl),
		keyword,
		options.postUrl,
	);
}
