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

const INCLUDE_KEY_PATTERNS = [
	/^CI$/i,
	/^CI_/i,
	/^BUILD_/i,
	/^RUN_/i,
	/^PROJECT/i,
	/^SERVICE/i,
	/^REGION/i,
	/^DEPLOY/i,
	/^TRIGGER/i,
	/^EXECUTOR/i,
	/^MESSAGE/i,
	/^GITHUB_/i,
	/^CF_/i,
	/^WORKERS_/i,
	/^VERCEL/i,
	/^NETLIFY/i,
	/^EDGEONE/i,
	/^TENCENT_EDGEONE/i,
	/^ESA(?:_|$)/i,
	/^ALIYUN/i,
	/^ALIBABA/i,
	/^ALIYUN_ESA/i,
	/^ALIBABA_CLOUD_ESA/i,
	/^PAGES_/i,
	/^SITE_BUILD_PLATFORM$/i,
	/^BUILD_PLATFORM_NAME$/i,
	/^FIREFLY_BUILD_PLATFORM$/i,
	/^FIRELY_BUILD_PLATFORM$/i,
];

const INCLUDE_VALUE_PATTERNS = [
	/edgeone/i,
	/tencent/i,
	/esa/i,
	/aliyun/i,
	/alibaba/i,
	/pages/i,
	/pop/i,
];

const REDACT_VALUE_PATTERNS = [
	/token/i,
	/secret/i,
	/password/i,
	/key/i,
	/cookie/i,
	/credential/i,
	/auth/i,
];

function shouldIncludeKey(key) {
	return INCLUDE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function shouldIncludeValue(value) {
	return INCLUDE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function shouldRedactKey(key) {
	return REDACT_VALUE_PATTERNS.some((pattern) => pattern.test(key));
}

const entries = Object.entries(process.env)
	.filter(([key, value]) => {
		return (
			typeof value === "string" &&
			(shouldIncludeKey(key) || shouldIncludeValue(value))
		);
	})
	.sort(([a], [b]) => a.localeCompare(b));

console.log("[firefly] Build platform diagnostics enabled.");
console.log(
	`[firefly] ci-info: isCI=${String(ci.isCI)}, name=${ci.name ?? "null"}, id=${ci.id ?? "null"}, isPR=${String(ci.isPR)}`,
);
console.log("[firefly] Relevant environment variables:");

for (const [key, value] of entries) {
	const safeValue = shouldRedactKey(key) ? "[REDACTED]" : value;
	console.log(`${key}=${safeValue}`);
}

console.log("[firefly] End of build platform diagnostics.");
