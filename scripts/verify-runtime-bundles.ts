import { build } from "esbuild";

const entries = [
	{
		name: "EdgeOne live-content API",
		entry: "cloud-functions/api/live-content/[[default]].js",
		external: ["@edgeone/pages-blob"],
	},
	{
		name: "EdgeOne live-post fallback",
		entry: "cloud-functions/posts/[[default]].js",
		external: ["@edgeone/pages-blob"],
	},
	{
		name: "EdgeOne OAuth callback",
		entry: "cloud-functions/api/admin/auth/[[default]].js",
		external: ["@edgeone/pages-blob"],
	},
	{
		name: "EdgeOne gallery management proxy",
		entry: "cloud-functions/api/admin/gallery/[[default]].js",
		external: ["@edgeone/pages-blob"],
	},
	{
		name: "EdgeOne image management proxy",
		entry: "cloud-functions/api/admin/imagebed/[[default]].js",
		external: ["@edgeone/pages-blob"],
	},
	{
		name: "Cloudflare gallery worker",
		entry: "worker/index.ts",
		external: [],
	},
	{
		name: "Cloudflare preview worker",
		entry: "worker/blog-preview.ts",
		external: [],
	},
];

for (const target of entries) {
	const result = await build({
		entryPoints: [target.entry],
		bundle: true,
		write: false,
		format: "esm",
		platform: "neutral",
		target: "es2022",
		external: target.external,
		logLevel: "silent",
	});
	const bytes = result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0);
	if (bytes === 0) throw new Error(`${target.name} produced an empty bundle`);
	console.log(`FIREFLY_RUNTIME_CHECK_PASS ${target.name}: ${bytes} bytes`);
}
