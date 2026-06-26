import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ci = require("ci-info");

const ENABLE_FLAG = process.env.FIREFLY_DEBUG_BUILD_PLATFORM;

if (
	!ENABLE_FLAG ||
	!["1", "true", "yes", "on"].includes(ENABLE_FLAG.toLowerCase())
) {
	process.exit(0);
}

const REDACT_VALUE_PATTERNS = [
	/token/i,
	/secret/i,
	/password/i,
	/cookie/i,
	/credential/i,
	/auth/i,
	/^github_token$/i,
	/^gitee_token$/i,
	/^access_token$/i,
];

const URL_LIKE_KEY_PATTERNS = [
	/url/i,
	/endpoint/i,
	/address/i,
	/host/i,
];

function shouldRedactKey(key) {
	return REDACT_VALUE_PATTERNS.some((pattern) => pattern.test(key));
}

function isUrlLikeKey(key) {
	return URL_LIKE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeValue(key, value) {
	if (shouldRedactKey(key)) {
		return "[REDACTED]";
	}

	if (isUrlLikeKey(key)) {
		try {
			const url = new URL(value);
			return `[URL host=${url.host}]`;
		} catch {
			return value;
		}
	}

	if (value.length > 240) {
		return `${value.slice(0, 240)}...[TRUNCATED]`;
	}

	return value;
}

const entries = Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b));

console.log("[firefly] Build platform diagnostics enabled.");
console.log(
	`[firefly] ci-info: isCI=${String(ci.isCI)}, name=${ci.name ?? "null"}, id=${ci.id ?? "null"}, isPR=${String(ci.isPR)}`,
);
console.log("[firefly] All environment variable keys (sorted):");
console.log(entries.map(([key]) => key).join(", "));
console.log("[firefly] Environment variable preview:");

for (const [key, value] of entries) {
	if (typeof value !== "string") continue;
	console.log(`${key}=${sanitizeValue(key, value)}`);
}

console.log("[firefly] End of build platform diagnostics.");
