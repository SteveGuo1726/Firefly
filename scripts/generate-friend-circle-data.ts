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
	await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	console.log(`Friend circle data written: ${OUT_FILE}`);
	console.log(
		`friends=${feedFriends.length}, active=${activeNum}, articles=${articleData.length}, errors=${errorNum}, skipped=${skippedFriends.length}`,
	);
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
