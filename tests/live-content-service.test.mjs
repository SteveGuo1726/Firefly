import assert from "node:assert/strict";
import test from "node:test";
import { createLiveContentService } from "../src/server/live-content/service.js";
import { renderLivePostFallback } from "../src/server/live-content/render-live-post.js";
import previewWorker from "../worker/blog-preview.ts";


test("preview worker blocks static HTML when a newer live post is hidden or deleted", async () => {
 const pointerKey = "v3/pointers/posts/secret.json";
 let assetReads = 0;
 let pointer = null;
 const env = {
  LIVE_CONTENT_PREVIEW: {
   async get(key) { return key === pointerKey && pointer ? JSON.stringify(pointer) : null; },
  },
  ASSETS: {
   async fetch() { assetReads++; return new Response("STATIC PRIVATE CONTENT", { status: 200 }); },
  },
 };
 const url = request("/posts/secret/");
 for (const state of [{deleted:true},{meta:{draft:true}},{meta:{protected:true}}]) {
  pointer = {schemaVersion:3,kind:"post",id:"secret",revision:"test",meta:{},...state};
  const res = await previewWorker.fetch(url, env, {});
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex");
  assert.equal(assetReads, 0, "hidden content must not read or serve the static page");
 }
 pointer = {schemaVersion:3,kind:"post",id:"secret",revision:"test",meta:{title:"Public"}};
 const publicResponse=await previewWorker.fetch(url, env, {});
 assert.equal(publicResponse.status, 200);
 assert.equal(publicResponse.headers.get("Cache-Control"),"no-store");
 assert.equal(assetReads, 1);
 pointer = {schemaVersion:2,kind:"post",id:"secret",revision:"test",meta:{}};
 assert.equal((await previewWorker.fetch(url, env, {})).status, 503);
 assert.equal(assetReads, 1, "malformed state must fail closed");
 pointer = null;
 assert.equal((await previewWorker.fetch(url, env, {})).status, 200);
 assert.equal(assetReads, 2);
});
test("preview worker applies hidden post checks to direct index.html asset URLs", async () => {
 let assetReads = 0;
 const env={
  LIVE_CONTENT_PREVIEW:{
   async get(key){
    assert.equal(key,"v3/pointers/posts/secret.json");
    return JSON.stringify({schemaVersion:3,kind:"post",id:"secret",revision:"r1",
     deleted:true,meta:{}});
   },
  },
  ASSETS:{async fetch(){assetReads++;return new Response("EXPOSED STATIC BODY");}},
 };
 for(const path of ["/posts/secret/","/posts/secret/index.html"]) {
  const response=await previewWorker.fetch(request(path),env,{});
  assert.equal(response.status,404,path);
 }
 assert.equal(assetReads,0);
});

test("preview worker fails closed when live visibility storage is unavailable", async () => {
 let assetReads = 0;
 const env = {
  LIVE_CONTENT_PREVIEW: {async get(){ throw new Error("KV unavailable"); }},
  ASSETS: {async fetch(){ assetReads++; return new Response("secret"); }},
 };
 await assert.rejects(previewWorker.fetch(request("/posts/secret/"), env, {}), /KV unavailable/);
 assert.equal(assetReads, 0);
});

function clone(value) {
	return value == null ? value : structuredClone(value);
}

