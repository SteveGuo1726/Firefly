import test from "node:test";
import assert from "node:assert/strict";
import { createCms, createMemoryStore } from "../src/server/live-cms.mjs";
import { overlayPublicDynamic } from "../src/server/live-dynamic-feed.mjs";
import { resolvePublicPost } from "../src/server/post-resolver.mjs";
import { issueSession, SESSION_COOKIE } from "../src/server/auth.mjs";
import { onRequest as capabilities } from "../cloud-functions/api/firefly/capabilities.js";
import { onRequest as content } from "../cloud-functions/api/firefly/content.js";
import { onRequest as legacy } from "../cloud-functions/api/live-content.js";
import { onRequest as adminIndex } from "../cloud-functions/api/admin-content-index.json.js";
import { onRequest as adminPrivate } from "../cloud-functions/api/admin/private-index.js";
import { onRequest as preview } from "../cloud-functions/api/firefly/preview.js";
import { onRequest as settings } from "../cloud-functions/api/firefly/settings.js";
import { onRequest as gallery } from "../cloud-functions/api/firefly/gallery.js";
import { onRequest as backup } from "../cloud-functions/api/firefly/backup.js";
import { onRequest as imagebed } from "../cloud-functions/api/firefly/imagebed.js";
import { onRequest as fileHandler } from "../cloud-functions/file/[[...path]].js";

const origin = "https://preview.edgeone.cool";
const env = {
	FIREFLY_ADMIN_SESSION_KEY: "test-session-key-".repeat(4),
	FIREFLY_ENABLE_WRITES: "1",
	FIREFLY_SERIALIZED_WRITES_ACK: "1",
};
const cookie = SESSION_COOKIE + "=" + issueSession(env.FIREFLY_ADMIN_SESSION_KEY);

function req(path, method = "GET", authenticated = false, options = {}) {
	const headers = {
		...(authenticated ? { cookie } : {}),
		...(method !== "GET" ? { origin, "x-firefly-cms": "1" } : {}),
		...(options.headers || {}),
	};
	return new Request(origin + path, {
		method,
		headers,
		...(options.body === undefined ? {} : { body: options.body }),
	});
}
const run = (handler, path, method = "GET", authenticated = false, options = {}) =>
	handler({ request: req(path, method, authenticated, options), env });

test("capabilities reports a read-only CMS", async () => {
	const anonymous = await run(capabilities, "/api/firefly/capabilities");
	assert.equal(anonymous.status, 200);
	const body = await anonymous.json();
	assert.equal(body.writes, false);
	assert.equal(body.authenticated, false);
	assert.equal(body.revisions, true);
	const signedIn = await run(capabilities, "/api/firefly/capabilities", "GET", true);
	assert.equal((await signedIn.json()).authenticated, true);
});

test("public live index exposes published entries and content-free tombstones", async () => {
	const store = createMemoryStore();
	const cms = createCms(store, { enableWrites: true });
	await cms.commit(
		"posts",
		"published-one",
		{ title: "Public", body: "body", state: "published" },
		{ mode: "create" },
	);
	await cms.commit(
		"posts",
		"private-one",
		{ title: "Secret title", body: "secret", state: "private" },
		{ mode: "create" },
	);
	const doomed = await cms.commit(
		"posts",
		"deleted-one",
		{ title: "Gone", body: "gone", state: "published" },
		{ mode: "create" },
	);
	await cms.tombstone("posts", "deleted-one", { expectedRev: doomed.rev });

	const anonymous = await legacy({
		request: req("/api/live-content/index?kind=post"),
		env,
		store,
	});
	assert.equal(anonymous.status, 200);
	const body = await anonymous.json();
	assert.equal(body.kind, "posts");
	assert(Array.isArray(body.entries));
	const byId = new Map(body.entries.map((entry) => [entry.id, entry]));
	assert.equal(byId.get("published-one").hidden, false);
	assert(byId.get("published-one").meta.published);
	assert.equal(byId.get("private-one").hidden, true);
	assert.equal(byId.get("deleted-one").deleted, true);
	for (const id of ["private-one", "deleted-one"]) {
		assert(!("source" in byId.get(id)));
		assert(!("title" in byId.get(id)));
	}
	const admin = await legacy({
		request: req("/api/live-content/index?kind=post", "GET", true),
		env,
		store,
	});
	const adminEntries = new Map((await admin.json()).entries.map((entry) => [entry.id, entry]));
	assert("source" in adminEntries.get("private-one"));
});

test("compatibility reads reject anonymous clients", async () => {
	for (const [handler, path] of [
		[legacy, "/api/live-content/item"],
		[adminIndex, "/api/admin-content-index.json"],
		[adminPrivate, "/api/admin/private-index"],
		[backup, "/api/firefly/backup"],
	]) {
		const response = await run(handler, path);
		assert.equal(response.status, 401, path);
	}
});

