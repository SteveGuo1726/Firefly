import { getStore } from "@edgeone/pages-blob";
import { createLiveContentService } from "../../../src/server/live-content/service.js";
import { createDistributedContentLock } from "../../../src/server/live-content/distributed-lock.js";
import { edgeOneAtomicAuthStore, assertEdgeOneAtomicWrites } from "../../../src/server/admin-auth/edgeone-store.js";
import { createAdminSessionService } from "../../../src/server/admin-auth/session-service.js";
import { readAdminSessionId } from "../../../src/server/admin-auth/controller.js";

const STORE_NAME = "firefly-content-live";
const blob = getStore({ name: STORE_NAME, consistency: "strong" });

const oauthRawBlob = getStore({name:"firefly-auth-live",consistency:"strong"});
const oauthSessions = createAdminSessionService({
 store:edgeOneAtomicAuthStore(oauthRawBlob),
 adminLogin:process.env.FIREFLY_ADMIN_LOGIN||"SteveGuo1726",
});

const handle = createLiveContentService({
	distributedLock:{
  async acquire(keys){
   await assertEdgeOneAtomicWrites(blob);
   return createDistributedContentLock(blob).acquire(keys);
  },
 },
	authorizeSession: async request => {
  await assertEdgeOneAtomicWrites(oauthRawBlob);
  const session=await oauthSessions.verifySession(readAdminSessionId(request));
  return session?{ok:true,login:session.login}:{ok:false};
 },
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
