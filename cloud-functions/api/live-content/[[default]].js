import { getStore } from "@edgeone/pages-blob";
import { createLiveContentService } from "../../../src/server/live-content/service.js";
import { createDistributedContentLock } from "../../../src/server/live-content/distributed-lock.js";
import { edgeOneAtomicAuthStore, assertEdgeOneAtomicWrites } from "../../../src/server/admin-auth/edgeone-store.js";
import { createAdminSessionService } from "../../../src/server/admin-auth/session-service.js";
import { readAdminSessionId } from "../../../src/server/admin-auth/controller.js";

const STORE_NAME = "firefly-content-live";
const blob = getStore({ name: STORE_NAME, consistency: "strong" });

const oauthConfigured = Boolean(process.env.FIREFLY_OAUTH_CLIENT_ID && process.env.FIREFLY_OAUTH_CLIENT_SECRET && process.env.FIREFLY_OAUTH_CALLBACK_URL);
const oauthRawBlob = oauthConfigured ? getStore({name:"firefly-auth-live",consistency:"strong"}) : null;
const oauthSessions = oauthConfigured ? createAdminSessionService({
 store:edgeOneAtomicAuthStore(oauthRawBlob),
 adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726",
}) : null;

const handle = createLiveContentService({
	distributedLock:createDistributedContentLock(blob),
	authorizeSession: oauthSessions ? async request => {
  await assertEdgeOneAtomicWrites(oauthRawBlob);
  const session=await oauthSessions.verifySession(readAdminSessionId(request));
  return session?{ok:true,login:session.login}:{ok:false};
 } : undefined,
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