test("write endpoints stay fail-closed even with legacy flags enabled", async () => {
	for (const path of ["/api/live-content/restore", "/api/live-content/undo-delete"]) {
		const response = await run(legacy, path, "POST", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ expectedRev: "deadbeef" }),
		});
		assert.equal(response.status, 503, path);
	}
	const update = await run(
		content,
		"/api/firefly/content?kind=posts&id=sample",
		"POST",
		true,
		{
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "update", item: { title: "x" } }),
		},
	);
	assert.equal(update.status, 503, "CMS update must not claim a successful write");
	const settingsPut = await run(settings, "/api/firefly/settings", "PUT", false, {
		headers: { "content-type": "application/json" },
		body: "{}",
	});
	assert.equal(settingsPut.status, 401);
	const galleryPut = await run(gallery, "/api/firefly/gallery", "PUT", false, {
		headers: { "content-type": "application/json" },
		body: "{}",
	});
	assert.equal(galleryPut.status, 401);
});

test("authenticated online CMS writes succeed with store and update live content", async () => {
	const store = createMemoryStore();
	// Create post
	const createRes = await content({
		request: req("/api/firefly/content?kind=posts&id=live-article", "POST", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "create",
				item: { title: "实时发布测试", body: "# 内容", state: "published", fields: { category: "技术" } }
			})
		}),
		env,
		store
	});
	assert.equal(createRes.status, 201);
	const createdItem = (await createRes.json()).item;
	assert.equal(createdItem.title, "实时发布测试");
	assert.equal(createdItem.id, "live-article");

	// Update post via legacy PUT /api/live-content/item
	const legacyPut = await legacy({
		request: req("/api/live-content/item", "PUT", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "post",
				id: "live-article",
				source: "# 内容已更新",
				meta: { title: "实时更新标题", published: "2026-11-11", draft: false },
				expectedRevision: createdItem.rev
			})
		}),
		env,
		store
	});
	assert.equal(legacyPut.status, 200);
	const updatedItem = await legacyPut.json();
	assert.equal(updatedItem.meta.title, "实时更新标题");

	// Delete post via legacy DELETE /api/live-content/item
	const legacyDelete = await legacy({
		request: req("/api/live-content/item?kind=post&id=live-article", "DELETE", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ expectedRevision: updatedItem.rev })
		}),
		env,
		store
	});
	assert.equal(legacyDelete.status, 200);
	assert.equal((await legacyDelete.json()).deleted, true);

	// Settings PUT with session and store
	const saveSettingsRes = await settings({
		request: req("/api/firefly/settings", "PUT", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ settings: { title: "新站点标题" } })
		}),
		env,
		store
	});
	assert.equal(saveSettingsRes.status, 200);
});

test("draft preview requires a session and same origin", async () => {
	assert.equal((await run(preview, "/api/firefly/preview", "POST")).status, 401);
	const foreign = new Request(origin + "/api/firefly/preview", {
		method: "POST",
		headers: {
			cookie,
			origin: "https://attacker.example",
			"x-firefly-cms": "1",
			"content-type": "application/json",
		},
		body: JSON.stringify({ title: "x", body: "y" }),
	});
	assert.equal((await preview({ request: foreign, env })).status, 403);
	const response = await run(preview, "/api/firefly/preview", "POST", true, {
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			title: "<b>Preview</b>",
			body: "<script>alert(1)</script>\n# Heading",
		}),
	});
	assert.equal(response.status, 200);
	const html = (await response.json()).html;
	assert(html.includes("&lt;b&gt;Preview&lt;/b&gt;"));
	assert(!html.includes("<script>alert(1)</script>"));
	assert(html.includes("<h1>Heading</h1>"));
});

