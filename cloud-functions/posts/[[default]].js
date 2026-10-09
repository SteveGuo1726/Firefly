import { getStore } from "@edgeone/pages-blob";
import { renderLivePostFallback } from "../../src/server/live-content/render-live-post.js";

const store = getStore({ name: "firefly-content-live", consistency: "strong" });

export default async function onRequest(context) {
	return renderLivePostFallback(context.request, {
		loadItem(id) {
			return store.get(`v1/posts/${id}.json`, {
				type: "json",
				consistency: "strong",
			});
		},
		loadShell() {
			return fetch(new URL("/internal/live-post-shell/", context.request.url));
		},
	});
}
