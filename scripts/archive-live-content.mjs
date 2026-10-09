import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const exportUrl = process.env.FIREFLY_LIVE_CONTENT_EXPORT_URL?.trim();
const token = process.env.GITHUB_TOKEN?.trim();

if (!exportUrl) throw new Error("FIREFLY_LIVE_CONTENT_EXPORT_URL is required.");
if (!token) throw new Error("GITHUB_TOKEN is required.");

const response = await fetch(exportUrl, {
	headers: {
		Accept: "application/json",
		Authorization: `Bearer ${token}`,
		"User-Agent": "Firefly-Live-Content-Archive",
	},
	signal: AbortSignal.timeout(30000),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
	throw new Error(payload?.error || `Archive export failed: HTTP ${response.status}`);
}
if (payload?.schemaVersion !== 3) {
	throw new Error(`Unsupported live content schema: ${payload?.schemaVersion}`);
}

const roots = {
	post: "src/content/posts/",
	dynamic: "src/content/dynamic/",
};

function safePath(item) {
	const root = roots[item?.kind];
	const value = String(item?.path || "").replaceAll("\\", "/");
	if (
		!root ||
		!value.startsWith(root) ||
		value.includes("..") ||
		path.isAbsolute(value)
	) {
		throw new Error(`Unsafe archive path: ${value || "<empty>"}`);
	}
	if (item.kind === "post" && !/\.(?:md|mdx)$/i.test(value)) {
		throw new Error(`Invalid post archive path: ${value}`);
	}
	if (item.kind === "dynamic" && !/\.md$/i.test(value)) {
		throw new Error(`Invalid dynamic archive path: ${value}`);
	}
	return value;
}

let written = 0;
let deleted = 0;
for (const item of [...(payload.posts || []), ...(payload.dynamics || [])]) {
	const file = safePath(item);
	if (item.deleted) {
		await rm(file, { force: true });
		deleted += 1;
		continue;
	}
	if (typeof item.source !== "string" || !item.source.trim()) {
		throw new Error(`Live item ${item.kind}:${item.id} has no source.`);
	}
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, item.source, "utf8");
	written += 1;
}

console.log(
	`Live content archive applied: written=${written}, deleted=${deleted}, exportedAt=${payload.exportedAt || "unknown"}`,
);