function makeStore() {
	const data = new Map();
	return {
		data,
		async getJSON(key) {
			return clone(data.get(key) ?? null);
		},
		async setJSON(key, value) {
			data.set(key, clone(value));
		},
		async listKeys(prefix) {
			return [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
		},
		async deleteKey(key) {
			data.delete(key);
		},
	};
}

function request(path, init = {}) {
	return new Request("https://preview.example" + path, init);
}

function adminHeaders() {
	return {
		Authorization: "Bearer test-token",
		"Content-Type": "application/json",
	};
}

function createService(store) {
	return createLiveContentService({
		store,
		provider: "test",
		storeName: "test-store",
		authorize: async () => ({ ok: true }),
	});
}

test("live content CRUD is public-safe and revision protected", async () => {
	const store = makeStore();
	const handle = createService(store);
	const createResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "hello",
			path: "src/content/posts/hello.md",
			source: "---\ntitle: Hello\n---\nsecret source",
			meta: { title: "Hello", html: "<p>Hello</p>", draft: false },
			baseGitSha: "",
			baseGitBranch: "ai/preview-test",
		}),
	}));
	assert.equal(createResponse.status, 200);
	const created = await createResponse.json();
	assert.ok(created.revision);

	const publicItemResponse = await handle(
		request("/api/live-content/item?kind=post&id=hello"),
	);
	assert.equal(publicItemResponse.status, 200);
	const publicItem = await publicItemResponse.json();
	assert.equal(publicItem.meta.title, "Hello");
	assert.equal("source" in publicItem, false);
	assert.equal("path" in publicItem, false);
	assert.equal("baseGitSha" in publicItem, false);
	assert.equal("updatedBy" in publicItem, false);

	const staleResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "hello",
			path: "src/content/posts/hello.md",
			source: "stale",
			meta: { title: "Stale", html: "<p>Stale</p>" },
			expectedRevision: "wrong",
		}),
	}));
	assert.equal(staleResponse.status, 409);

	const updateResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "hello",
			path: "src/content/posts/hello.md",
			source: "fresh",
			meta: { title: "Fresh", html: "<p>Fresh</p>" },
			expectedRevision: created.revision,
		}),
	}));
	assert.equal(updateResponse.status, 200);
	const updated = await updateResponse.json();
	assert.notEqual(updated.revision, created.revision);

	const staleDelete = await handle(request(
		"/api/live-content/item?kind=post&id=hello",
		{
			method: "DELETE",
			headers: adminHeaders(),
			body: JSON.stringify({
				path: "src/content/posts/hello.md",
				expectedRevision: created.revision,
			}),
		},
	));
	assert.equal(staleDelete.status, 409);

	const deleteResponse = await handle(request(
		"/api/live-content/item?kind=post&id=hello",
		{
			method: "DELETE",
			headers: adminHeaders(),
			body: JSON.stringify({
				path: "src/content/posts/hello.md",
				expectedRevision: updated.revision,
			}),
		},
	));
	assert.equal(deleteResponse.status, 200);
	const gone = await handle(request("/api/live-content/item?kind=post&id=hello"));
	assert.equal(gone.status, 410);
});

test("public post index only exposes minimal markers for hidden static overlays", async () => {
	const store = makeStore();
	const handle = createService(store);

	async function create(id, meta) {
		const response = await handle(request("/api/live-content/item", {
			method: "PUT",
			headers: adminHeaders(),
			body: JSON.stringify({
				kind: "post",
				id,
				path: `src/content/posts/${id}.md`,
				source: id,
				meta,
			}),
		}));
		assert.equal(response.status, 200);
		return response.json();
	}
	function markStatic(id) {
		const key = `v3/pointers/posts/${id}.json`;
		const pointer = store.data.get(key);
		store.data.set(key, { ...pointer, baseGitSha: "git-sha", baseGitBranch: "ai/preview-test" });
	}

	await create("public", { title: "Public", html: "<p>ok</p>" });
	await create("new-draft", { title: "New secret draft", html: "<p>secret</p>", draft: true });

	const draftBase = await create("static-draft", { title: "Visible first", html: "<p>old</p>" });
	markStatic("static-draft");
	assert.equal((await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post", id: "static-draft", path: "src/content/posts/static-draft.md",
			source: "draft", meta: { title: "Secret draft", html: "<p>secret</p>", draft: true },
			baseGitSha: "git-sha", baseGitBranch: "ai/preview-test", expectedRevision: draftBase.revision,
		}),
	}))).status, 200);

	const protectedBase = await create("static-protected", { title: "Visible first", html: "<p>old</p>" });
	markStatic("static-protected");
	assert.equal((await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post", id: "static-protected", path: "src/content/posts/static-protected.md",
			source: "protected", meta: { title: "Protected secret", html: "<p>secret</p>", protected: true },
			baseGitSha: "git-sha", baseGitBranch: "ai/preview-test", expectedRevision: protectedBase.revision,
		}),
	}))).status, 200);

	const response = await handle(request("/api/live-content/index?kind=post"));
	const payload = await response.json();
	const byId = new Map(payload.entries.map((entry) => [entry.id, entry]));
	assert.equal(byId.has("new-draft"), false);
	assert.equal(byId.get("public").meta.title, "Public");
	assert.equal("html" in byId.get("public").meta, false);
	assert.equal("path" in byId.get("public"), false);
	assert.equal("baseGitSha" in byId.get("public"), false);
	assert.equal(byId.get("static-draft").hidden, true);
	assert.equal("meta" in byId.get("static-draft"), false);
	assert.equal(byId.get("static-protected").hidden, true);
	assert.equal("meta" in byId.get("static-protected"), false);
});

