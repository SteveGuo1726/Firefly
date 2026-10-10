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
	let id;
	try {
		id = decodeURIComponent(pathname.slice("/posts/".length))
			.replace(/^\/+|\/+$/g, "");
	} catch {
		return null;
	}
	if (!id || id.includes("..") || id.includes("\\") || /[\u0000-\u001f\u007f]/.test(id)) return null;
	if (id.split("/").some(segment => !segment || segment === ".")) return null;
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
	const commentPath = escapeHtml(`/posts/${id}`);

	html = html
		.replaceAll("__LIVE_POST_TITLE__", title)
		.replaceAll("__LIVE_POST_DESCRIPTION__", description)
		.replaceAll("__LIVE_POST_PUBLISHED__", published)
		.replaceAll("__LIVE_POST_CATEGORY__", category)
		.replaceAll("__LIVE_POST_TAGS__", tags)
		.replaceAll("__LIVE_POST_COMMENT_PATH__", commentPath)
		.replaceAll("https://blog.casto.top/internal/live-post-shell/", requestUrl)
		.replace('<!--LIVE_POST_CONTENT-->', String(meta.html))
		.replace(/<meta[^>]+data-live-shell-robots[^>]*>/, "");

	const commentBlock =
		/<div[^>]*data-live-post-comments-boundary=["']start["'][^>]*><\/div>[\s\S]*?<div[^>]*data-live-post-comments-boundary=["']end["'][^>]*><\/div>/;
	const startBoundary =
		/<div[^>]*data-live-post-comments-boundary=["']start["'][^>]*><\/div>/;
	const endBoundary =
		/<div[^>]*data-live-post-comments-boundary=["']end["'][^>]*><\/div>/;

	if (meta.comment === false) {
		html = html.replace(commentBlock, "");
	} else {
		html = html.replace(startBoundary, "").replace(endBoundary, "");
	}

	return new Response(html, {
		status: 200,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Firefly-Live-Post": String(item.revision || "1"),
		},
	});
}
