import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute } from "astro";
import { friendCircleConfig, getEnabledFriends } from "@/config";

export const prerender = true;

const DATA_FILE = join(process.cwd(), ".friend-circle-dist", "all.json");

export const GET: APIRoute = async () => {
	const cacheSeconds = friendCircleConfig.cacheSeconds ?? 3600;
	return new Response(await readPayload(), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`,
		},
	});
};

async function readPayload() {
	try {
		return await readFile(DATA_FILE, "utf8");
	} catch {
		const friends = getEnabledFriends();
		const generatedAt = new Date().toISOString();
		return JSON.stringify({
			article_data: [],
			statistical_data: {
				friends_num: friends.length,
				active_num: 0,
				article_num: 0,
				error_num: 0,
				last_updated_time: formatDateTime(generatedAt),
				generated_at: generatedAt,
				duration_ms: 0,
			},
			errors: [],
		});
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
