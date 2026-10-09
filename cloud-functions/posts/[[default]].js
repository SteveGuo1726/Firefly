import { getStore } from "@edgeone/pages-blob";
import { renderLivePostFallback } from "../../src/server/live-content/render-live-post.js";
import { loadLiveContentItem } from "../../src/server/live-content/service.js";

const store = getStore({ name: "firefly-content-live", consistency: "strong" });

export default async function onRequest(context) {
	return renderLivePostFallback(context.request, {
		loadItem(id) {
			return loadLiveContentItem(
				{
					getJSON(key) {
						return store.get(key, { type: "json", consistency: "strong" });
					},
				},
				"post",
				id,
			);
		},
		loadShell() {
			return fetch(new URL("/internal/live-post-shell/", context.request.url));
		},
	});
}
