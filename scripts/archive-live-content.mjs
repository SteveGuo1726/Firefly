import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ARCHIVE_STATE_PATH = ".firefly/live-content-archive-state.json";
const roots = { post: "src/content/posts/", dynamic: "src/content/dynamic/" };

function entryKey(item) { return `${item.kind}:${String(item.id || "")}`; }

export function gitBlobSha(value) {
	const body = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
	return createHash("sha1").update(`blob ${body.byteLength}\0`).update(body).digest("hex");
}

export function safeArchivePath(item, rootDir = process.cwd()) {
	const root = roots[item?.kind];
	const value = String(item?.path || "").replaceAll("\\", "/");
	if (
		!root ||
		!String(item?.id || "").trim() ||
		!value.startsWith(root) ||
		path.posix.isAbsolute(value) ||
		value.split("/").some((part) => part === "..")
	) throw new Error(`Unsafe archive path: ${value || "<empty>"}`);
	if (item.kind === "post" && !/\.(?:md|mdx)$/i.test(value)) throw new Error(`Invalid post archive path: ${value}`);
	if (item.kind === "dynamic" && !/\.md$/i.test(value)) throw new Error(`Invalid dynamic archive path: ${value}`);
	const rootAbsolute = path.resolve(rootDir, root);
	const absolute = path.resolve(rootDir, value);
	if (!absolute.startsWith(rootAbsolute + path.sep)) throw new Error(`Archive path escapes content root: ${value}`);
	return { relative: value, absolute };
}

