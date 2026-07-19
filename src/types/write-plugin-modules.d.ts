declare module "@/plugins/plantuml-encoder.js" {
	export function encodePlantUML(source: string): string;
	export function injectTheme(source: string, themeName: string): string;
	export function buildUrl(server: string, encoded: string): string;
}

declare module "@/plugins/rehype-external-links.mjs" {
	type ExternalLinksOptions = {
		siteUrl?: string;
	};

	export default function rehypeExternalLinks(
		options?: ExternalLinksOptions,
	): (tree: unknown) => void;
}

declare module "@/plugins/rehype-figure.mjs" {
	export default function rehypeFigure(): (tree: unknown) => void;
}

declare module "@/plugins/remark-directive-rehype.js" {
	export function parseDirectiveNode(): (tree: unknown) => void;
}

declare module "@/plugins/remark-image-grid.js" {
	export function remarkImageGrid(): (tree: unknown) => void;
}
