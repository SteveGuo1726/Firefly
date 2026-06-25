type DetectBuildPlatformOptions = {
	env: Record<string, string | undefined>;
	isCI: boolean;
	ciName?: string | null;
	isDev?: boolean;
	unknownBuildPlatform?: string;
};

const BUILD_PLATFORM_OVERRIDE_KEYS = [
	"SITE_BUILD_PLATFORM",
	"BUILD_PLATFORM_NAME",
	"FIRELY_BUILD_PLATFORM",
];

function hasAnyEnv(
	env: Record<string, string | undefined>,
	keys: string[],
): boolean {
	return keys.some((key) => {
		const value = env[key];
		return typeof value === "string" && value.trim() !== "";
	});
}

function anyEnvKeyOrValueMatches(
	env: Record<string, string | undefined>,
	patterns: RegExp[],
): boolean {
	return Object.entries(env).some(([key, value]) => {
		if (patterns.some((pattern) => pattern.test(key))) return true;
		if (
			typeof value === "string" &&
			patterns.some((pattern) => pattern.test(value))
		) {
			return true;
		}
		return false;
	});
}

export function detectBuildPlatform({
	env,
	isCI,
	ciName,
	isDev = false,
	unknownBuildPlatform = "Unknown CI",
}: DetectBuildPlatformOptions): string {
	for (const key of BUILD_PLATFORM_OVERRIDE_KEYS) {
		const value = env[key];
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
	}

	if (
		hasAnyEnv(env, ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_REPOSITORY"])
	) {
		return "GitHub Actions";
	}

	if (hasAnyEnv(env, ["CF_PAGES", "CLOUDFLARE_PAGES"])) {
		return "Cloudflare Pages";
	}

	if (hasAnyEnv(env, ["CF_WORKERS"])) {
		return "Cloudflare Workers";
	}

	if (hasAnyEnv(env, ["VERCEL", "VERCEL_ENV"])) {
		return "Vercel";
	}

	if (hasAnyEnv(env, ["NETLIFY", "NETLIFY_IMAGES_CDN_DOMAIN"])) {
		return "Netlify";
	}

	if (
		hasAnyEnv(env, [
			"EDGEONE",
			"EDGEONE_ENV",
			"EDGEONE_PROJECT_NAME",
			"EDGEONE_BRANCH",
			"EDGEONE_PAGES",
			"EDGEONE_SERVICE_NAME",
			"EDGEONE_DEPLOYMENT_ID",
			"TENCENT_EDGEONE",
		]) ||
		anyEnvKeyOrValueMatches(env, [/edgeone/i, /pages\.edgeone/i])
	) {
		return "Tencent EdgeOne Pages";
	}

	if (
		hasAnyEnv(env, [
			"ALIBABA_CLOUD_ESA",
			"ALIBABA_CLOUD_PAGES",
			"ESA",
			"ESA_ENV",
			"ESA_PROJECT_NAME",
			"ESA_REGION",
			"ALIYUN_ESA",
		]) ||
		anyEnvKeyOrValueMatches(env, [
			/(^|[_-])esa([_-]|$)/i,
			/aliyun/i,
			/alibabacloud/i,
			/alibaba cloud/i,
		])
	) {
		return "Alibaba Cloud ESA Pages";
	}

	if (isCI) {
		return ciName || unknownBuildPlatform;
	}

	return isDev ? "Local Dev" : "Local";
}
