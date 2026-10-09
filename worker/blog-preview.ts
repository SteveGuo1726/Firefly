import { createLiveContentService } from "../src/server/live-content/service.js";
import { renderLivePostFallback } from "../src/server/live-content/render-live-post.js";

let cachedService;

function getService(env) {
	if (!cachedService) {
		cachedService = createLiveContentService({
			provider: "cloudflare-kv-preview",
			storeName: "firefly-content-live-preview",
			store: {
				async getJSON(key) {
					const value = await env.LIVE_CONTENT_PREVIEW.get(key);
					if (!value) return null;
					return JSON.parse(value);
				},
				setJSON(key, value) {
					return env.LIVE_CONTENT_PREVIEW.put(key, JSON.stringify(value));
				},
			},
			region() {
				return "cloudflare-preview";
			},
		});
	}
	return cachedService;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/live-content/")) {
			return getService(env)(request, { env, ctx });
		}
		if (url.pathname.startsWith("/posts/")) {
			const asset = await env.ASSETS.fetch(request);
			if (asset.status !== 404) return asset;
			return renderLivePostFallback(request, {
				async loadItem(id) {
					const value = await env.LIVE_CONTENT_PREVIEW.get(`v1/posts/${id}.json`);
					return value ? JSON.parse(value) : null;
				},
				loadShell() {
					return env.ASSETS.fetch(new Request(new URL("/internal/live-post-shell/", request.url)));
				},
			});
		}
		return env.ASSETS.fetch(request);
	},
};
