type DetectBuildPlatformOptions = {
	env: Record<string, string | undefined>;
	isCI: boolean;
	ciName?: string | null;
	ciId?: string | null;
	isDev?: boolean;
	unknownBuildPlatform?: string;
};

const BUILD_PLATFORM_OVERRIDE_KEYS = [
	"SITE_BUILD_PLATFORM",
	"BUILD_PLATFORM_NAME",
	"FIREFLY_BUILD_PLATFORM",
	"FIRELY_BUILD_PLATFORM",
];

const FRIENDLY_CI_PLATFORM_NAMES = {
	GITHUB_ACTIONS: "GitHub Actions",
	CLOUDFLARE_PAGES: "Cloudflare Pages",
	CLOUDFLARE_WORKERS: "Cloudflare Workers",
	VERCEL: "Vercel",
	NETLIFY: "Netlify",
} as const;

const PLATFORM_NAME_ALIASES = new Map<string, string>([
	["github actions", "GitHub Actions"],
	["cloudflare pages", "Cloudflare Pages"],
	["cloudflare workers", "Cloudflare Workers"],
	["vercel", "Vercel"],
	["netlify", "Netlify"],
	["netlify ci", "Netlify"],
	["edgeone", "EdgeOne Pages"],
	["edgeone pages", "EdgeOne Pages"],
	["tencent edgeone", "EdgeOne Pages"],
	["tencent edgeone pages", "EdgeOne Pages"],
	["esa", "ESA Pages"],
	["esa pages", "ESA Pages"],
	["alibaba cloud esa", "ESA Pages"],
	["alibaba cloud esa pages", "ESA Pages"],
]);

const EDGEONE_STRONG_ENV_KEYS = [
	"EDGEONE_PROJECT_NAME",
	"EDGEONE_SERVICE_NAME",
	"EDGEONE_DEPLOYMENT_ID",
];

const EDGEONE_WEAK_ENV_KEYS = [
	"EDGEONE",
	"EDGEONE_ENV",
	"EDGEONE_BRANCH",
	"EDGEONE_PAGES",
	"TENCENT_EDGEONE",
];

const ESA_STRONG_ENV_KEYS = [
	"ALIBABA_CLOUD_ESA",
	"ALIYUN_ESA",
	"ESA_PROJECT_NAME",
	"ESA_REGION",
];

const ESA_WEAK_ENV_KEYS = ["ALIBABA_CLOUD_PAGES", "ESA_ENV", "ESA"];

function hasAnyEnv(
	env: Record<string, string | undefined>,
	keys: string[],
): boolean {
	return keys.some((key) => {
		const value = env[key];
		return typeof value === "string" && value.trim() !== "";
	});
}

function countEnv(
	env: Record<string, string | undefined>,
	keys: string[],
): number {
	return keys.reduce((count, key) => {
		const value = env[key];
		return typeof value === "string" && value.trim() !== "" ? count + 1 : count;
	}, 0);
}

function normalizePlatformName(value?: string | null): string | null {
	if (!value) return null;
	const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
	return PLATFORM_NAME_ALIASES.get(normalized) ?? null;
}

export function detectBuildPlatform({
	env,
	isCI,
	ciName,
	ciId,
	isDev = false,
	unknownBuildPlatform = "Unknown CI",
}: DetectBuildPlatformOptions): string {
	for (const key of BUILD_PLATFORM_OVERRIDE_KEYS) {
		const value = env[key];
		if (typeof value === "string" && value.trim() !== "") {
			return normalizePlatformName(value) ?? value.trim();
		}
	}

	if (ciId && ciId in FRIENDLY_CI_PLATFORM_NAMES) {
		return FRIENDLY_CI_PLATFORM_NAMES[
			ciId as keyof typeof FRIENDLY_CI_PLATFORM_NAMES
		];
	}

	const normalizedCiName = normalizePlatformName(ciName);
	if (normalizedCiName) {
		return normalizedCiName;
	}

	if (
		hasAnyEnv(env, ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_REPOSITORY"])
	) {
		return "GitHub Actions";
	}

	if (hasAnyEnv(env, ["CF_PAGES", "CLOUDFLARE_PAGES"])) {
		return "Cloudflare Pages";
	}

	if (hasAnyEnv(env, ["WORKERS_CI", "CF_WORKERS"])) {
		return "Cloudflare Workers";
	}

	if (hasAnyEnv(env, ["VERCEL", "VERCEL_ENV", "NOW_BUILDER"])) {
		return "Vercel";
	}

	if (hasAnyEnv(env, ["NETLIFY", "NETLIFY_IMAGES_CDN_DOMAIN"])) {
		return "Netlify";
	}

	if (
		hasAnyEnv(env, EDGEONE_STRONG_ENV_KEYS) ||
		countEnv(env, EDGEONE_WEAK_ENV_KEYS) >= 2
	) {
		return "EdgeOne Pages";
	}

	if (
		hasAnyEnv(env, ESA_STRONG_ENV_KEYS) ||
		countEnv(env, ESA_WEAK_ENV_KEYS) >= 2
	) {
		return "ESA Pages";
	}

	if (isCI) {
		return ciName || unknownBuildPlatform;
	}

	return isDev ? "Local Dev" : "Local";
}