test("public tombstones only expose markers needed to remove static cards", async () => {
	const store = makeStore();
	const handle = createService(store);

	async function saveAndDelete(id, staticGit) {
		const save = await handle(request("/api/live-content/item", {
			method: "PUT",
			headers: adminHeaders(),
			body: JSON.stringify({ kind: "post", id, path: `src/content/posts/${id}.md`, source: id, meta: { title: id, html: `<p>${id}</p>` } }),
		}));
		assert.equal(save.status, 200);
		const saved = await save.json();
		if (staticGit) {
			const key = `v3/pointers/posts/${id}.json`;
			const pointer = store.data.get(key);
			store.data.set(key, { ...pointer, baseGitSha: "git-sha", baseGitBranch: "ai/preview-test" });
		}
		const remove = await handle(request(`/api/live-content/item?kind=post&id=${id}`, {
			method: "DELETE",
			headers: adminHeaders(),
			body: JSON.stringify({
				path: `src/content/posts/${id}.md`,
				baseGitSha: staticGit ? "git-sha" : "",
				baseGitBranch: staticGit ? "ai/preview-test" : "",
				expectedRevision: saved.revision,
			}),
		}));
		assert.equal(remove.status, 200);
	}

	await saveAndDelete("static-delete", true);
	await saveAndDelete("live-delete", false);
	const response = await handle(request("/api/live-content/index?kind=post"));
	const payload = await response.json();
	assert.deepEqual(payload.entries.map((entry) => entry.id), ["static-delete"]);
	assert.equal(payload.entries[0].deleted, true);
	assert.equal("meta" in payload.entries[0], false);
	assert.equal("baseGitSha" in payload.entries[0], false);
});

test("dynamic metadata stays available to public overlay", async () => {
	const store = makeStore();
	const handle = createService(store);
	const response = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "dynamic",
			id: "2026-10-09-220000",
			path: "src/content/dynamic/2026-10-09-220000.md",
			source: "hello",
			meta: {
				published: "2026-10-09 22:00:00",
				html: "<p>hello</p>",
				searchText: "hello",
				images: [],
			},
		}),
	}));
	assert.equal(response.status, 200);
	const indexResponse = await handle(
		request("/api/live-content/index?kind=dynamic"),
	);
	const index = await indexResponse.json();
	assert.equal(index.entries[0].meta.html, "<p>hello</p>");
});

test("missing static post can render from live content shell", async () => {
	const response = await renderLivePostFallback(
		request("/posts/live-only/"),
		{
			loadItem: async () => ({
				id: "live-only",
				revision: "rev-1",
				meta: {
					title: "Live only",
					description: "desc",
					published: "2026-10-09",
					category: "test",
					tags: ["a", "b"],
					html: "<p>live body</p>",
				},
			}),
			loadShell: async () => new Response(
				'<html><head><title>__LIVE_POST_TITLE__</title><meta data-live-shell-robots></head><body><!--LIVE_POST_CONTENT--></body></html>',
				{ status: 200 },
			),
		},
	);
	assert.equal(response.status, 200);
	const html = await response.text();
	assert.match(html, /Live only/);
	assert.match(html, /live body/);
	assert.equal(response.headers.get("X-Firefly-Live-Post"), "rev-1");
});


test("public draft overlay signals static pages to hide", async () => {
	const store = makeStore();
	const handle = createService(store);
	const save = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "draft-live",
			path: "src/content/posts/draft-live.md",
			source: "draft body",
			meta: { title: "Draft", html: "<p>draft</p>", draft: true },
		}),
	}));
	assert.equal(save.status, 200);
	const publicItem = await handle(
		request("/api/live-content/item?kind=post&id=draft-live"),
	);
	assert.equal(publicItem.status, 410);
	const payload = await publicItem.json();
	assert.equal(payload.hidden, true);
});


test("live post fallback respects comment switch", async () => {
	const shell = '<html><body><!--LIVE_POST_CONTENT--><div data-live-post-comments-boundary="start"></div><div id="post-comments">__LIVE_POST_COMMENT_PATH__</div><div data-live-post-comments-boundary="end"></div></body></html>';
	const hidden = await renderLivePostFallback(
		request("/posts/no-comments/"),
		{
			loadItem: async () => ({
				id: "no-comments",
				revision: "r1",
				meta: { title: "No comments", html: "<p>body</p>", comment: false },
			}),
			loadShell: async () => new Response(shell, { status: 200 }),
		},
	);
	assert.doesNotMatch(await hidden.text(), /post-comments/);

	const visible = await renderLivePostFallback(
		request("/posts/with-comments/"),
		{
			loadItem: async () => ({
				id: "with-comments",
				revision: "r2",
				meta: { title: "With comments", html: "<p>body</p>", comment: true },
			}),
			loadShell: async () => new Response(shell, { status: 200 }),
		},
	);
	const html = await visible.text();
	assert.match(html, /post-comments/);
	assert.match(html, /\/posts\/with-comments/);
	assert.doesNotMatch(html, /data-live-post-comments-boundary/);
});


