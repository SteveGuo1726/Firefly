import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@edgeone/pages-blob";

const STORE_NAME = "firefly-content-live";
const SCHEMA_VERSION = 1;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const AUTH_CACHE_MS = 5 * 60 * 1000;

const store = getStore({ name: STORE_NAME, consistency: "strong" });
const authCache = new Map();

const ALLOWED_LOGIN = "SteveGuo1726";
const REPOSITORY = "SteveGuo1726/Firefly";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...extraHeaders,
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
  if (kind === "dynamic") {
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
  }
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

async function readIndex(kind) {
  const existing = await store.get(indexKey(kind), {
    type: "json",
    consistency: "strong",
  });
  if (
    existing &&
    existing.schemaVersion === SCHEMA_VERSION &&
    existing.kind === kind &&
    existing.entries &&
    typeof existing.entries === "object"
  ) {
    return existing;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    updatedAt: null,
    entries: {},
  };
}

async function writeIndex(kind, index) {
  index.schemaVersion = SCHEMA_VERSION;
  index.kind = kind;
  index.updatedAt = new Date().toISOString();
  await store.setJSON(indexKey(kind), index);
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function requireAdmin(request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return { error: json({ error: "需要 GitHub 管理登录。" }, 401) };

  const hash = tokenHash(token);
  const cached = authCache.get(hash);
  if (cached && cached > Date.now()) return { token };

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
    };
  }
  return {
    published: String(meta.published || "").slice(0, 64),
    pinned: Boolean(meta.pinned),
    location: String(meta.location || "").slice(0, 240),
    excerpt: String(meta.excerpt || "").slice(0, 300),
  };
}

async function handleGetIndex(url) {
  const kind = normalizeKind(url.searchParams.get("kind"));
  if (!kind) return json({ error: "kind 必须是 post 或 dynamic。" }, 400);
  const index = await readIndex(kind);
  const entries = Object.values(index.entries || {}).sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
  );
  return json({
    schemaVersion: SCHEMA_VERSION,
    kind,
    updatedAt: index.updatedAt,
    entries,
  });
}

async function handleGetItem(url) {
  const kind = normalizeKind(url.searchParams.get("kind"));
  const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
  if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

  const item = await store.get(itemKey(kind, id), {
    type: "json",
    consistency: "strong",
  });
  if (!item || item.deleted) return json({ error: "Not Found" }, 404);
  return json(item);
}

async function handlePutItem(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const rawText = await request.text();
  if (Buffer.byteLength(rawText, "utf8") > MAX_SOURCE_BYTES) {
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
  if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

  const source = String(body.source || "");
  if (!source.trim()) return json({ error: "source 不能为空。" }, 400);

  const now = new Date().toISOString();
  const revision = randomUUID();
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
  const verified = await store.get(itemKey(kind, id), {
    type: "json",
    consistency: "strong",
  });
  if (!verified || verified.revision !== revision) {
    return json({ error: "Blob 写入校验失败，请重试。" }, 503);
  }

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
  await writeIndex(kind, index);

  return json({ ok: true, kind, id, revision, updatedAt: now });
}

async function handleDeleteItem(request, url) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const kind = normalizeKind(url.searchParams.get("kind"));
  const id = kind ? normalizeId(kind, url.searchParams.get("id")) : null;
  if (!kind || !id) return json({ error: "kind 或 id 无效。" }, 400);

  const now = new Date().toISOString();
  const revision = randomUUID();
  const existing = await store.get(itemKey(kind, id), {
    type: "json",
    consistency: "strong",
  });

  const tombstone = {
    schemaVersion: SCHEMA_VERSION,
    kind,
    id,
    path: existing?.path || "",
    meta: existing?.meta || normalizeMeta(kind, {}),
    baseGitSha: existing?.baseGitSha || "",
    revision,
    deleted: true,
    updatedAt: now,
    updatedBy: ALLOWED_LOGIN,
  };

  await store.setJSON(itemKey(kind, id), tombstone);
  const index = await readIndex(kind);
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
      const item = await store.get(itemKey(kind, entry.id), {
        type: "json",
        consistency: "strong",
      });
      if (item) {
        if (kind === "post") result.posts.push(item);
        else result.dynamics.push(item);
      }
    }
  }
  return json(result);
}

export default async function onRequest(context) {
  const request = context.request;
  if (!sameOriginAllowed(request)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/live-content/, "") || "/";

  try {
    if (path === "/health" && request.method === "GET") {
      return json({
        ok: true,
        store: STORE_NAME,
        schemaVersion: SCHEMA_VERSION,
        region: context.server?.region || null,
        requestId: context.uuid || context.server?.requestId || null,
      });
    }
    if (path === "/index" && request.method === "GET") {
      return handleGetIndex(url);
    }
    if (path === "/item" && request.method === "GET") {
      return handleGetItem(url);
    }
    if (path === "/item" && request.method === "PUT") {
      return handlePutItem(request);
    }
    if (path === "/item" && request.method === "DELETE") {
      return handleDeleteItem(request, url);
    }
    if (path === "/export" && request.method === "GET") {
      return handleExport(request);
    }
    return json({ error: "Not Found", path, method: request.method }, 404);
  } catch (error) {
    console.error("[Firefly live content]", error);
    return json(
      { error: error instanceof Error ? error.message : "Live content service failed." },
      500,
    );
  }
}
