import type { SearchResult } from "../global";
import { url as formatUrl } from "./url-utils";

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

let liveIndexCache: { expiresAt: number; entries: LivePostSearchEntry[] } | null = null;
let liveIndexPromise: Promise<LivePostSearchEntry[]> | null = null;

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

export function livePostUrl(id: string): string {
	return formatUrl(
		"/posts/" + id.split("/").map(encodeURIComponent).join("/") + "/",
	);
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
	const prefix = start > 0 ? "…" : "";
	const suffix = end < searchText.length ? "…" : "";
	return prefix + highlightSearchText(searchText.slice(start, end), keyword) + suffix;
}

export function mergeLiveSearchEntries(
	pagefindResults: SearchResult[],
	liveEntries: LivePostSearchEntry[],
	keyword: string,
): SearchResult[] {
	const merged = new Map(pagefindResults.map((entry) => [entry.url, entry]));
	const needle = keyword.trim().toLocaleLowerCase();

	for (const entry of liveEntries) {
		if (!entry?.id) continue;
		const itemUrl = livePostUrl(entry.id);

		// Live state always supersedes stale Pagefind state for the same URL.
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

export async function getLivePostSearchIndex(): Promise<LivePostSearchEntry[]> {
	if (liveIndexCache && liveIndexCache.expiresAt > Date.now()) {
		return liveIndexCache.entries;
	}
	if (liveIndexPromise) return liveIndexPromise;

	liveIndexPromise = fetch(formatUrl("/api/live-content/index?kind=post"), {
		cache: "no-store",
	})
		.then(async (response) => {
			if (!response.ok) return [];
			const payload = await response.json();
			const entries = Array.isArray(payload?.entries) ? payload.entries : [];
			liveIndexCache = { expiresAt: Date.now() + 30_000, entries };
			return entries;
		})
		.catch((error) => {
			console.warn("Live post search overlay unavailable", error);
			return [];
		})
		.finally(() => {
			liveIndexPromise = null;
		});

	return liveIndexPromise;
}

export async function mergeLiveSearchResults(
	pagefindResults: SearchResult[],
	keyword: string,
): Promise<SearchResult[]> {
	return mergeLiveSearchEntries(
		pagefindResults,
		await getLivePostSearchIndex(),
		keyword,
	);
}
