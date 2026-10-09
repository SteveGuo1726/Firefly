function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function livePostIdFromRequest(request) {
	const pathname = new URL(request.url).pathname;
	if (!pathname.startsWith("/posts/")) return null;
	const id = decodeURIComponent(pathname.slice("/posts/".length))
		.replace(/^\/+|\/+$/g, "");
	if (!id || id.includes("..") || id.includes("\\")) return null;
	return id;
}

export async function renderLivePostFallback(request, { loadItem, loadShell }) {
	const id = livePostIdFromRequest(request);
	if (!id) return new Response("Not Found", { status: 404 });

	const item = await loadItem(id);
	const meta = item?.meta || {};
	if (
		!item ||
		item.deleted ||
		meta.draft ||
		meta.protected ||
		!meta.html
	) {
		return new Response("Not Found", { status: 404 });
	}

	const shellResponse = await loadShell();
	if (!shellResponse?.ok) {
		return new Response("Live post shell unavailable", { status: 503 });
	}
	let html = await shellResponse.text();
	const title = escapeHtml(meta.title || id);
	const description = escapeHtml(meta.description || meta.title || id);
	const published = escapeHtml(meta.published || "");
	const category = escapeHtml(meta.category || "");
	const tags = escapeHtml(Array.isArray(meta.tags) ? meta.tags.join(" · ") : "");
	const requestUrl = escapeHtml(new URL(request.url).toString());

	html = html
		.replaceAll("__LIVE_POST_TITLE__", title)
		.replaceAll("__LIVE_POST_DESCRIPTION__", description)
		.replaceAll("__LIVE_POST_PUBLISHED__", published)
		.replaceAll("__LIVE_POST_CATEGORY__", category)
		.replaceAll("__LIVE_POST_TAGS__", tags)
		.replaceAll("https://blog.casto.top/internal/live-post-shell/", requestUrl)
		.replace('<!--LIVE_POST_CONTENT-->', String(meta.html))
		.replace(/<meta[^>]+data-live-shell-robots[^>]*>/, "");

	return new Response(html, {
		status: 200,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Firefly-Live-Post": String(item.revision || "1"),
		},
	});
}