test("rename rolls back the new pointer when the old tombstone write fails", async () => {
	const store = makeStore();
	const handle = createService(store);

	const createResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "before",
			path: "src/content/posts/before.md",
			source: "before source",
			meta: { title: "Before", html: "<p>before</p>" },
		}),
	}));
	assert.equal(createResponse.status, 200);
	const created = await createResponse.json();

	const originalSetJSON = store.setJSON;
	store.setJSON = async (key, value) => {
		if (key === "v3/pointers/posts/before.json" && value?.deleted) {
			throw new Error("simulated old pointer failure");
		}
		return originalSetJSON(key, value);
	};

	const renameResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "after",
			path: "src/content/posts/after.md",
			source: "after source",
			meta: { title: "After", html: "<p>after</p>" },
			expectedRevision: created.revision,
			previousId: "before",
			previousPath: "src/content/posts/before.md",
		}),
	}));
	assert.equal(renameResponse.status, 500);

	store.setJSON = originalSetJSON;
	const oldVisible = await handle(request("/api/live-content/item?kind=post&id=before"));
	assert.equal(oldVisible.status, 200);
	assert.equal((await oldVisible.json()).meta.title, "Before");

	const newVisible = await handle(request("/api/live-content/item?kind=post&id=after"));
	assert.equal(newVisible.status, 404);
});

test("revision pointer keeps old content visible when pointer commit fails", async () => {
	const store = makeStore();
	const handle = createService(store);

	const firstResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "atomic",
			path: "src/content/posts/atomic.md",
			source: "v1 source",
			meta: { title: "V1", html: "<p>v1</p>" },
		}),
	}));
	assert.equal(firstResponse.status, 200);
	const first = await firstResponse.json();

	const originalSetJSON = store.setJSON;
	store.setJSON = async (key, value) => {
		if (key === "v3/pointers/posts/atomic.json") {
			throw new Error("simulated pointer failure");
		}
		return originalSetJSON(key, value);
	};

	const failedResponse = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "atomic",
			path: "src/content/posts/atomic.md",
			source: "v2 source",
			meta: { title: "V2", html: "<p>v2</p>" },
			expectedRevision: first.revision,
		}),
	}));
	assert.equal(failedResponse.status, 500);

	store.setJSON = originalSetJSON;
	const visible = await handle(
		request("/api/live-content/item?kind=post&id=atomic", {
			headers: { Authorization: "Bearer test-token" },
		}),
	);
	assert.equal(visible.status, 200);
	const payload = await visible.json();
	assert.equal(payload.source, "v1 source");
	assert.equal(payload.revision, first.revision);
});


test("archive export includes source and requires an authorized repository writer", async () => {
	const store = makeStore();
	const handle = createService(store);
	const save = await handle(request("/api/live-content/item", {
		method: "PUT",
		headers: adminHeaders(),
		body: JSON.stringify({
			kind: "post",
			id: "archive-me",
			path: "src/content/posts/archive-me.md",
			source: "---\ntitle: Archive Me\n---\nbody",
			meta: { title: "Archive Me", html: "<p>body</p>" },
		}),
	}));
	assert.equal(save.status, 200);

	const unauthorized = await handle(
		request("/api/live-content/archive-export"),
	);
	assert.equal(unauthorized.status, 401);

	const response = await handle(
		request("/api/live-content/archive-export", {
			headers: { Authorization: "Bearer test-token" },
		}),
	);
	assert.equal(response.status, 200);
	const payload = await response.json();
	assert.equal(payload.posts.length, 1);
	assert.equal(payload.posts[0].source, "---\ntitle: Archive Me\n---\nbody");
});


