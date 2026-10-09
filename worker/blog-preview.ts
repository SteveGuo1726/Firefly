import { createLiveContentService } from "../src/server/live-content/service.js";

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
		return env.ASSETS.fetch(request);
	},
};
