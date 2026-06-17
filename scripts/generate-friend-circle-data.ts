import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { friendCircleConfig, getEnabledFriends } from "../src/config/friendsConfig";

type Friend = ReturnType<typeof getEnabledFriends>[number];

type Article = {
	title: string;
	link: string;
	author: string;
	avatar: string;
	summary: string;
	created: string;
	siteurl: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", ".friend-circle-dist");
const OUT_FILE = join(OUT_DIR, "all.json");
const OUT_JS_FILE = join(OUT_DIR, "all.js");
const OUT_HTML_FILE = join(OUT_DIR, "index.html");
const OUT_HEADERS_FILE = join(OUT_DIR, "_headers");
const OUT_PACKAGE_FILE = join(OUT_DIR, "package.json");
const OUT_BUILD_FILE = join(OUT_DIR, "build.mjs");
const OUT_README_FILE = join(OUT_DIR, "README.md");
const REQUEST_TIMEOUT = friendCircleConfig.requestTimeout ?? 8000;
const MAX_PER_FRIEND = friendCircleConfig.maxArticlesPerFriend ?? 5;
const FEED_PATHS = friendCircleConfig.feedPaths ?? [
	"/atom.xml",
	"/feed.xml",
	"/rss.xml",
	"/rss2.xml",
	"/index.xml",
	"/feed/",
	"/feed",
	"/rss",
	"/atom",
	"/index.atom",
	"/index.rss",
	"/feeds/all.atom.xml",
	"/?feed=rss2",
];

async function main() {
	const startedAt = Date.now();
	const allFriends = getEnabledFriends();
	const feedFriends = allFriends.filter((friend) => friend.fetchFeed !== false);
	const skippedFriends = allFriends.filter((friend) => friend.fetchFeed === false);
	const results = await Promise.all(feedFriends.map((friend) => fetchFriendArticles(friend)));
	const articleData = results
		.flatMap((result) => result.articles)
		.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
	const activeNum = results.filter((result) => result.articles.length > 0).length;
	const errorNum = results.filter((result) => result.error).length;
	const generatedAt = new Date().toISOString();
	const payload = {
		article_data: articleData,
		statistical_data: {
			friends_num: feedFriends.length,
			total_friends_num: allFriends.length,
			active_num: activeNum,
			article_num: articleData.length,
			error_num: errorNum,
			skipped_num: skippedFriends.length,
			last_updated_time: formatDateTime(generatedAt),
			generated_at: generatedAt,
			duration_ms: Date.now() - startedAt,
		},
		skipped: skippedFriends.map((friend) => ({ name: friend.title, siteurl: friend.siteurl })),
		errors: results
			.filter((result) => result.error)
			.map((result) => ({ name: result.friend.title, siteurl: result.friend.siteurl, error: result.error })),
	};

	await mkdir(OUT_DIR, { recursive: true });
	const payloadJson = `${JSON.stringify(payload, null, 2)}\n`;
	await writeFile(OUT_FILE, payloadJson, "utf8");
	await writeFile(OUT_JS_FILE, buildBrowserPayload(payload), "utf8");
	await writeFile(OUT_HTML_FILE, buildIndexHtml(payload), "utf8");
	await writeFile(OUT_HEADERS_FILE, buildHeaders(), "utf8");
	await writeFile(OUT_PACKAGE_FILE, buildPackageJson(), "utf8");
	await writeFile(OUT_BUILD_FILE, buildBuildScript(), "utf8");
	await writeFile(OUT_README_FILE, buildReadme(), "utf8");
	console.log(`Friend circle data written: ${OUT_FILE}`);
	console.log(
		`friends=${feedFriends.length}, active=${activeNum}, articles=${articleData.length}, errors=${errorNum}, skipped=${skippedFriends.length}`,
	);
}

function buildBrowserPayload(payload: unknown) {
	return [
		"globalThis.__FIREFLY_FRIEND_CIRCLE_DATA__ = ",
		JSON.stringify(payload, null, 2),
		";\n",
	].join("");
}

function buildIndexHtml(payload: {
	statistical_data: {
		article_num: number;
		active_num: number;
		error_num: number;
		skipped_num?: number;
		last_updated_time: string;
	};
}) {
	const stats = payload.statistical_data;
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firefly Friend Circle Data</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px auto; max-width: 860px; padding: 0 20px; color: #1f2937; background: #f8fafc; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
    h1 { margin-top: 0; font-size: 28px; }
    .meta { color: #6b7280; line-height: 1.7; }
    .links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
    a { color: #0f766e; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Firefly Friend Circle Data</h1>
    <div class="meta">
      <div>最近更新时间：${escapeHtml(stats.last_updated_time)}</div>
      <div>活跃订阅：${stats.active_num}</div>
      <div>文章总数：${stats.article_num}</div>
      <div>错误数：${stats.error_num}</div>
      <div>跳过数：${stats.skipped_num ?? 0}</div>
    </div>
    <div class="links">
      <a href="./all.json">查看 all.json</a>
      <a href="./all.js">查看 all.js</a>
    </div>
    <p class="meta" style="margin-top: 20px;">
      跨域加载推荐使用 <code>all.js</code>，页面可直接通过 <code>globalThis.__FIREFLY_FRIEND_CIRCLE_DATA__</code> 读取。
    </p>
  </div>
</body>
</html>
`;
}

function buildHeaders() {
	const cacheSeconds = friendCircleConfig.cacheSeconds ?? 3600;
	return `/all.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}

/all.js
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}

/index.html
  Cache-Control: no-cache
`;
}

function buildPackageJson() {
	return `${JSON.stringify(
		{
			name: "firefly-friend-circle-data",
			private: true,
			version: "1.0.0",
			description: "Static deploy bundle for Firefly friend circle data.",
			scripts: {
				build: "node build.mjs",
			},
		},
		null,
		2,
	)}\n`;
}

function buildBuildScript() {
	return `import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const files = ["all.json", "all.js", "index.html", "_headers", "README.md"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of files) {
  if (existsSync(file)) {
    cpSync(file, "dist/" + file);
  }
}

console.log("Prepared static friend circle dist/");
`;
}

function buildReadme() {
	return `# Firefly Friend Circle Data

This branch is a static publish bundle for Firefly friend circle data.

- \`all.json\`: standard JSON payload
- \`all.js\`: browser-friendly payload without CORS dependency
- \`index.html\`: simple status page
- \`package.json\` + \`build.mjs\`: optional no-dependency build entry for Pages platforms

Recommended:

1. Static direct deploy: publish repository root
2. Build deploy: run \`pnpm run build\`, output directory \`dist\`
`;
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

async function fetchFriendArticles(friend: Friend): Promise<{
	friend: Friend;
	articles: Article[];
	error?: string;
}> {
	const feedUrls = getFeedCandidates(friend);
	const errors: string[] = [];
	for (const feedUrl of feedUrls) {
		try {
			const xml = await fetchText(feedUrl);
			const parsed = parseFeed(xml, friend).slice(0, MAX_PER_FRIEND);
			if (parsed.length > 0) return { friend, articles: parsed };
			errors.push(`${feedUrl}: empty feed`);
		} catch (error) {
			errors.push(`${feedUrl}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { friend, articles: [], error: errors[0] || "feed not found" };
}

function getFeedCandidates(friend: Friend) {
	const urls = new Set<string>();
	if (friend.feedurl) urls.add(friend.feedurl);
	try {
		const base = new URL(friend.siteurl);
		for (const path of FEED_PATHS) urls.add(new URL(path, base).toString());
	} catch {
		// Invalid site URL is reported by the fetch loop as no candidates.
	}
	return [...urls];
}

async function fetchText(url: string) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
				"user-agent": "Firefly Friend Circle (+https://github.com/CuteLeaf/Firefly)",
			},
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const text = await response.text();
		if (!/<(rss|feed|rdf:RDF|item|entry)[\s>]/i.test(text)) throw new Error("not a feed");
		return text;
	} finally {
		clearTimeout(timer);
	}
}

function parseFeed(xml: string, friend: Friend): Article[] {
	const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
	const entryBlocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
	const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;
	return blocks
		.map((block) => parseEntry(block, friend))
		.filter((article): article is Article => Boolean(article))
		.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

function parseEntry(block: string, friend: Friend): Article | null {
	const title = textOf(block, "title");
	const link = linkOf(block) || friend.siteurl;
	const created = dateOf(block);
	if (!title || !created) return null;
	return {
		title,
		link: absolutize(link, friend.siteurl),
		author: friend.title,
		avatar: friend.imgurl,
		summary: excerptOf(block),
		created,
		siteurl: friend.siteurl,
	};
}

function textOf(block: string, tag: string) {
	const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
	if (!match) return "";
	return cleanText(match[1]);
}

function excerptOf(block: string) {
	const raw =
		textOf(block, "description") ||
		textOf(block, "summary") ||
		textOf(block, "content:encoded") ||
		textOf(block, "content") ||
		textOf(block, "media:description");
	return trimExcerpt(raw, 150);
}

function cleanText(value: string) {
	return decodeXml(stripCdata(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function trimExcerpt(value: string, maxLength: number) {
	const text = value.trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trimEnd()}...`;
}

function linkOf(block: string) {
	const atomAlternate = block.match(/<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i);
	if (atomAlternate?.[1]) return decodeXml(atomAlternate[1]);
	const atomAny = block.match(/<link\b(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i);
	if (atomAny?.[1]) return decodeXml(atomAny[1]);
	return textOf(block, "link");
}

function dateOf(block: string) {
	const raw = textOf(block, "pubDate") || textOf(block, "published") || textOf(block, "updated") || textOf(block, "dc:date");
	if (!raw) return "";
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function stripCdata(value: string) {
	return value.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

function decodeXml(value: string) {
	const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
		if (entity[0] === "#") {
			const isHex = entity[1]?.toLowerCase() === "x";
			const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
		}
		return named[entity.toLowerCase()] ?? `&${entity};`;
	});
}

function absolutize(value: string, baseUrl: string) {
	try {
		return new URL(value, baseUrl).toString();
	} catch {
		return value;
	}
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(value));
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