test("different items can save concurrently without losing each other's pointers", async () => {
	const store = makeStore();
	const originalSetJSON = store.setJSON;
	store.setJSON = async (key, value) => {
		if (key.includes("/pointers/")) {
			await new Promise((resolve) => setTimeout(resolve, key.includes("alpha") ? 20 : 5));
		}
		return originalSetJSON(key, value);
	};
	const handle = createService(store);

	const [alpha, beta] = await Promise.all([
		handle(request("/api/live-content/item", {
			method: "PUT",
			headers: adminHeaders(),
			body: JSON.stringify({
				kind: "post",
				id: "alpha",
				path: "src/content/posts/alpha.md",
				source: "alpha",
				meta: { title: "Alpha", html: "<p>alpha</p>" },
			}),
		})),
		handle(request("/api/live-content/item", {
			method: "PUT",
			headers: adminHeaders(),
			body: JSON.stringify({
				kind: "post",
				id: "beta",
				path: "src/content/posts/beta.md",
				source: "beta",
				meta: { title: "Beta", html: "<p>beta</p>" },
			}),
		})),
	]);
	assert.equal(alpha.status, 200);
	assert.equal(beta.status, 200);

	const indexResponse = await handle(request("/api/live-content/index?kind=post"));
	assert.equal(indexResponse.status, 200);
	const payload = await indexResponse.json();
	assert.deepEqual(payload.entries.map((entry) => entry.id).sort(), ["alpha", "beta"]);
});


test("simultaneous v3 writes to different items remain visible and private", async () => {
 const store=makeStore(), handle=createService(store);
 const create=async(id)=>handle(request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),
  body:JSON.stringify({kind:"post",id,path:"src/content/posts/"+id+".md",
   source:"private "+id,meta:{title:id,html:"<p>"+id+"</p>"}}),
 }));
 const responses=await Promise.all(["batch-a","batch-b","batch-c","batch-d"].map(create));
 assert.deepEqual(responses.map(x=>x.status),[200,200,200,200]);
 const index=await (await handle(request("/api/live-content/index?kind=post"))).json();
 for(const id of ["batch-a","batch-b","batch-c","batch-d"]){
  assert.ok(index.entries.find(x=>x.id===id));
  const publicDocument=await (await handle(request("/api/live-content/item?kind=post&id="+id))).json();
  assert.equal("source" in publicDocument,false);
 }
});

test("rename to an occupied v3 item refuses overwrite and preserves both pointers",async()=>{
 const store=makeStore(),handle=createService(store);
 const save=async (id,extra={})=>handle(request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),
  body:JSON.stringify({kind:"post",id,path:"src/content/posts/"+id+".md",source:id,
   meta:{title:id,html:"<p>"+id+"</p>"},...extra}),
 }));
 const a=await save("rename-source"), b=await save("rename-target");
 assert.equal(a.status,200);assert.equal(b.status,200);
 const aRevision=(await a.json()).revision;
 const rejected=await save("rename-target",{
  previousId:"rename-source",previousPath:"src/content/posts/rename-source.md",
  expectedRevision:aRevision,
 });
 assert.equal(rejected.status,409);
 for(const id of ["rename-source","rename-target"]){
  const response=await handle(request("/api/live-content/item?kind=post&id="+id));
  assert.equal(response.status,200);
 }
});


test("same-item simultaneous updates serialize and reject a stale revision",async()=>{
 const store=makeStore(),handle=createService(store);
 const req=(source,expectedRevision)=>request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),body:JSON.stringify({
   kind:"post",id:"race",path:"src/content/posts/race.md",source,
   meta:{title:source,html:"<p>"+source+"</p>"},
   ...(expectedRevision?{expectedRevision}:{}),
  }),
 });
 const created=await handle(req("original"));
 assert.equal(created.status,200);
 const revision=(await created.json()).revision;
 const [a,b]=await Promise.all([handle(req("writer-a",revision)),handle(req("writer-b",revision))]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);
 const item=await handle(request("/api/live-content/item?kind=post&id=race",{headers:adminHeaders()}));
 assert.equal(item.status,200);
 assert.ok(["writer-a","writer-b"].includes((await item.json()).source));
});

test("same-item concurrent initial creates cannot silently overwrite",async()=>{
 const store=makeStore(),handle=createService(store);
 const save=(source)=>handle(request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),body:JSON.stringify({
   kind:"post",id:"new-race",path:"src/content/posts/new-race.md",
   source,meta:{title:source,html:"<p>test</p>"},
  }),
 }));
 const result=await Promise.all([save("a"),save("b")]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
});


