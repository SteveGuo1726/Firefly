import assert from "node:assert/strict";
import test from "node:test";
import { createLiveContentService } from "../src/server/live-content/service.js";
import { renderLivePostFallback } from "../src/server/live-content/render-live-post.js";

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
