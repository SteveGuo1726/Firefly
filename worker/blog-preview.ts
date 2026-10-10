import {
	createLiveContentService,
	loadLiveContentItem,
} from "../src/server/live-content/service.js";
import { livePostIdFromRequest, renderLivePostFallback } from "../src/server/live-content/render-live-post.js";
import {
 authorizePreviewSession, previewLogin, previewMe, previewLogout, previewMutationOriginAllowed
} from "../src/server/preview-auth.js";
import { buildPreviewPrivatePostIndex, publicPreviewIndexFallback } from "../src/server/preview-private-index.js";


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
				async listKeys(prefix) {
					const keys = [];
					let cursor;
					do {
						const page = await env.LIVE_CONTENT_PREVIEW.list({ prefix, cursor });
						keys.push(...page.keys.map((entry) => entry.name));
						cursor = page.list_complete ? undefined : page.cursor;
					} while (cursor);
					return keys;
				},
				deleteKey(key) {
					return env.LIVE_CONTENT_PREVIEW.delete(key);
				},
			},
			region() {
				return "cloudflare-preview";
			},
            authorizeSession: request => authorizePreviewSession(request,env),
		});
	}
	return cachedService;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
        const path=url.pathname;
        // Login and private CMS routes exist on the preview Worker only.
        if(path==="/api/preview-admin/login")
          return previewLogin(request,env);
        if(path==="/api/admin/auth/me")
          return previewMe(request,env);
        if(path==="/api/admin/auth/logout")
          return previewLogout(request);
        if(!previewMutationOriginAllowed(request) &&
           (path.startsWith("/api/live-content/") || path.startsWith("/api/admin/")))
          return new Response('{"error":"Origin mismatch"}',{status:403,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
        if(path==="/api/admin/private-index"){
          if(request.method!=="GET")return new Response("Method Not Allowed",{status:405});
          const auth=await authorizePreviewSession(request,env);
          if(!auth.ok)return new Response('{"error":"Unauthorized"}',{status:401,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
          try {
            const index=await buildPreviewPrivatePostIndex({
              token:env.FIREFLY_GITHUB_CONTENT_READ_TOKEN||"",
            });
            return new Response(JSON.stringify(index),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex"}});
          } catch(error) {
            // GitHub API may rate-limit shared Cloudflare egress IPs. A preview
            // editor should remain readable for PUBLIC posts without exposing
            // draft names or pretending the complete private index is healthy.
            console.warn("[Firefly preview] private GitHub index unavailable", error instanceof Error?error.message:"unknown");
            try {
              const resource=new URL("/api/admin-content-index.json",request.url);
              const publicResponse=await env.ASSETS.fetch(new Request(resource));
              if(!publicResponse.ok)throw new Error("public index missing");
              const published=await publicResponse.json();
              if(!Array.isArray(published?.posts))throw new Error("public index invalid");
              const safe=publicPreviewIndexFallback(published);
              return new Response(JSON.stringify(safe),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex"}});
            } catch {
              return new Response('{"error":"Private and public indexes unavailable"}',{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
            }
          }
        }
		if (url.pathname.startsWith("/api/live-content/")) {
			return getService(env)(request, { env, ctx });
		}
		if (url.pathname.startsWith("/posts/")) {
			// A published static page must never bypass a newer live draft, protection
			// flag, or tombstone. Check the overlay before serving bundled HTML.
			const id = livePostIdFromRequest(request);
			if (!id) return new Response("Not Found", { status: 404 });
			const rawPointer = await env.LIVE_CONTENT_PREVIEW.get(`v3/pointers/posts/${id}.json`);
			if (rawPointer) {
				const pointer = JSON.parse(rawPointer);
				if (!pointer || pointer.schemaVersion !== 3 || pointer.kind !== "post" ||
					pointer.id !== id || typeof pointer.revision !== "string" ||
					(!pointer.deleted && (!pointer.meta || typeof pointer.meta !== "object"))) {
					// An unreadable overlay is not permission to serve an older page.
					return new Response("Live post state unavailable", {
						status: 503,
						headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
					});
				}
				if (pointer.deleted || pointer.meta?.draft || pointer.meta?.protected) {
					return new Response("Not Found", {
						status: 404,
						headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
					});
				}
			}
			const asset = await env.ASSETS.fetch(request);
			if (asset.status !== 404) {
				if (!rawPointer) return asset;
				const headers = new Headers(asset.headers);
				headers.set("Cache-Control", "no-store");
				return new Response(asset.body, {
					status: asset.status, statusText: asset.statusText, headers,
				});
			}
			return renderLivePostFallback(request, {
				loadItem(id) {
					return loadLiveContentItem(
						{
							async getJSON(key) {
								const value = await env.LIVE_CONTENT_PREVIEW.get(key);
								return value ? JSON.parse(value) : null;
							},
						},
						"post",
						id,
					);
				},
				loadShell() {
					return env.ASSETS.fetch(new Request(new URL("/internal/live-post-shell/", request.url)));
				},
			});
		}
		return env.ASSETS.fetch(request);
	},
};