test("CMS revisions, conflicts, private filtering and tombstones", async () => {
	const store = createMemoryStore();
	const cms = createCms(store, { enableWrites: true });
	assert.equal(await cms.publicItem("posts", "missing"), null);
	const created = await cms.commit(
		"posts",
		"sample",
		{ title: "Sample", body: "Body", state: "published", fields: { description: "D" } },
		{ mode: "create" },
	);
	assert.equal(created.state, "published");
	await assert.rejects(
		() => cms.commit("posts", "sample", { title: "Again" }, { expectedRev: "00000000" }),
		(error) => error.status === 409,
	);
	await assert.rejects(
		() => cms.commit("posts", "sample", { title: "Again" }, { mode: "create" }),
		(error) => error.status === 409,
	);
	await cms.commit(
		"posts",
		"hidden",
		{ title: "Hidden", body: "secret", state: "private" },
		{ mode: "create" },
	);
	assert.equal((await cms.list("posts")).length, 1);
	assert.equal(await cms.publicItem("posts", "hidden"), null);
	const history = await cms.history("posts", "sample");
	assert(history.length >= 1 && history[0].rev === created.rev);
	await cms.tombstone("posts", "sample", { expectedRev: created.rev });
	assert.equal(await cms.publicItem("posts", "sample"), null);
	assert.equal((await cms.list("posts")).length, 0);
	const readOnly = createCms(store);
	await assert.rejects(
		() => readOnly.commit("posts", "other", { title: "Nope" }, { mode: "create" }),
		(error) => error.status === 503,
	);
	await assert.rejects(
		() => cms.commit("files", "bad", { title: "x" }, { mode: "create" }),
		(error) => error.status === 400,
	);
});

test("dynamic overlay removes tombstoned and private baseline rows", async () => {
	const baseline = [{ id: "2026-01-01-000000", published: 1, html: "<p>old</p>", images: [] }];
	const store = createMemoryStore();
	const cms = createCms(store, { enableWrites: true });
	assert.equal((await overlayPublicDynamic(store, baseline)).length, 1);
	await cms.commit(
		"dynamic",
		"2026-01-01-000000",
		{ title: "", body: "live replacement", state: "published" },
		{ mode: "create" },
	);
	const replaced = await overlayPublicDynamic(store, baseline);
	assert.equal(replaced.length, 1);
	assert(replaced[0].html.includes("live replacement"));
	await cms.commit(
		"dynamic",
		"2026-01-01-000000",
		{ state: "private" },
		{ expectedRev: (await cms.load("dynamic", "2026-01-01-000000")).rev },
	);
	assert.equal((await overlayPublicDynamic(store, baseline)).length, 0);
});

test("post resolver suppresses a tombstoned static baseline", async () => {
	const store = createMemoryStore();
	const cms = createCms(store, { enableWrites: true });
	const baseline = await resolvePublicPost(store, "firefly");
	assert.equal(baseline.source, "baseline");
	const created = await cms.commit(
		"posts",
		"firefly",
		{ title: "Live", body: "Live body", state: "published" },
		{ mode: "create" },
	);
	const live = await resolvePublicPost(store, "firefly");
	assert.equal(live.source, "cms");
	assert.equal(live.item.title, "Live");
	await cms.tombstone("posts", "firefly", { expectedRev: created.rev });
	const removed = await resolvePublicPost(store, "firefly");
	assert.equal(removed.item, null);
	assert.equal(removed.suppressed, true);
});

test("file delivery route validates paths and delivers blob contents", async () => {
	const store = createMemoryStore();
	store.store = {
		async get(key, opts) {
			if (key === "imagebed/photos/test/sample.png") {
				return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
			}
			return null;
		},
		async list() {
			return { blobs: [{ key: "imagebed/photos/test/sample.png", size: 4 }], directories: [] };
		},
		async set() {},
		async delete() {},
	};

	const post = await fileHandler({ request: req("/file/test.png", "POST", false) });
	assert.equal(post.status, 405);

	const traversal = await fileHandler({ request: req("/file/../secret.txt", "GET", false), params: { path: "../secret.txt" } });
	assert.equal(traversal.status, 400);

	const ok = await fileHandler({ request: req("/file/photos/test/sample.png", "GET", false), params: { path: "photos/test/sample.png" }, store });
	assert.equal(ok.status, 200);
	assert.equal(ok.headers.get("content-type"), "image/png");
	assert(ok.headers.get("cache-control")?.includes("immutable"));
});

test("imagebed native store handles authenticated list and rejects unauthorized", async () => {
	const store = createMemoryStore();
	store.store = {
		async list() {
			return { blobs: [{ key: "imagebed/photos/castorice/d1.webp", size: 100 }], directories: [] };
		},
		async set() {},
		async delete() {},
	};

	const anon = await imagebed({ request: req("/api/firefly/imagebed?action=list", "GET", false), env, store });
	assert.equal(anon.status, 401);

	const authed = await imagebed({ request: req("/api/firefly/imagebed?action=list&dir=photos/castorice", "GET", true), env, store });
	assert.equal(authed.status, 200);
	const data = await authed.json();
	assert(Array.isArray(data.files));
	assert.equal(data.files.length, 1);
	assert.equal(data.files[0].key, "photos/castorice/d1.webp");

	const badDelete = await imagebed({
		request: req("/api/firefly/imagebed?action=delete", "POST", true, {
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ key: "../evil.png" }),
		}),
		env,
		store,
	});
	assert.equal(badDelete.status, 400);
});