test("a failed pointer write releases the per-item mutation lock",async()=>{
 const store=makeStore(), original=store.setJSON;
 let failOnce=true;
 store.setJSON=async(key,value)=>{
  if(failOnce && key==="v3/pointers/posts/recover.json"){
   failOnce=false;
   throw new Error("simulated pointer outage");
  }
  return original(key,value);
 };
 const handle=createService(store);
 const save=(source)=>handle(request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),body:JSON.stringify({
   kind:"post",id:"recover",path:"src/content/posts/recover.md",
   source,meta:{title:source,html:"<p>ok</p>"},
  }),
 }));
 const first=await save("first");
 assert.equal(first.status,500);
 const second=await Promise.race([
  save("recovered"),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error("mutation lock deadlocked")),2000)),
 ]);
 assert.equal(second.status,200);
 const item=await handle(request("/api/live-content/item?kind=post&id=recover",{headers:adminHeaders()}));
 assert.equal((await item.json()).source,"recovered");
});


test("new live article publishes, updates, hides, restores and deletes without a build",async()=>{
 const store=makeStore(),handle=createService(store);
 const id="no-build-article";
 const put=async(title,expectedRevision="",draft=false)=>{
  const response=await handle(request("/api/live-content/item",{
   method:"PUT",headers:adminHeaders(),
   body:JSON.stringify({kind:"post",id,path:"src/content/posts/"+id+".md",
    source:"---\ntitle: "+title+"\n---\n"+title,
    meta:{title,description:title+" description",searchText:title,
     published:"2026-10-10",html:"<p>"+title+"</p>",draft},
    expectedRevision}),
  }));
  return {status:response.status,payload:await response.json()};
 };
 const index=async()=> (await (await handle(request("/api/live-content/index?kind=post"))).json()).entries;
 const shell=()=>renderLivePostFallback(
  request("/posts/no-build-article/"),
  {loadItem:async()=> {
   const pointer=await store.getJSON("v3/pointers/posts/"+id+".json");
   return pointer?.deleted?null:store.getJSON("v3/items/posts/"+id+"/"+pointer.revision+".json");
  },loadShell:async()=>new Response(
   "<html><title>__LIVE_POST_TITLE__</title><!--LIVE_POST_CONTENT--></html>",{status:200})},
 );
 const created=await put("Version one");
 assert.equal(created.status,200);
 assert.ok((await index()).some(x=>x.id===id));
 assert.match(await (await shell()).text(),/Version one/);
 const updated=await put("Version two",created.payload.revision);
 assert.equal(updated.status,200);
 assert.match(await (await shell()).text(),/Version two/);
 const hidden=await put("Private",updated.payload.revision,true);
 assert.equal(hidden.status,200);
 assert.ok(!(await index()).some(x=>x.id===id));
 assert.equal((await shell()).status,404);
 const restored=await put("Restored",hidden.payload.revision);
 assert.equal(restored.status,200);
 assert.ok((await index()).some(x=>x.id===id));
 assert.match(await (await shell()).text(),/Restored/);
 const deletion=await handle(request("/api/live-content/item?kind=post&id="+id,{
  method:"DELETE",headers:adminHeaders(),
  body:JSON.stringify({path:"src/content/posts/"+id+".md",expectedRevision:restored.payload.revision}),
 }));
 assert.equal(deletion.status,200);
 assert.ok(!(await index()).some(x=>x.id===id));
 assert.equal((await shell()).status,404);
 assert.equal((await handle(request("/api/live-content/item?kind=post&id="+id))).status,410);
});

test("invalid percent encodings and control bytes do not crash live post routing",async()=>{
 const {livePostIdFromRequest}=await import("../src/server/live-content/render-live-post.js");
 for(const path of ["/posts/%ZZ/","/posts/%E0%A4%A/","/posts/%00/","/posts/%7F/","/posts/%2e%2e/"]){
  assert.equal(livePostIdFromRequest(request(path)),null,path);
 }
 assert.equal(livePostIdFromRequest(request("/posts/valid/child/")),"valid/child");
});