async function readMaybe(file) {
	try { return await readFile(file); }
	catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

export async function loadArchiveState(rootDir = process.cwd()) {
	try {
		const parsed = JSON.parse(await readFile(path.resolve(rootDir, ARCHIVE_STATE_PATH), "utf8"));
		if (parsed?.schemaVersion === 1 && parsed.entries && typeof parsed.entries === "object") return parsed;
	} catch (error) {
		if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
	}
	return { schemaVersion: 1, archivedAt: null, entries: {} };
}

function validatePayload(payload) {
	if (payload?.schemaVersion !== 3) throw new Error(`Unsupported live content schema: ${payload?.schemaVersion}`);
	if (!Array.isArray(payload.posts) || !Array.isArray(payload.dynamics)) throw new Error("Archive export is missing posts or dynamics arrays.");
}

export async function createArchivePlan(payload, { rootDir = process.cwd(), state: suppliedState } = {}) {
	validatePayload(payload);
	const state = suppliedState || await loadArchiveState(rootDir);
	const items = [...payload.posts, ...payload.dynamics];
	const tombstones = items.filter((item) => item?.deleted);
	const seenPaths = new Set();
	const conflicts = [];
	const operations = [];
	const nextState = { schemaVersion: 1, archivedAt: state.archivedAt || null, entries: { ...(state.entries || {}) } };
	let stateChanged = false;

	for (const item of items) {
		const { relative, absolute } = safeArchivePath(item, rootDir);
		if (seenPaths.has(relative)) {
			conflicts.push(`${item.kind}:${item.id}: duplicate archive path ${relative}`);
			continue;
		}
		seenPaths.add(relative);
		const key = entryKey(item);
		const previous = state.entries?.[key];
		const revision = String(item.revision || "");
		if (
			previous &&
			previous.path === relative &&
			String(previous.revision || "") === revision &&
			Boolean(previous.deleted) === Boolean(item.deleted)
		) {
			const onDisk = await readMaybe(absolute);
			const actualSha = onDisk ? gitBlobSha(onDisk) : "";
			const expectedSha = previous.deleted ? "" : String(previous.blobSha || "");
			if (actualSha !== expectedSha) {
				conflicts.push(`${item.kind}:${item.id}: previously archived Git content changed or disappeared (${relative})`);
			}
			continue;
		}
		stateChanged = true;
		const current = await readMaybe(absolute);
		const currentSha = current ? gitBlobSha(current) : "";
		const baseGitSha = String(item.baseGitSha || "").trim();
		const allowed = new Set([
			baseGitSha,
			previous?.path === relative && !previous?.deleted ? String(previous.blobSha || "") : "",
		].filter(Boolean));

		if (item.deleted) {
			if (current && !allowed.has(currentSha)) conflicts.push(`${item.kind}:${item.id}: refusing to delete Git content changed outside live archive (${relative})`);
			else if (current) operations.push({ type: "delete", relative, absolute });
			nextState.entries[key] = { kind:item.kind, id:item.id, path:relative, revision, blobSha:"", deleted:true };
			continue;
		}

		if (typeof item.source !== "string" || !item.source.trim()) {
			conflicts.push(`${item.kind}:${item.id}: live item has no source`);
			continue;
		}
		const source = Buffer.from(item.source, "utf8");
		const sourceSha = gitBlobSha(source);
		const renameTarget = Boolean(
			baseGitSha && item.revision &&
			tombstones.some((other) =>
				other !== item && other.kind === item.kind && other.revision === item.revision &&
				String(other.baseGitSha || "") === baseGitSha && String(other.path || "") !== relative),
		);

		if (current) {
			if (currentSha !== sourceSha) {
				if (allowed.has(currentSha)) operations.push({ type:"write", relative, absolute, source });
				else conflicts.push(`${item.kind}:${item.id}: refusing to overwrite Git content changed outside live archive (${relative})`);
			}
		} else {
			const archivedHere = previous?.path === relative && !previous?.deleted;
			if (archivedHere && !renameTarget) conflicts.push(`${item.kind}:${item.id}: archived Git file disappeared unexpectedly (${relative})`);
			else if (baseGitSha && !renameTarget && !previous?.deleted) conflicts.push(`${item.kind}:${item.id}: Git baseline file is missing (${relative})`);
			else operations.push({ type:"write", relative, absolute, source });
		}
		nextState.entries[key] = { kind:item.kind, id:item.id, path:relative, revision, blobSha:sourceSha, deleted:false };
	}

	if (conflicts.length) throw new Error(["Archive conflicts detected; no files were changed:", ...conflicts].join("\n"));
	if (stateChanged) nextState.archivedAt = new Date().toISOString();
	return { operations, nextState, stateChanged, exportedAt: payload.exportedAt || null };
}

export async function applyArchivePlan(plan, { rootDir = process.cwd() } = {}) {
	let written = 0, deleted = 0;
	for (const op of plan.operations.filter((item) => item.type === "write")) {
		await mkdir(path.dirname(op.absolute), { recursive: true });
		await writeFile(op.absolute, op.source);
		written += 1;
	}
	for (const op of plan.operations.filter((item) => item.type === "delete")) {
		await rm(op.absolute, { force: true });
		deleted += 1;
	}
	if (plan.stateChanged) {
		const stateFile = path.resolve(rootDir, ARCHIVE_STATE_PATH);
		await mkdir(path.dirname(stateFile), { recursive: true });
		await writeFile(stateFile, `${JSON.stringify(plan.nextState, null, 2)}\n`, "utf8");
	}
	return { written, deleted, stateUpdated: Boolean(plan.stateChanged) };
}

export async function runArchive({
	rootDir = process.cwd(),
	exportUrl = process.env.FIREFLY_LIVE_CONTENT_EXPORT_URL?.trim(),
	token = process.env.GITHUB_TOKEN?.trim(),
	fetchImpl = fetch,
} = {}) {
	if (!exportUrl) throw new Error("FIREFLY_LIVE_CONTENT_EXPORT_URL is required.");
	if (!token) throw new Error("GITHUB_TOKEN is required.");
	const response = await fetchImpl(exportUrl, {
		headers: { Accept:"application/json", Authorization:`Bearer ${token}`, "User-Agent":"Firefly-Live-Content-Archive" },
		signal: AbortSignal.timeout(30000),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(payload?.error || `Archive export failed: HTTP ${response.status}`);
	const plan = await createArchivePlan(payload, { rootDir });
	const result = await applyArchivePlan(plan, { rootDir });
	console.log(`Live content archive applied: written=${result.written}, deleted=${result.deleted}, stateUpdated=${result.stateUpdated}, exportedAt=${plan.exportedAt || "unknown"}`);
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runArchive().catch((error) => { console.error(error); process.exitCode = 1; });
}
