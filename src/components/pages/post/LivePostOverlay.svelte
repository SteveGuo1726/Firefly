<script lang="ts">
import { onMount } from "svelte";
export let postId: string;
export let siteTitle: string;

function updateNamedMeta(name: string, value: string) {
	const element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
	if (element) element.content = value;
}

function updatePropertyMeta(property: string, value: string) {
	const element = document.querySelector<HTMLMetaElement>(
		`meta[property="${property}"]`,
	);
	if (element) element.content = value;
}

function replaceArticleTags(tags: string[]) {
	for (const element of document.querySelectorAll('meta[property="article:tag"]')) {
		element.remove();
	}
	for (const tag of tags) {
		const element = document.createElement("meta");
		element.setAttribute("property", "article:tag");
		element.content = tag;
		document.head.append(element);
	}
}

function updateStructuredData(meta: Record<string, unknown>) {
	const script = document.querySelector<HTMLScriptElement>("#post-jsonld");
	if (!script?.textContent) return;
	try {
		const json = JSON.parse(script.textContent);
		const graph = Array.isArray(json?.["@graph"]) ? json["@graph"] : [];
		const article = graph.find((item: any) => item?.["@type"] === "BlogPosting");
		if (!article) return;
		article.headline = String(meta.title || postId);
		article.description = String(meta.description || meta.title || postId);
		article.keywords = Array.isArray(meta.tags) ? meta.tags.join(", ") : undefined;
		if (meta.published) article.datePublished = String(meta.published);
		if (meta.updated) article.dateModified = String(meta.updated);
		else delete article.dateModified;
		if (meta.category) article.articleSection = String(meta.category);
		else delete article.articleSection;
		script.textContent = JSON.stringify(json);
	} catch (error) {
		console.warn("Live post JSON-LD update failed", error);
	}
}

onMount(() => {
	let busy = false;
	let lastCheckedAt = 0;
	let disposed = false;
	const apply = async () => {
		if (busy || disposed) return;
		busy = true;
		try {
			const response = await fetch(
				`/api/live-content/item?kind=post&id=${encodeURIComponent(postId)}`,
				{ cache: "no-store" },
			);
			if (response.status === 410) {
				window.location.replace("/404/");
				return;
			}
			if (response.status === 404) return;
			if (!response.ok) return;
			const item = await response.json();
			if (disposed) return;
			const meta = item?.meta || {};
			if (!meta.html || meta.draft || meta.protected) return;

			const title = String(meta.title || postId);
			const description = String(meta.description || title);
			const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];

			for (const node of document.querySelectorAll<HTMLElement>("[data-live-post-title]")) {
				node.textContent = title;
			}
			const content = document.querySelector<HTMLElement>("[data-live-post-content]");
			if (content) content.innerHTML = String(meta.html);

			document.title = `${title} - ${siteTitle}`;
			updateNamedMeta("description", description);
			updatePropertyMeta("og:title", title);
			updatePropertyMeta("og:description", description);
			updateNamedMeta("twitter:title", title);
			updateNamedMeta("twitter:description", description);
			if (meta.published) {
				updatePropertyMeta("article:published_time", String(meta.published));
			}
			if (meta.updated) {
				updatePropertyMeta("article:modified_time", String(meta.updated));
			}
			if (meta.category) {
				updatePropertyMeta("article:section", String(meta.category));
			}
			replaceArticleTags(tags);
			updateStructuredData(meta);

			if (meta.comment === false) {
				document.querySelector("#post-comments")?.remove();
			}
			document.documentElement.dataset.livePostRevision = String(item.revision || "");
		} catch (error) {
			console.warn("Live post overlay unavailable", error);
		} finally {
			busy = false;
			lastCheckedAt = Date.now();
		}
	};
	const checkWhenVisible = () => {
		if (document.visibilityState === "visible" && Date.now() - lastCheckedAt > 3000) void apply();
	};
	const onStorage = (event: StorageEvent) => {
		if (event.key !== "firefly:live-content-updated" || !event.newValue) return;
		try {
			if (JSON.parse(event.newValue)?.kind === "post") void apply();
		} catch { /* Ignore malformed notifications. */ }
	};
	window.addEventListener("storage", onStorage);
	window.addEventListener("focus", checkWhenVisible);
	window.addEventListener("pageshow", checkWhenVisible);
	document.addEventListener("visibilitychange", checkWhenVisible);
	void apply();
	return () => {
		disposed = true;
		window.removeEventListener("storage", onStorage);
		window.removeEventListener("focus", checkWhenVisible);
		window.removeEventListener("pageshow", checkWhenVisible);
		document.removeEventListener("visibilitychange", checkWhenVisible);
	};
});
</script>