test("authenticated history and restore preserve revisions and reject stale restores",async()=>{
 const store=makeStore(),handle=createService(store),id="history-check";
 const put=(title,expectedRevision="")=>handle(request("/api/live-content/item",{
  method:"PUT",headers:adminHeaders(),body:JSON.stringify({
   kind:"post",id,path:"src/content/posts/history-check.md",
   source:"---\ntitle: "+title+"\n---\n"+title,
   meta:{title,html:"<p>"+title+"</p>"},expectedRevision,
  }),
 }));
 const created=await (await put("Old")).json();
 const updated=await (await put("New",created.revision)).json();
 assert.equal((await handle(request("/api/live-content/history?kind=post&id="+id))).status,401);
 const listResponse=await handle(request("/api/live-content/history?kind=post&id="+id,{headers:adminHeaders()}));
 assert.equal(listResponse.status,200);
 const list=(await listResponse.json()).entries;
 assert.ok(list.some(x=>x.revision===created.revision));
 assert.ok(list.some(x=>x.revision===updated.revision));
 assert.equal(list.some(x=>"source" in x),false);
 const restore=(expectedRevision)=>handle(request("/api/live-content/restore",{
  method:"POST",headers:adminHeaders(),
  body:JSON.stringify({kind:"post",id,revision:created.revision,expectedRevision}),
 }));
 assert.equal((await restore("bad-revision")).status,409);
 const restored=await restore(updated.revision);
 assert.equal(restored.status,200);
 const restoredItem=await (await handle(request("/api/live-content/item?kind=post&id="+id,{headers:adminHeaders()}))).json();
 assert.equal(restoredItem.source.includes("Old"),true);
 assert.notEqual(restoredItem.revision,created.revision);
 assert.equal((await restore(updated.revision)).status,409);
 const del=await handle(request("/api/live-content/item?kind=post&id="+id,{
  method:"DELETE",headers:adminHeaders(),body:JSON.stringify({expectedRevision:restoredItem.revision}),
 }));
 assert.equal(del.status,200);
 const tombstone=(await del.json()).revision;
 assert.equal((await restore(tombstone)).status,200);
 assert.equal((await handle(request("/api/live-content/item?kind=post&id="+id))).status,200);
});

test("Git-only tombstone undo requires current revision and unchanged source baseline",async()=>{
 const store=makeStore(),handle=createService(store),id="git-only-restore";
 const key="v3/pointers/posts/"+id+".json";
 store.data.set(key,{schemaVersion:3,kind:"post",id,path:"src/content/posts/git-only-restore.md",
  meta:{title:"Git post"},baseGitSha:"expected-git-sha",baseGitBranch:"ai/preview-test",
  revision:"00000000-0000-4000-8000-000000000001",deleted:true,updatedAt:new Date().toISOString()});
 const undo=expectedRevision=>handle(request("/api/live-content/undo-delete",{
  method:"POST",headers:adminHeaders(),body:JSON.stringify({kind:"post",id,expectedRevision}),
 }));
 assert.equal((await undo("stale")).status,409);
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({sha:"different-sha"}),{status:200});
  assert.equal((await undo("00000000-0000-4000-8000-000000000001")).status,409);
  globalThis.fetch=async()=>new Response(JSON.stringify({sha:"expected-git-sha"}),{status:200});
  const response=await undo("00000000-0000-4000-8000-000000000001");
  assert.equal(response.status,200);
  assert.equal((await response.json()).restoredGitBaseline,true);
  assert.equal(store.data.has(key),false);
 }finally{globalThis.fetch=originalFetch;}
});

test("verified OAuth cookie can edit while anonymous users cannot obtain source",async()=>{
 const store=makeStore();
 const handle=createLiveContentService({
  store,provider:"test",storeName:"test-store",
  authorizeSession:async request=>({
   ok:request.headers.get("Cookie")==="__Host-firefly-admin=valid-session",
   login:"SteveGuo1726",
  }),
 });
 const cookie={Cookie:"__Host-firefly-admin=valid-session","Content-Type":"application/json"};
 const payload={
  kind:"post",id:"oauth-only",path:"src/content/posts/oauth-only.md",
  source:"---\ntitle: OAuth only\n---\nprivate draft",meta:{title:"OAuth only",html:"<p>Hello</p>"},
 };
 const unauthorized=await handle(request("/api/live-content/item",{
  method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
 }));
 assert.equal(unauthorized.status,401);
 const created=await handle(request("/api/live-content/item",{
  method:"PUT",headers:cookie,body:JSON.stringify(payload),
 }));
 assert.equal(created.status,200);
 const publicItem=await (await handle(request("/api/live-content/item?kind=post&id=oauth-only"))).json();
 assert.equal("source" in publicItem,false);
 const adminItem=await (await handle(request("/api/live-content/item?kind=post&id=oauth-only",{headers:cookie}))).json();
 assert.equal(adminItem.source,payload.source);
 const adminIndex=await (await handle(request("/api/live-content/index?kind=post",{headers:cookie}))).json();
 assert.equal(adminIndex.entries[0].path,payload.path);
});

