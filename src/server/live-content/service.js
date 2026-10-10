const SCHEMA_VERSION = 3;
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

function normalizeContentPath(kind, raw) {
	const value = String(raw || "").trim().replace(/^\/+/, "");
	const root = kind === "post" ? "src/content/posts/" : "src/content/dynamic/";
	if (
		!value.startsWith(root) ||
		value.length > 500 ||
		value.includes("..") ||
		value.includes("\\")
	) {
		return null;
	}
	if (kind === "post" && !/\.(?:md|mdx)$/i.test(value)) return null;
	if (kind === "dynamic" && !/\.md$/i.test(value)) return null;
	return value;
}

function normalizeBranch(raw) {
	const value = String(raw || "").trim();
	return value && value.length <= 200 && /^[A-Za-z0-9._/-]+$/.test(value)
		? value
		: null;
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

function kindBucket(kind) {
	return kind === "post" ? "posts" : "dynamics";
}

function itemKey(kind, id, revision) {
	return `v3/items/${kindBucket(kind)}/${id}/${revision}.json`;
}

function pointerPrefix(kind) {
	return `v3/pointers/${kindBucket(kind)}/`;
}

function pointerKey(kind, id) {
	return `${pointerPrefix(kind)}${id}.json`;
}

export async function loadLiveContentItem(store, kind, id) {
	const pointer = await store.getJSON(pointerKey(kind, id));
	if (!pointer || pointer.deleted || !pointer.revision) return null;
	const item = await store.getJSON(itemKey(kind, id, pointer.revision));
	if (!item || item.deleted || item.revision !== pointer.revision) return null;
	return item;
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
			comment: meta.comment !== false,
			searchText: String(meta.searchText || "").slice(0, 4000),
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
	authorize,
	authorizeSession,
	distributedLock,
}) {
	const authCache = new Map();
	const repoWriterCache = new Map();
	// Serialize overlapping writes within this service instance. This protects
	// same-worker races; distributed workers still require storage-level CAS.
	const mutationLocks = new Map();
	async function withMutationLocks(keys, operation) {
		const ordered = [...new Set(keys)].sort();
		const releases = [];
		try {
			for (const key of ordered) {
				const previous = mutationLocks.get(key) || Promise.resolve();
				let release;
				const pending = new Promise(resolve => { release = resolve; });
				const current = previous.then(() => pending);
				mutationLocks.set(key, current);
				await previous;
				releases.push({ key, current, release });
			}
			if (distributedLock) {
				const releaseDistributed = await distributedLock.acquire(ordered);
				try { return await operation(); }
				finally { await releaseDistributed(); }
			}
			return await operation();
		} finally {
			for (const { key, current, release } of releases.reverse()) {
				release();
				if (mutationLocks.get(key) === current) mutationLocks.delete(key);
			}
		}
	}


	async function readPointer(kind, id) {
		return store.getJSON(pointerKey(kind, id));
	}

	async function readPointers(kind) {
		const keys = await store.listKeys(pointerPrefix(kind));
		const pointers = await Promise.all(keys.map((key) => store.getJSON(key)));
		return pointers.filter(
			(pointer) =>
				pointer &&
				pointer.schemaVersion === SCHEMA_VERSION &&
				pointer.kind === kind &&
				pointer.id &&
				pointer.revision,
		);
	}

	function pointerMeta(kind, meta) {
		if (kind !== "post" || !meta || typeof meta !== "object") return meta;
		const { html: _html, ...lightweight } = meta;
		return lightweight;
	}

	async function writePointer(kind, pointer) {
		await store.setJSON(pointerKey(kind, pointer.id), {
			schemaVersion: SCHEMA_VERSION,
			kind,
			...pointer,
			...(pointer.meta ? { meta: pointerMeta(kind, pointer.meta) } : {}),
		});
	}

	async function requireAdmin(request) {
		const authorization = request.headers.get("Authorization") || "";
		const token = authorization.startsWith("Bearer ")
			? authorization.slice(7).trim()
			: "";
		if (!token) {
			if (typeof authorizeSession === "function") {
				const result = await authorizeSession(request);
				if (result?.ok) return { token: "", login: result.login };
			}
			return { error: json({ error: "需要 GitHub 管理登录。" }, 401) };
		}

		const hash = await digestToken(token);
		if ((authCache.get(hash) || 0) > Date.now()) return { token };

		if (typeof authorize === "function") {
			const result = await authorize({ request, token });
			if (!result?.ok) {
				return {
					error: json(
						{ error: result?.error || "管理身份验证失败。" },
						result?.status || 403,
					),
				};
			}
			authCache.set(hash, Date.now() + AUTH_CACHE_MS);
			return { token };
		}

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
		if (!repoResponse.ok || repository?.permissions?.push !== true) {
			return { error: json({ error: "当前 GitHub Token 没有仓库写权限。" }, 403) };
		}

		authCache.set(hash, Date.now() + AUTH_CACHE_MS);
		return { token };
	}

	async function requireRepoWriter(request) {
		const authorization = request.headers.get("Authorization") || "";
		const token = authorization.startsWith("Bearer ")
			? authorization.slice(7).trim()
			: "";
		if (!token) return { error: json({ error: "需要仓库写入凭证。" }, 401) };

		const hash = await digestToken("repo-writer:" + token);
		if ((repoWriterCache.get(hash) || 0) > Date.now()) return { token };

		if (typeof authorize === "function") {
			const result = await authorize({ request, token, scope: "repo-writer" });
			if (!result?.ok) {
				return {
					error: json(
						{ error: result?.error || "仓库写入身份验证失败。" },
						result?.status || 403,
					),
				};
			}
			repoWriterCache.set(hash, Date.now() + AUTH_CACHE_MS);
			return { token };
		}

		const response = await fetch(`https://api.github.com/repos/${REPOSITORY}`, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"User-Agent": "Firefly-Live-Content-Archive",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
		const repository = await response.json().catch(() => ({}));
		if (!response.ok || repository?.permissions?.push !== true) {
			return { error: json({ error: "当前凭证没有仓库写权限。" }, 403) };
		}

		repoWriterCache.set(hash, Date.now() + AUTH_CACHE_MS);
		return { token };
	}

	async function verifyGitBaseline(token, branch, path, expectedSha) {
		if (!expectedSha) return true;
		const response = await fetch(
			`https://api.github.com/repos/${REPOSITORY}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					"User-Agent": "Firefly-Live-Content",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);
		if (response.status === 404) return false;
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.message || `GitHub 基线校验失败：${response.status}`);
		}
		return payload?.sha === expectedSha;
	}

	function conflict(currentRevision = "") {
		return json(
			{
				error: "内容已在其他标签页或设备被修改，请刷新后再编辑。",
				code: "REVISION_CONFLICT",
				currentRevision,
			},
			409,
		);
	}

	async function handleGetIndex(request, url) {
		const kind = normalizeKind(url.searchParams.get("kind"));
		if (!kind) return json({ error: "kind 必须是 post 或 dynamic。" }, 400);
		let entries = await readPointers(kind);
		const hasAuthorization = (request.headers.get("Authorization") || "").startsWith("Bearer ") ||
			(typeof authorizeSession === "function" && (request.headers.get("Cookie") || "").includes("__Host-firefly-admin="));
		if (hasAuthorization) {
			const auth = await requireAdmin(request);
			if (auth.error) return auth.error;
		} else {
			entries = entries.flatMap((entry) => {
				const overlaysStaticGit = Boolean(entry.baseGitSha);
				if (entry.deleted) {
					return overlaysStaticGit
						? [{ id: entry.id, revision: entry.revision, deleted: true, updatedAt: entry.updatedAt }]
						: [];
				}
				if (kind === "post" && (entry.meta?.draft || entry.meta?.protected)) {
					return overlaysStaticGit
						? [{ id: entry.id, revision: entry.revision, deleted: false, hidden: true, updatedAt: entry.updatedAt }]
						: [];
				}
				return [{
					id: entry.id,
					revision: entry.revision,
					deleted: false,
					updatedAt: entry.updatedAt,
					meta: pointerMeta(kind, entry.meta),
				}];
			});
		}
		entries.sort((a, b) =>
			String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
		);
		return json({
			schemaVersion: SCHEMA_VERSION,
			kind,
			updatedAt: entries[0]?.updatedAt || null,
			entries,
		});
	}

	async function handleGetItem(request, url) {
		const kind = normalizeKind(url.searchParams.get("kind"));
		const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
		if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

		const indexed = await readPointer(kind, id);
		if (indexed?.deleted) return json({ error: "Gone", deleted: true }, 410);
		if (!indexed?.revision) return json({ error: "Not Found" }, 404);

		const item = await store.getJSON(itemKey(kind, id, indexed.revision));
		if (!item || item.deleted || item.revision !== indexed.revision) {
			return json({ error: "Live revision unavailable" }, 503);
		}

		const hasAuthorization = (request.headers.get("Authorization") || "").startsWith("Bearer ") ||
			(typeof authorizeSession === "function" && (request.headers.get("Cookie") || "").includes("__Host-firefly-admin="));
		if (hasAuthorization) {
			const auth = await requireAdmin(request);
			if (auth.error) return auth.error;
			return json(item);
		}

		if (kind === "post" && (item.meta?.draft || item.meta?.protected)) {
			return json(
				{ error: "Hidden by live content state", hidden: true },
				410,
			);
		}

		return json({
			schemaVersion: item.schemaVersion,
			kind: item.kind,
			id: item.id,
			meta: item.meta,
			revision: item.revision,
			deleted: item.deleted,
			updatedAt: item.updatedAt,
		});
	}

	async function handleUndoGitDeletion(request) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;
		const body = await request.json().catch(() => null);
		const kind = normalizeKind(body?.kind);
		const id = kind ? normalizeId(kind, body?.id) : null;
		if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);
		const pointer = await readPointer(kind, id);
		if (!pointer?.deleted || !pointer.revision || !pointer.baseGitSha || !pointer.baseGitBranch) {
			return json({ error: "仅可撤销仍有 Git 基线的删除标记。" }, 409);
		}
		if (!body.expectedRevision || pointer.revision !== body.expectedRevision) return conflict(pointer.revision);
		const unchanged = await verifyGitBaseline(auth.token, pointer.baseGitBranch, pointer.path, pointer.baseGitSha);
		if (!unchanged) return json({ error: "Git 基线已变化，请重新核对源码。" }, 409);
		await store.deleteKey(pointerKey(kind, id));
		return json({ ok: true, kind, id, restoredGitBaseline: true });
	}

	async function handleHistory(request, url) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;
		const kind = normalizeKind(url.searchParams.get("kind"));
		const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
		if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);
		const prefix = `v3/items/${kindBucket(kind)}/${id}/`;
		const keys = await store.listKeys(prefix);
		const docs = await Promise.all(keys.slice(0, 300).map(key => store.getJSON(key)));
		const entries = docs.filter(item => item && item.id === id && item.kind === kind && item.revision && !item.deleted)
			.map(item => ({ revision: item.revision, updatedAt: item.updatedAt, meta: pointerMeta(kind, item.meta), path: item.path }))
			.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
		return json({ kind, id, entries: entries.slice(0, 100) });
	}

	async function handleRestore(request) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;
		const body = await request.json().catch(() => null);
		const kind = normalizeKind(body?.kind);
		const id = kind ? normalizeId(kind, body?.id) : null;
		const revision = typeof body?.revision === "string" && /^[a-f0-9-]{36}$/i.test(body.revision) ? body.revision : null;
		if (!kind || !id || !revision) return json({ error: "无效的历史版本。" }, 400);
		const current = await readPointer(kind, id);
		const expectedRevision = String(body.expectedRevision || "");
		if (current && (!expectedRevision || current.revision !== expectedRevision)) return conflict(current.revision);
		if (!current && expectedRevision) return conflict("");
		const historical = await store.getJSON(itemKey(kind, id, revision));
		if (!historical || historical.deleted || historical.kind !== kind || historical.id !== id || !historical.source) {
			return json({ error: "历史版本不存在或已被清理。" }, 404);
		}
		const updatedAt = new Date().toISOString();
		const newRevision = crypto.randomUUID();
		const restored = { ...historical, revision: newRevision, updatedAt, updatedBy: ALLOWED_LOGIN, deleted: false };
		await store.setJSON(itemKey(kind, id, newRevision), restored);
		await writePointer(kind, {
			id, path: restored.path, meta: restored.meta, baseGitSha: restored.baseGitSha,
			baseGitBranch: restored.baseGitBranch, revision: newRevision, deleted: false, updatedAt
		});
		return json({ ok: true, kind, id, revision: newRevision, restoredFrom: revision, updatedAt });
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
		const path = kind ? normalizeContentPath(kind, body.path) : null;
		const previousPath =
			kind && body.previousPath
				? normalizeContentPath(kind, body.previousPath)
				: null;
		const baseGitBranch = body.baseGitSha
			? normalizeBranch(body.baseGitBranch)
			: normalizeBranch(body.baseGitBranch) || "";
		if (
			!kind ||
			!id ||
			!path ||
			(body.previousId && !previousId) ||
			(body.previousPath && !previousPath) ||
			(body.baseGitSha && !baseGitBranch)
		) {
			return json({ error: "kind、id、path、branch 或 previousId 无效。" }, 400);
		}

		const targetEntry = await readPointer(kind, id);
		const previousEntry =
			previousId && previousId !== id
				? await readPointer(kind, previousId)
				: targetEntry;
		const expectedRevision = String(body.expectedRevision || "");

		if (previousId && previousId !== id) {
			if (targetEntry && !targetEntry.deleted) {
				return json({ error: "目标路径已经存在实时内容。", code: "TARGET_EXISTS" }, 409);
			}
			if (
				previousEntry &&
				!previousEntry.deleted &&
				(!expectedRevision || previousEntry.revision !== expectedRevision)
			) {
				return conflict(previousEntry.revision);
			}
		} else if (targetEntry && !targetEntry.deleted) {
			if (!expectedRevision || targetEntry.revision !== expectedRevision) {
				return conflict(targetEntry.revision);
			}
		} else if (expectedRevision) {
			return conflict(targetEntry?.revision || "");
		}

		if (!previousEntry && body.baseGitSha) {
			const baselinePath =
				previousId && previousId !== id ? previousPath : path;
			const unchanged = await verifyGitBaseline(
				auth.token,
				baseGitBranch,
				baselinePath,
				String(body.baseGitSha),
			);
			if (!unchanged) {
				return json(
					{ error: "GitHub 基线文件已变化，请刷新后重新编辑。", code: "GIT_BASE_CHANGED" },
					409,
				);
			}
		}

		const source = String(body.source || "");
		if (!source.trim()) return json({ error: "source 不能为空。" }, 400);

		const now = new Date().toISOString();
		const revision = crypto.randomUUID();
		const document = {
			schemaVersion: SCHEMA_VERSION,
			kind,
			id,
			path,
			source,
			meta: normalizeMeta(kind, body.meta),
			baseGitSha: String(body.baseGitSha || "").slice(0, 80),
			baseGitBranch,
			revision,
			deleted: false,
			updatedAt: now,
			updatedBy: ALLOWED_LOGIN,
		};

		await store.setJSON(itemKey(kind, id, revision), document);
		await writePointer(kind, {
			id,
			path: document.path,
			meta: document.meta,
			baseGitSha: document.baseGitSha,
			baseGitBranch: document.baseGitBranch,
			revision,
			deleted: false,
			updatedAt: now,
		});

		if (previousId && previousId !== id) {
			const old = previousEntry || {};
			try {
				await writePointer(kind, {
					id: previousId,
					path: previousPath || old.path || "",
					meta: old.meta || normalizeMeta(kind, {}),
					baseGitSha: String(
						body.previousBaseGitSha || old.baseGitSha || "",
					).slice(0, 80),
					baseGitBranch:
						normalizeBranch(body.previousBaseGitBranch) ||
						old.baseGitBranch ||
						baseGitBranch || "",
					revision,
					deleted: true,
					updatedAt: now,
				});
			} catch (error) {
				try {
					if (targetEntry) {
						await store.setJSON(pointerKey(kind, id), targetEntry);
					} else {
						await store.deleteKey(pointerKey(kind, id));
					}
				} catch (rollbackError) {
					console.error("[Firefly live content] rename rollback failed", rollbackError);
				}
				throw error;
			}
		}
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

		const indexed = (await readPointer(kind, id)) || {};
		const existing =
			indexed.revision && !indexed.deleted
				? await store.getJSON(itemKey(kind, id, indexed.revision))
				: null;
		const expectedRevision = String(fallback.expectedRevision || "");
		if (indexed && !indexed.deleted) {
			if (indexed.revision && (!expectedRevision || indexed.revision !== expectedRevision)) {
				return conflict(indexed.revision);
			}
		} else if (expectedRevision) {
			return conflict(indexed?.revision || "");
		}

		const fallbackPath = normalizeContentPath(kind, fallback.path);
		const path = existing?.path || indexed.path || fallbackPath;
		const baseGitSha = String(
			existing?.baseGitSha || fallback.baseGitSha || indexed.baseGitSha || "",
		).slice(0, 80);
		const baseGitBranch =
			normalizeBranch(
				existing?.baseGitBranch ||
					fallback.baseGitBranch ||
					indexed.baseGitBranch ||
					"",
			) || "";
		if (!path) return json({ error: "删除内容缺少有效 path。" }, 400);

		if (!indexed.revision && baseGitSha) {
			if (!baseGitBranch) {
				return json({ error: "删除内容缺少 Git 基线分支。" }, 400);
			}
			const unchanged = await verifyGitBaseline(
				auth.token,
				baseGitBranch,
				path,
				baseGitSha,
			);
			if (!unchanged) {
				return json(
					{ error: "GitHub 基线文件已变化，请刷新后重新操作。", code: "GIT_BASE_CHANGED" },
					409,
				);
			}
		}

		const now = new Date().toISOString();
		const revision = crypto.randomUUID();
		const tombstone = {
			schemaVersion: SCHEMA_VERSION,
			kind,
			id,
			path,
			meta:
				existing?.meta ||
				normalizeMeta(kind, fallback.meta || indexed.meta || {}),
			baseGitSha,
			baseGitBranch,
			revision,
			deleted: true,
			updatedAt: now,
			updatedBy: ALLOWED_LOGIN,
		};

		await writePointer(kind, {
			id,
			path: tombstone.path,
			meta: tombstone.meta,
			baseGitSha: tombstone.baseGitSha,
			baseGitBranch: tombstone.baseGitBranch,
			revision,
			deleted: true,
			updatedAt: now,
		});
		return json({ ok: true, kind, id, revision, deleted: true, updatedAt: now });
	}

	async function buildExportResult() {
		const result = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			posts: [],
			dynamics: [],
			history: [],
		};
		for (const kind of ["post", "dynamic"]) {
			const pointers = await readPointers(kind);
			const revisionKeys = await store.listKeys(`v3/items/${kindBucket(kind)}/`);
			for (const key of revisionKeys) {
				const snapshot = await store.getJSON(key);
				if (!snapshot || snapshot.kind !== kind || !snapshot.id || !snapshot.revision || typeof snapshot.source !== "string") {
					throw new Error(`Backup integrity failure: corrupt historical revision at ${key}`);
				}
				result.history.push(snapshot);
			}
			for (const entry of pointers) {
				const item = entry.deleted
					? {
						schemaVersion: SCHEMA_VERSION,
						kind,
						id: entry.id,
						path: entry.path,
						meta: entry.meta,
						baseGitSha: entry.baseGitSha || "",
						baseGitBranch: entry.baseGitBranch || "",
						revision: entry.revision,
						deleted: true,
						updatedAt: entry.updatedAt,
						updatedBy: ALLOWED_LOGIN,
					  }
					: await store.getJSON(itemKey(kind, entry.id, entry.revision));
				if (!item || item.kind !== kind || item.id !== entry.id || item.revision !== entry.revision ||
					(!entry.deleted && (item.deleted || typeof item.source !== "string"))) {
					throw new Error(`Backup integrity failure: missing or mismatched ${kind}:${entry.id}@${entry.revision}`);
				}
				if (kind === "post") result.posts.push(item);
				else result.dynamics.push(item);
			}
		}
		return result;
	}

	async function handleExport(request) {
		const auth = await requireAdmin(request);
		if (auth.error) return auth.error;
		return json(await buildExportResult());
	}

	async function handleArchiveExport(request) {
		const auth = await requireRepoWriter(request);
		if (auth.error) return auth.error;
		return json(await buildExportResult());
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
			if (path === "/index" && request.method === "GET") return await handleGetIndex(request, url);
			if (path === "/item" && request.method === "GET") return await handleGetItem(request, url);

			if (path === "/undo-delete" && request.method === "POST") {
				const payload = await request.clone().json().catch(() => ({}));
				const kind = normalizeKind(payload?.kind);
				const id = kind ? normalizeId(kind, payload?.id) : null;
				return await withMutationLocks([id ? kind + ":" + id : "invalid-undo"], () => handleUndoGitDeletion(request));
			}
			if (path === "/history" && request.method === "GET") return await handleHistory(request, url);
			if (path === "/restore" && request.method === "POST") {
				const payload = await request.clone().json().catch(() => ({}));
				const kind = normalizeKind(payload?.kind);
				const id = kind ? normalizeId(kind, payload?.id) : null;
				return await withMutationLocks([id ? kind + ":" + id : "invalid-restore"], () => handleRestore(request));
			}
			if (path === "/item" && request.method === "PUT") {
				const payload = await request.clone().json().catch(() => ({}));
				const kind = normalizeKind(payload?.kind);
				const id = kind ? normalizeId(kind, payload?.id) : null;
				const previousId = kind ? normalizeId(kind, payload?.previousId) : null;
				const keys = [id, previousId].filter(Boolean).map(value => kind + ":" + value);
				return await withMutationLocks(keys.length ? keys : ["invalid-put"], () => handlePutItem(request));
			}
			if (path === "/item" && request.method === "DELETE") {
				const kind = normalizeKind(url.searchParams.get("kind"));
				const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
				return await withMutationLocks([id ? kind + ":" + id : "invalid-delete"], () => handleDeleteItem(request, url));
			}
			if (path === "/export" && request.method === "GET") return await handleExport(request);
			if (path === "/archive-export" && request.method === "GET") {
				return await handleArchiveExport(request);
			}
			return json({ error: "Not Found", path, method: request.method }, 404);
		} catch (error) {
			if (error?.code === "CONTENT_LOCK_BUSY") return json({error:"内容正在其他节点保存，请稍后重试。"},409);
			console.error("[Firefly live content]", error);
			return json({
				error: "实时内容服务暂时不可用，请稍后重试。",
			}, 500);
		}
	};
}
