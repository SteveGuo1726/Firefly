import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { dynamicPlainText, sortDynamics } from "@/utils/dynamic-utils";

export const prerender = true;

export const GET: APIRoute = async () => {
	const [posts,dynamicEntries]=await Promise.all([
		getCollection("posts"),
		getCollection("dynamic"),
	]);

	const postItems=posts.map((post)=>{
		const filePath = post.filePath?.replace(/\\/g, "/") || "";
		const marker = "src/content/posts/";
		const relative = filePath.includes(marker)
			? filePath.slice(filePath.indexOf(marker) + marker.length)
			: `${post.id}.md`;
		return {
			id:post.id.replace(/\.(?:md|mdx)$/i,""),
			path:`src/content/posts/${relative}`,
			title:post.data.title,
			description:post.data.description,
			published:post.data.published.toISOString(),
			updated:post.data.updated?.toISOString()||"",
			category:post.data.category||"",
			tags:post.data.tags,
			draft:post.data.draft,
			pinned:post.data.pinned,
			image:post.data.image,
		};
	}).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));

	const dynamics=sortDynamics(dynamicEntries).map((entry)=>{
		const filePath = entry.filePath?.replace(/\\/g, "/") || "";
		const marker = "src/content/dynamic/";
		const relative = filePath.includes(marker)
			? filePath.slice(filePath.indexOf(marker) + marker.length)
			: `${entry.id.replace(/\.md$/i, "")}.md`;
		return {
			id:entry.id.replace(/\.md$/i,""),
			path:`src/content/dynamic/${relative}`,
		published:entry.data.published.toISOString(),
		pinned:entry.data.pinned,
		location:entry.data.location,
		excerpt:dynamicPlainText(entry).slice(0,160),
		};
	});

	return new Response(JSON.stringify({
		generatedAt:new Date().toISOString(),
		posts:postItems,
		dynamics,
	}),{headers:{
		"content-type":"application/json; charset=utf-8",
		"cache-control":"no-store",
	}});
};