test("distributed mutation locks prevent writes when another instance owns the document",async()=>{
 const store=makeStore();
 const calls=[];
 let held=false;
 const handle=createLiveContentService({
  store,provider:"test",storeName:"test-store",
  authorize:async()=>({ok:true}),
  distributedLock:{
   async acquire(keys){
    calls.push([...keys]);
    if(held){
     const error=new Error("other region owns lock");
     error.code="CONTENT_LOCK_BUSY";
     throw error;
    }
    held=true;
    return async()=>{held=false;};
   },
  },
 });
 const payload={kind:"post",id:"concurrent",path:"src/content/posts/concurrent.md",source:"---\ntitle: Concurrent\n---\ntext",meta:{title:"Concurrent"}};
 const first=await handle(request("/api/live-content/item",{method:"PUT",headers:adminHeaders(),body:JSON.stringify(payload)}));
 assert.equal(first.status,200);
 assert.deepEqual(calls[0],["post:concurrent"]);
 held=true;
 const conflict=await handle(request("/api/live-content/item",{method:"PUT",headers:adminHeaders(),body:JSON.stringify({...payload,source:"should not overwrite"})}));
 assert.equal(conflict.status,409);
 assert.match((await conflict.json()).error,/其他节点/);
 const saved=await handle(request("/api/live-content/item?kind=post&id=concurrent"));
 assert.equal((await saved.json()).meta.title,"Concurrent");
});

test("backup export fails closed when a pointer references a missing immutable revision",async()=>{
 const store=makeStore();
 const handle=createLiveContentService({store,provider:"test",storeName:"test-store",authorize:async()=>({ok:true})});
 const saved=await handle(request("/api/live-content/item",{method:"PUT",headers:adminHeaders(),body:JSON.stringify({
  kind:"post",id:"backup-corrupt",path:"src/content/posts/backup-corrupt.md",
  source:"---\ntitle: Backup\n---\nBody",meta:{title:"Backup"}
 })}));
 assert.equal(saved.status,200);
 const record=await saved.json();
 await store.deleteKey("v3/items/posts/backup-corrupt/"+record.revision+".json");
 const backup=await handle(request("/api/live-content/export",{headers:adminHeaders()}));
 assert.notEqual(backup.status,200);
});

test("backup contains previous immutable versions and current pointer without omitting history",async()=>{
 const store=makeStore(),handle=createService(store);
 const create=await handle(request("/api/live-content/item",{method:"PUT",headers:adminHeaders(),body:JSON.stringify({
  kind:"post",id:"history-export",path:"src/content/posts/history-export.md",
  source:"---\ntitle: First\n---\nFirst",meta:{title:"First"}
 })}));
 assert.equal(create.status,200);
 const first=await create.json();
 const update=await handle(request("/api/live-content/item",{method:"PUT",headers:adminHeaders(),body:JSON.stringify({
  kind:"post",id:"history-export",path:"src/content/posts/history-export.md",
  source:"---\ntitle: Second\n---\nSecond",meta:{title:"Second"},expectedRevision:first.revision
 })}));
 assert.equal(update.status,200);
 const exported=await handle(request("/api/live-content/export",{headers:adminHeaders()}));
 assert.equal(exported.status,200);
 const backup=await exported.json();
 assert.equal(backup.posts.length,1);
 assert.equal(backup.history.filter(x=>x.id==="history-export").length,2);
 assert.ok(backup.history.some(x=>x.revision===first.revision&&x.source.includes("First")));
});


test("backup export rejects corrupt pointers rather than silently dropping content", async () => {
 const store=makeStore(),handle=createService(store);
 store.data.set("v3/pointers/posts/secret.json",{
  schemaVersion:3,kind:"post",id:"secret",revision:"missing",
  path:"src/content/posts/../secret.md",deleted:false,
 });
 const backup=await handle(request("/api/live-content/export",{headers:adminHeaders()}));
 assert.equal(backup.status,500);
});

test("backup export rejects mismatched immutable revision keys", async () => {
 const store=makeStore(),handle=createService(store);
 store.data.set("v3/items/posts/wrong/11111111-1111-4111-8111-111111111111.json",{
  schemaVersion:3,kind:"post",id:"another",
  revision:"11111111-1111-4111-8111-111111111111",
  path:"src/content/posts/another.md",source:"secret",deleted:false,
 });
 const backup=await handle(request("/api/live-content/export",{headers:adminHeaders()}));
 assert.equal(backup.status,500);
});
