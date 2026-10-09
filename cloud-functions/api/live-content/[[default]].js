import { getStore } from "@edgeone/pages-blob";
import { createLiveContentService } from "../../../src/server/live-content/service.js";

const STORE_NAME = "firefly-content-live";
const blob = getStore({ name: STORE_NAME, consistency: "strong" });

const handle = createLiveContentService({
	provider: "edgeone-blob",
	storeName: STORE_NAME,
	store: {
		getJSON(key) {
			return blob.get(key, { type: "json", consistency: "strong" });
		},
		setJSON(key, value) {
			return blob.setJSON(key, value);
		},
		async listKeys(prefix) {
			const { blobs } = await blob.list({ prefix, consistency: "strong" });
			return blobs.map((item) => item.key);
		},
		deleteKey(key) {
			return blob.delete(key);
		},
	},
	region(context) {
		return context.server?.region || null;
	},
});

export default async function onRequest(context) {
	return handle(context.request, context);
}
