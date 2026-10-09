const SCHEMA_VERSION = 1;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const AUTH_CACHE_MS = 5 * 60 * 1000;
const ALLOWED_LOGIN = "SteveGuo1726";
const REPOSITORY = "SteveGuo1726/Firefly";

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "same-origin",
		},
	});
}

function sameOriginAllowed(request) {
	const origin = request.headers.get("Origin");
	if (!origin) return true;
	try {
		return origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

function normalizeKind(raw) {
	return raw === "post" || raw === "dynamic" ? raw : null;
}

function normalizeId(kind, raw) {
	const value = String(raw || "").trim().replace(/^\/+|\/+$/g, "");
	if (!value || value.length > 240 || value.includes("..") || value.includes("\\")) {
		return null;
	}
	if (kind === "dynamic") return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
	return value
		.split("/")
		.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))
		? value
		: null;
}

function itemKey(kind, id) {
	return `v1/${kind === "post" ? "posts" : "dynamics"}/${id}.json`;
}

function indexKey(kind) {
	return `v1/index/${kind === "post" ? "posts" : "dynamics"}.json`;
}

function normalizeImages(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.slice(0, 40).map((item) => ({
		alt: String(item?.alt || "").slice(0, 500),
		src: String(item?.src || "").slice(0, 4000),
		...(item?.title ? { title: String(item.title).slice(0, 500) } : {}),
	})).filter((item) => item.src);
}

function normalizeMeta(kind, raw) {
	const meta = raw && typeof raw === "object" ? raw : {};
	if (kind === "post") {
		return {
			title: String(meta.title || "").slice(0, 300),
			description: String(meta.description || "").slice(0, 1200),
			published: String(meta.published || "").slice(0, 64),
			updated: String(meta.updated || "").slice(0, 64),
			category: String(meta.category || "").slice(0, 120),
			tags: Array.isArray(meta.tags)
				? meta.tags.map((item) => String(item).slice(0, 80)).slice(0, 50)
				: [],
			draft: Boolean(meta.draft),
			pinned: Boolean(meta.pinned),
			image: String(meta.image || "").slice(0, 2000),
			protected: Boolean(meta.protected),
			html: String(meta.html || "").slice(0, 1024 * 1024),
		};
	}
	return {
		published: String(meta.published || "").slice(0, 64),
		pinned: Boolean(meta.pinned),
		location: String(meta.location || "").slice(0, 240),
		excerpt: String(meta.excerpt || "").slice(0, 300),
		searchText: String(meta.searchText || "").slice(0, 4000),
		html: String(meta.html || "").slice(0, 1024 * 1024),
		images: normalizeImages(meta.images),
	};
}

async function digestToken(token) {
	const bytes = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function createLiveContentService({
	store,
	provider,
	storeName,
	routePrefix = "/api/live-content",
	region,
}) {
	const authCache = new Map();

	async function readIndex(kind) {
		const existing = await store.getJSON(indexKey(kind));
		if (
			existing &&
			existing.schemaVersion === SCHEMA_VERSION &&
			existing.kind === kind &&
			existing.entries &&
			typeof existing.entries === "object"
		) {
			return existing;
		}
		return { schemaVersion: SCHEMA_VERSION, kind, updatedAt: null, entries: {} };
	}

	async function writeIndex(kind, index) {
		index.schemaVersion = SCHEMA_VERSION;
		index.kind = kind;
		index.updatedAt = new Date().toISOString();
		await store.setJSON(indexKey(kind), index);
	}

	async function requireAdmin(request) {
		const authorization = request.headers.get("Authorization") || "";
		const token = authorization.startsWith("Bearer ")
			? authorization.slice(7).trim()
			: "";
		if (!token) return { error: json({ error: "需要 GitHub 管理登录。" }, 401) };

		const hash = await digestToken(token);
		if ((authCache.get(hash) || 0) > Date.now()) return { token };

		const headers = {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"User-Agent": "Firefly-Live-Content",
			"X-GitHub-Api-Version": "2022-11-28",
		};

		const userResponse = await fetch("https://api.github.com/user", { headers });
		const user = await userResponse.json().catch(() => ({}));
		if (
			!userResponse.ok ||
			String(user?.login || "").toLowerCase() !== ALLOWED_LOGIN.toLowerCase()
		) {
			return { error: json({ error: "GitHub 账号验证失败。" }, 403) };
		}

		const repoResponse = await fetch(
			`https://api.github.com/repos/${REPOSITORY}`,
			{ headers },
		);
		const repository = await repoResponse.json().catch(() => ({}));
		if (!repoResponse.ok || repository?.permissions?.push === false) {
			return { error: json({ error: "当前 GitHub Token 没有仓库写权限。" }, 403) };
		}

		authCache.set(hash, Date.now() + AUTH_CACHE_MS);
		return { token };
	}

	async function handleGetIndex(request, url) {
		const kind = normalizeKind(url.searchParams.get("kind"));
		if (!kind) return json({ error: "kind 必须是 post 或 dynamic。" }, 400);
		const index = await readIndex(kind);
		let entries = Object.values(index.entries || {});
		const hasAuthorization = (request.headers.get("Authorization") || "").startsWith("Bearer ");
		if (hasAuthorization) {
			const auth = await requireAdmin(request);
			if (auth.error) return auth.error;
		} else if (kind === "post") {
			entries = entries.filter(
				(entry) => entry.deleted || (!entry.meta?.draft && !entry.meta?.protected),
			);
		}
		return json({
			schemaVersion: SCHEMA_VERSION,
			kind,
			updatedAt: index.updatedAt,
			entries: entries.sort((a, b) =>
				String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
			),
		});
	}

	async function handleGetItem(request, url) {
		const kind = normalizeKind(url.searchParams.get("kind"));
		const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
		if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

		const index = await readIndex(kind);
		const indexed = index.entries?.[id];
		if (indexed?.deleted) return json({ error: "Gone", deleted: true }, 410);
		if (!indexed) return json({ error: "Not Found" }, 404);

		const item = await store.getJSON(itemKey(kind, id));
		if (!item || item.deleted) return json({ error: "Not Found" }, 404);

		const hasAuthorization = (request.headers.get("Authorization") || "").startsWith("Bearer ");
		if (hasAuthorization) {
			const auth = await requireAdmin(request);
			if (auth.error) return auth.error;
			return json(item);
		}

		if (kind === "post" && (item.meta?.draft || item.meta?.protected)) {
			return json({ error: "Not Found" }, 404);
		}

		return json({
			schemaVersion: item.schemaVersion,
			kind: item.kind,
			id: item.id,
			path: item.path,
			meta: item.meta,
			baseGitSha: item.baseGitSha,
			revision: item.revision,
			deleted: item.deleted,
			updatedAt: item.updatedAt,
			updatedBy: item.updatedBy,
		});
	}

	async function handlePutItem(request) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;

		const rawText = await request.text();
		if (new TextEncoder().encode(rawText).byteLength > MAX_SOURCE_BYTES) {
			return json({ error: "内容超过 2 MiB 限制。" }, 413);
		}

		let body;
		try {
			body = JSON.parse(rawText);
		} catch {
			return json({ error: "请求 JSON 无效。" }, 400);
		}

		const kind = normalizeKind(body.kind);
		const id = kind ? normalizeId(kind, body.id) : null;
		const previousId =
			kind && body.previousId ? normalizeId(kind, body.previousId) : null;
		if (!kind || !id || (body.previousId && !previousId)) {
			return json({ error: "kind、id 或 previousId 无效。" }, 400);
		}

		const source = String(body.source || "");
		if (!source.trim()) return json({ error: "source 不能为空。" }, 400);

		const now = new Date().toISOString();
		const revision = crypto.randomUUID();
		const document = {
			schemaVersion: SCHEMA_VERSION,
			kind,
			id,
			path: String(body.path || "").slice(0, 500),
			source,
			meta: normalizeMeta(kind, body.meta),
			baseGitSha: String(body.baseGitSha || "").slice(0, 80),
			revision,
			deleted: false,
			updatedAt: now,
			updatedBy: ALLOWED_LOGIN,
		};

		await store.setJSON(itemKey(kind, id), document);
		const index = await readIndex(kind);
		index.entries[id] = {
			id,
			path: document.path,
			meta: document.meta,
			baseGitSha: document.baseGitSha,
			revision,
			deleted: false,
			updatedAt: now,
		};

		if (previousId && previousId !== id) {
			const previousEntry = index.entries[previousId] || {};
			const tombstone = {
				schemaVersion: SCHEMA_VERSION,
				kind,
				id: previousId,
				path: String(body.previousPath || previousEntry.path || "").slice(0, 500),
				meta: previousEntry.meta || normalizeMeta(kind, {}),
				baseGitSha: String(
					body.previousBaseGitSha || previousEntry.baseGitSha || "",
				).slice(0, 80),
				revision,
				deleted: true,
				updatedAt: now,
				updatedBy: ALLOWED_LOGIN,
			};
			await store.setJSON(itemKey(kind, previousId), tombstone);
			index.entries[previousId] = {
				id: previousId,
				path: tombstone.path,
				meta: tombstone.meta,
				baseGitSha: tombstone.baseGitSha,
				revision,
				deleted: true,
				updatedAt: now,
			};
		}

		await writeIndex(kind, index);
		return json({
			ok: true,
			kind,
			id,
			previousId: previousId && previousId !== id ? previousId : null,
			revision,
			updatedAt: now,
		});
	}

	async function handleDeleteItem(request, url) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;

		const kind = normalizeKind(url.searchParams.get("kind"));
		const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
		if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

		let fallback = {};
		try {
			const raw = await request.text();
			if (raw) fallback = JSON.parse(raw);
		} catch {}

		const index = await readIndex(kind);
		const indexed = index.entries?.[id] || {};
		const existing = await store.getJSON(itemKey(kind, id));

		const now = new Date().toISOString();
		const revision = crypto.randomUUID();
		const tombstone = {
			schemaVersion: SCHEMA_VERSION,
			kind,
			id,
			path: String(existing?.path || fallback.path || indexed.path || "").slice(0, 500),
			meta:
				existing?.meta ||
				normalizeMeta(kind, fallback.meta || indexed.meta || {}),
			baseGitSha: String(
				existing?.baseGitSha || fallback.baseGitSha || indexed.baseGitSha || "",
			).slice(0, 80),
			revision,
			deleted: true,
			updatedAt: now,
			updatedBy: ALLOWED_LOGIN,
		};

		await store.setJSON(itemKey(kind, id), tombstone);
		index.entries[id] = {
			id,
			path: tombstone.path,
			meta: tombstone.meta,
			baseGitSha: tombstone.baseGitSha,
			revision,
			deleted: true,
			updatedAt: now,
		};
		await writeIndex(kind, index);
		return json({ ok: true, kind, id, revision, deleted: true, updatedAt: now });
	}

	async function handleExport(request) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;
		const result = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			posts: [],
			dynamics: [],
		};
		for (const kind of ["post", "dynamic"]) {
			const index = await readIndex(kind);
			for (const entry of Object.values(index.entries || {})) {
				const item = await store.getJSON(itemKey(kind, entry.id));
				if (!item) continue;
				if (kind === "post") result.posts.push(item);
				else result.dynamics.push(item);
			}
		}
		return json(result);
	}

	return async function handleLiveContent(request, context = {}) {
		if (!sameOriginAllowed(request)) {
			return json({ error: "Origin not allowed." }, 403);
		}
		const url = new URL(request.url);
		const path = url.pathname.replace(new RegExp(`^${routePrefix}`), "") || "/";
		try {
			if (path === "/health" && request.method === "GET") {
				return json({
					ok: true,
					provider,
					store: storeName,
					schemaVersion: SCHEMA_VERSION,
					region: typeof region === "function" ? region(context) : null,
				});
			}
			if (path === "/index" && request.method === "GET") return handleGetIndex(request, url);
			if (path === "/item" && request.method === "GET") return handleGetItem(request, url);
			if (path === "/item" && request.method === "PUT") return handlePutItem(request);
			if (path === "/item" && request.method === "DELETE") return handleDeleteItem(request, url);
			if (path === "/export" && request.method === "GET") return handleExport(request);
			return json({ error: "Not Found", path, method: request.method }, 404);
		} catch (error) {
			console.error("[Firefly live content]", error);
			return json({
				error: error instanceof Error ? error.message : "Live content service failed.",
			}, 500);
		}
	};
}
