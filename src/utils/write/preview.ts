import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { createRenderer } from "astro-expressive-code";
import { toHtml } from "astro-expressive-code/hast";
import { pluginCollapsible } from "expressive-code-collapsible";
import { expressiveCodeConfig } from "@/config/expressiveCodeConfig";
import { plantumlConfig } from "@/config/plantumlConfig";
import { siteConfig } from "@/config/siteConfig";
import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";
import {
	buildUrl as buildPlantumlUrl,
	encodePlantUML,
	injectTheme as injectPlantumlTheme,
} from "@/plugins/plantuml-encoder.js";
import rehypeExternalLinks from "@/plugins/rehype-external-links.mjs";
import rehypeFigure from "@/plugins/rehype-figure.mjs";
import { parseDirectiveNode } from "@/plugins/remark-directive-rehype.js";
import { remarkImageGrid } from "@/plugins/remark-image-grid.js";
import type { GitHubRepoConfig } from "./github";

type UnknownNode = {
	type?: string;
	name?: string;
	tagName?: string;
	lang?: string;
	meta?: string;
	value?: string;
	children?: UnknownNode[];
	data?: Record<string, unknown>;
	attributes?: Record<string, unknown>;
	properties?: Record<string, unknown>;
	[key: string]: unknown;
};

type GenericPlugin = (...args: unknown[]) => unknown;
type GenericVisit = (
	tree: UnknownNode,
	test: unknown,
	visitor?: unknown,
) => void;

type ProcessorLike = {
	use: (...args: unknown[]) => ProcessorLike;
	process: (value: string) => Promise<unknown>;
};

type MermaidModule = {
	initialize: (config: Record<string, unknown>) => void;
	render: (id: string, code: string) => Promise<{ svg: string }>;
};

type PreviewDeps = {
	unified: (...args: unknown[]) => ProcessorLike;
	remarkGfm: GenericPlugin;
	remarkParse: GenericPlugin;
	remarkDirective: GenericPlugin;
	remarkMath: GenericPlugin;
	remarkSectionize: GenericPlugin;
	remarkRehype: GenericPlugin;
	rehypeRaw: GenericPlugin;
	rehypeStringify: GenericPlugin;
	rehypeKatex: GenericPlugin;
	rehypeSlug: GenericPlugin;
	rehypeAutolinkHeadings: GenericPlugin;
	rehypeCallouts: GenericPlugin;
	visit: GenericVisit;
};

type RenderPreviewOptions = {
	source: string;
	calloutTheme?: string;
	isMdx?: boolean;
};

type EnhancePreviewOptions = {
	container: HTMLElement;
	repoConfig: Pick<GitHubRepoConfig, "owner" | "repo" | "branch"> | null;
	postFilePath: string;
};

type GitHubRepoPayload = {
	description?: string;
	language?: string;
	stargazers_count?: number;
	forks?: number;
	license?: {
		spdx_id?: string;
	};
	owner?: {
		avatar_url?: string;
	};
};

type ExpressiveCodeRenderer = Awaited<ReturnType<typeof createRenderer>>;

let previewDepsPromise: Promise<PreviewDeps> | null = null;
let mermaidModulePromise: Promise<MermaidModule> | null = null;
let iconifyLoaderPromise: Promise<void> | null = null;
let expressiveCodeRendererPromise: Promise<ExpressiveCodeRenderer> | null =
	null;

function loadEsm<T = unknown>(url: string): Promise<T> {
	return import(/* @vite-ignore */ url) as Promise<T>;
}

function evaluateMdxExpression(expression: string): string {
	try {
		const result = Function(`"use strict"; return (${expression});`)();
		if (result === undefined || result === null) {
			return "";
		}
		return String(result);
	} catch {
		return `{${expression}}`;
	}
}

function replaceExportedConstants(source: string): string {
	const constants = new Map<string, string>();
	const cleaned = source.replace(
		/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*$/gm,
		(_, name: string, expression: string) => {
			constants.set(name, evaluateMdxExpression(expression));
			return "";
		},
	);

	let result = cleaned;
	for (const [name, value] of constants.entries()) {
		result = result.replaceAll(`{${name}}`, value);
	}
	return result;
}

function replaceIconComponents(source: string): string {
	return source.replace(
		/<Icon\s+([^>]*?)name=["']([^"']+)["']([^>]*?)\/>/g,
		(_, beforeName: string, iconName: string, afterName: string) => {
			const classMatch = `${beforeName} ${afterName}`.match(
				/class(Name)?=["']([^"']+)["']/,
			);
			const className = classMatch?.[2] || "";
			return `<iconify-icon icon="${iconName}" class="${className}"></iconify-icon>`;
		},
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function preprocessSource(source: string, isMdx = false): string {
	let result = source.replace(/^\s*import\s.+$/gm, "");
	if (isMdx) {
		result = replaceExportedConstants(result);
	}
	result = replaceIconComponents(result);
	result = result.replace(/className=/g, "class=");
	return result;
}

async function renderCodeFenceWithExpressiveCode(
	language: string,
	meta: string,
	code: string,
): Promise<string> {
	const renderer = await getExpressiveCodeRenderer();
	const { renderedGroupAst, styles } = await renderer.ec.render({
		code,
		language,
		meta,
	});

	const styleParts = [
		renderer.baseStyles,
		renderer.themeStyles,
		...styles,
	].filter(
		(part): part is string => typeof part === "string" && part.length > 0,
	);
	const moduleParts = [...new Set(renderer.jsModules)].filter(
		(part): part is string => typeof part === "string" && part.length > 0,
	);

	if (styleParts.length > 0 && renderedGroupAst.type === "element") {
		const firstChild =
			renderedGroupAst.children.length > 0
				? renderedGroupAst.children[0]
				: undefined;
		const firstChildIsStyle =
			firstChild?.type === "element" &&
			(firstChild.tagName === "style" || firstChild.tagName === "link");
		const insertIndex = firstChildIsStyle ? 1 : 0;
		renderedGroupAst.children.splice(insertIndex, 0, {
			type: "element",
			tagName: "style",
			properties: {},
			children: [{ type: "text", value: styleParts.join("") }],
		});
	}

	const html = toHtml(renderedGroupAst);
	if (moduleParts.length === 0) {
		return html;
	}

	const scriptsHtml = moduleParts
		.map(
			(moduleCode) =>
				`<script type="module" data-ec-preview-module="true">${moduleCode}</script>`,
		)
		.join("");
	return `${html}${scriptsHtml}`;
}

async function preprocessCodeFences(source: string): Promise<string> {
	// Only preprocess real fenced code blocks.
	// Indented tutorial examples may contain literal ``` fences that should stay as text.
	const pattern = /^( {0,3})```([^\n`]*)\n([\s\S]*?)^\1```[ \t]*$/gm;
	const matches = Array.from(source.matchAll(pattern));
	if (matches.length === 0) {
		return source;
	}

	let result = "";
	let lastIndex = 0;

	for (const match of matches) {
		const [fullMatch, _indent, infoStringRaw, codeRaw] = match;
		const startIndex = match.index ?? 0;
		const endIndex = startIndex + fullMatch.length;
		result += source.slice(lastIndex, startIndex);

		const infoString = infoStringRaw.trim();
		const [language = "", ...metaParts] = infoString
			.split(/\s+/)
			.filter(Boolean);
		const meta = metaParts.join(" ");
		const code = codeRaw.replace(/\n$/, "");

		if (language === "mermaid" || language === "plantuml") {
			result += fullMatch;
		} else {
			try {
				result += await renderCodeFenceWithExpressiveCode(language, meta, code);
			} catch {
				result += fullMatch;
			}
		}

		lastIndex = endIndex;
	}

	result += source.slice(lastIndex);
	return result;
}

async function preprocessPreviewSource(source: string): Promise<string> {
	let result = preprocessSource(source, false);
	result = await preprocessCodeFences(result);
	return result;
}

async function getExpressiveCodeRenderer(): Promise<ExpressiveCodeRenderer> {
	if (!expressiveCodeRendererPromise) {
		expressiveCodeRendererPromise = createRenderer({
			themes: [
				expressiveCodeConfig.darkTheme as "one-dark-pro",
				expressiveCodeConfig.lightTheme as "one-light",
			],
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme: { name: string }) =>
				`[data-theme='${theme.name}']`,
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				...(expressiveCodeConfig.pluginCollapsible?.enable === true
					? [
							pluginCollapsible({
								lineThreshold:
									expressiveCodeConfig.pluginCollapsible.lineThreshold || 15,
								previewLines:
									expressiveCodeConfig.pluginCollapsible.previewLines || 8,
								defaultCollapsed:
									expressiveCodeConfig.pluginCollapsible.defaultCollapsed ??
									true,
								expandButtonText: i18n(I18nKey.codeCollapsibleShowMore),
								collapseButtonText: i18n(I18nKey.codeCollapsibleShowLess),
								expandedAnnouncement: i18n(I18nKey.codeCollapsibleExpanded),
								collapsedAnnouncement: i18n(I18nKey.codeCollapsibleCollapsed),
							}),
						]
					: []),
			],
			defaultProps: {
				wrap: false,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			shiki: {
				engine: "javascript",
			},
			styleOverrides: {
				borderRadius: "0.75rem",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
				codeLineHeight: "1.5rem",
				frames: {},
				textMarkers: {
					delHue: "0",
					insHue: "180",
					markHue: "250",
				},
			},
			frames: {
				showCopyToClipboardButton: true,
			},
		});
	}

	return expressiveCodeRendererPromise;
}

function createGithubDirectivePlugin(visit: GenericVisit) {
	return () => (tree: UnknownNode) => {
		visit(tree, (node: UnknownNode) => {
			if (node.type !== "leafDirective" || node.name !== "github") return;

			const repo = node.attributes?.repo;
			if (!repo || typeof repo !== "string" || !repo.includes("/")) {
				return;
			}

			const [owner, repository] = repo.split("/");
			node.type = "paragraph";
			node.children = [];
			node.data = {
				hName: "a",
				hProperties: {
					className: ["card-github", "fetch-waiting", "no-styling"],
					href: `https://github.com/${repo}`,
					target: "_blank",
					rel: "noopener noreferrer",
					repo,
				},
				hChildren: [
					{
						type: "element",
						tagName: "div",
						properties: { className: ["gc-titlebar"] },
						children: [
							{
								type: "element",
								tagName: "div",
								properties: { className: ["gc-titlebar-left"] },
								children: [
									{
										type: "element",
										tagName: "div",
										properties: { className: ["gc-owner"] },
										children: [
											{
												type: "element",
												tagName: "div",
												properties: { className: ["gc-avatar"] },
												children: [],
											},
											{
												type: "element",
												tagName: "div",
												properties: { className: ["gc-user"] },
												children: [{ type: "text", value: owner }],
											},
										],
									},
									{
										type: "element",
										tagName: "div",
										properties: { className: ["gc-divider"] },
										children: [{ type: "text", value: "/" }],
									},
									{
										type: "element",
										tagName: "div",
										properties: { className: ["gc-repo"] },
										children: [{ type: "text", value: repository }],
									},
								],
							},
							{
								type: "element",
								tagName: "div",
								properties: { className: ["github-logo"] },
								children: [],
							},
						],
					},
					{
						type: "element",
						tagName: "div",
						properties: { className: ["gc-description"] },
						children: [{ type: "text", value: "Loading repo info..." }],
					},
					{
						type: "element",
						tagName: "div",
						properties: { className: ["gc-infobar"] },
						children: [
							{
								type: "element",
								tagName: "div",
								properties: { className: ["gc-stars"] },
								children: [{ type: "text", value: "--" }],
							},
							{
								type: "element",
								tagName: "div",
								properties: { className: ["gc-forks"] },
								children: [{ type: "text", value: "--" }],
							},
							{
								type: "element",
								tagName: "div",
								properties: { className: ["gc-license"] },
								children: [{ type: "text", value: "--" }],
							},
							{
								type: "element",
								tagName: "span",
								properties: { className: ["gc-language"] },
								children: [{ type: "text", value: "Loading..." }],
							},
						],
					},
				],
			};
		});
	};
}

function createMermaidDirectivePlugin(visit: GenericVisit) {
	return () => (tree: UnknownNode) => {
		visit(tree, "code", (node: UnknownNode) => {
			if (node.lang !== "mermaid") return;

			const code = typeof node.value === "string" ? node.value : "";
			node.type = "html";
			node.value = `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(code)}</div></div>`;
		});
	};
}

function createPlantumlDirectivePlugin(visit: GenericVisit) {
	return () => (tree: UnknownNode) => {
		if (plantumlConfig.enable === false) {
			return;
		}

		visit(tree, "code", (node: UnknownNode) => {
			if (node.lang !== "plantuml") return;

			const code = typeof node.value === "string" ? node.value : "";
			if (!code.trim()) return;

			const lightSource = injectPlantumlTheme(code, plantumlConfig.lightTheme);
			const darkSource = injectPlantumlTheme(code, plantumlConfig.darkTheme);
			const lightUrl = buildPlantumlUrl(
				plantumlConfig.server,
				encodePlantUML(lightSource),
			);
			const darkUrl =
				darkSource === lightSource
					? lightUrl
					: buildPlantumlUrl(plantumlConfig.server, encodePlantUML(darkSource));

			node.type = "html";
			node.value =
				`<div class="plantuml-diagram-container"><div class="plantuml-wrapper">` +
				`<img class="plantuml-image" src="${lightUrl}" data-light-src="${lightUrl}" data-dark-src="${darkUrl}" alt="PlantUML diagram" loading="lazy" decoding="async" />` +
				"</div></div>";
		});
	};
}

async function loadPreviewDeps(): Promise<PreviewDeps> {
	if (!previewDepsPromise) {
		previewDepsPromise = (async () => {
			const [
				unifiedModule,
				remarkGfmModule,
				remarkParseModule,
				remarkDirectiveModule,
				remarkMathModule,
				remarkSectionizeModule,
				remarkRehypeModule,
				rehypeRawModule,
				rehypeStringifyModule,
				rehypeKatexModule,
				rehypeSlugModule,
				rehypeAutolinkHeadingsModule,
				rehypeCalloutsModule,
				visitModule,
			] = await Promise.all([
				loadEsm<Record<string, unknown>>("https://esm.sh/unified@11"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-gfm@4"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-parse@11"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-directive@3"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-math@6"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-sectionize@2"),
				loadEsm<Record<string, unknown>>("https://esm.sh/remark-rehype@11"),
				loadEsm<Record<string, unknown>>("https://esm.sh/rehype-raw@7"),
				loadEsm<Record<string, unknown>>("https://esm.sh/rehype-stringify@10"),
				loadEsm<Record<string, unknown>>("https://esm.sh/rehype-katex@7"),
				loadEsm<Record<string, unknown>>("https://esm.sh/rehype-slug@6"),
				loadEsm<Record<string, unknown>>(
					"https://esm.sh/rehype-autolink-headings@7",
				),
				loadEsm<Record<string, unknown>>("https://esm.sh/rehype-callouts@2"),
				loadEsm<Record<string, unknown>>("https://esm.sh/unist-util-visit@5"),
			]);

			return {
				unified: unifiedModule.unified as PreviewDeps["unified"],
				remarkGfm: remarkGfmModule.default as GenericPlugin,
				remarkParse: remarkParseModule.default as GenericPlugin,
				remarkDirective: remarkDirectiveModule.default as GenericPlugin,
				remarkMath: remarkMathModule.default as GenericPlugin,
				remarkSectionize: remarkSectionizeModule.default as GenericPlugin,
				remarkRehype: remarkRehypeModule.default as GenericPlugin,
				rehypeRaw: rehypeRawModule.default as GenericPlugin,
				rehypeStringify: rehypeStringifyModule.default as GenericPlugin,
				rehypeKatex: rehypeKatexModule.default as GenericPlugin,
				rehypeSlug: rehypeSlugModule.default as GenericPlugin,
				rehypeAutolinkHeadings:
					rehypeAutolinkHeadingsModule.default as GenericPlugin,
				rehypeCallouts: rehypeCalloutsModule.default as GenericPlugin,
				visit: visitModule.visit as GenericVisit,
			};
		})();
	}

	return previewDepsPromise;
}

async function loadMermaidModule(): Promise<MermaidModule> {
	if (!mermaidModulePromise) {
		mermaidModulePromise = loadEsm<Record<string, unknown>>(
			"https://esm.sh/mermaid@11?bundle",
		).then((module) => (module.default ?? module) as MermaidModule);
	}

	return mermaidModulePromise;
}

async function ensureIconifyLoaded(container: HTMLElement): Promise<void> {
	if (!container.querySelector("iconify-icon")) {
		return;
	}

	if (!iconifyLoaderPromise) {
		iconifyLoaderPromise = new Promise<void>((resolve, reject) => {
			if (window.customElements?.get("iconify-icon")) {
				resolve();
				return;
			}

			const script = document.createElement("script");
			script.src =
				"https://code.iconify.design/iconify-icon/2.2.0/iconify-icon.min.js";
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error("Failed to load Iconify"));
			document.head.appendChild(script);
		});
	}

	await iconifyLoaderPromise;
}

function getRepoRelativeBase(postFilePath: string): string {
	const lastSlashIndex = postFilePath.lastIndexOf("/");
	return lastSlashIndex === -1 ? "" : postFilePath.slice(0, lastSlashIndex + 1);
}

function joinRelativePath(basePath: string, relativePath: string): string {
	const stack = basePath.split("/").filter(Boolean);
	const segments = relativePath.split("/");

	for (const segment of segments) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			stack.pop();
			continue;
		}
		stack.push(segment);
	}

	return stack.join("/");
}

function matchesNoReferrerDomain(hostname: string): boolean {
	const domains = siteConfig.imageOptimization?.noReferrerDomains || [];
	return domains.some((pattern) => {
		const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
		return new RegExp(`^${regexPattern}$`).test(hostname);
	});
}

export function resolvePreviewAssetUrl(
	src: string,
	repoConfig: EnhancePreviewOptions["repoConfig"],
	postFilePath: string,
): string {
	if (!src) return src;
	if (src.startsWith("data:")) return src;
	if (src.startsWith("http://") || src.startsWith("https://")) return src;

	const baseUrl = import.meta.env.BASE_URL || "/";
	if (src.startsWith("/")) {
		return `${window.location.origin}${baseUrl.replace(/\/$/, "")}${src}`;
	}

	if (!repoConfig) return src;

	const repoRelativeBase = getRepoRelativeBase(postFilePath);
	const resolvedRepoPath = joinRelativePath(repoRelativeBase, src);
	return `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${encodeURIComponent(repoConfig.branch)}/${resolvedRepoPath}`;
}

export function resolvePreviewAssetCandidates(
	src: string,
	repoConfig: EnhancePreviewOptions["repoConfig"],
	postFilePath: string,
): string[] {
	if (!src) return [];
	if (src.startsWith("data:")) return [src];
	if (src.startsWith("http://") || src.startsWith("https://")) return [src];

	const baseUrl = import.meta.env.BASE_URL || "/";
	if (src.startsWith("/")) {
		return [`${window.location.origin}${baseUrl.replace(/\/$/, "")}${src}`];
	}

	if (!repoConfig) return [src];

	const repoRelativeBase = getRepoRelativeBase(postFilePath);
	const resolvedRepoPath = joinRelativePath(repoRelativeBase, src);
	return [
		`https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${encodeURIComponent(repoConfig.branch)}/${resolvedRepoPath}`,
		`https://cdn.jsdelivr.net/gh/${repoConfig.owner}/${repoConfig.repo}@${encodeURIComponent(repoConfig.branch)}/${resolvedRepoPath}`,
		`https://github.com/${repoConfig.owner}/${repoConfig.repo}/raw/${encodeURIComponent(repoConfig.branch)}/${resolvedRepoPath}`,
	];
}

async function enhanceGitHubCards(container: HTMLElement) {
	const cards = Array.from(
		container.querySelectorAll<HTMLAnchorElement>("a.card-github[repo]"),
	);

	await Promise.all(
		cards.map(async (card) => {
			const repo = card.getAttribute("repo");
			if (!repo) return;

			try {
				const response = await fetch(`https://api.github.com/repos/${repo}`, {
					referrerPolicy: "no-referrer",
				});
				if (!response.ok) return;

				const payload = (await response.json()) as GitHubRepoPayload;
				const descriptionEl =
					card.querySelector<HTMLElement>(".gc-description");
				const languageEl = card.querySelector<HTMLElement>(".gc-language");
				const starsEl = card.querySelector<HTMLElement>(".gc-stars");
				const forksEl = card.querySelector<HTMLElement>(".gc-forks");
				const licenseEl = card.querySelector<HTMLElement>(".gc-license");

				if (descriptionEl) {
					descriptionEl.innerText =
						payload.description?.replace(/:[a-zA-Z0-9_]+:/g, "") ||
						"Description not set";
				}
				if (languageEl) {
					languageEl.innerText = payload.language || "Unknown";
				}
				if (starsEl) {
					starsEl.innerText = Intl.NumberFormat("en-US", {
						notation: "compact",
						maximumFractionDigits: 1,
					})
						.format(payload.stargazers_count || 0)
						.replaceAll("\u202f", "");
				}
				if (forksEl) {
					forksEl.innerText = Intl.NumberFormat("en-US", {
						notation: "compact",
						maximumFractionDigits: 1,
					})
						.format(payload.forks || 0)
						.replaceAll("\u202f", "");
				}
				if (licenseEl) {
					licenseEl.innerText = payload.license?.spdx_id || "no-license";
				}

				const avatarElement = card.querySelector<HTMLElement>(".gc-avatar");
				if (avatarElement && payload.owner?.avatar_url) {
					avatarElement.style.backgroundImage = `url(${payload.owner.avatar_url}&s=32)`;
					avatarElement.style.backgroundColor = "transparent";
				}

				card.classList.remove("fetch-waiting");
			} catch {
				card.classList.add("fetch-error");
			}
		}),
	);
}

async function enhanceMermaid(container: HTMLElement) {
	const nodes = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));
	if (nodes.length === 0) return;

	const mermaid = await loadMermaidModule();
	mermaid.initialize({
		startOnLoad: false,
		theme: document.documentElement.classList.contains("dark")
			? "dark"
			: "default",
		securityLevel: "loose",
	});

	await Promise.all(
		nodes.map(async (node, index) => {
			const code = node.textContent || "";
			if (!code.trim()) return;

			try {
				const renderResult = await mermaid.render(
					`write-preview-mermaid-${Date.now()}-${index}`,
					code,
				);
				node.innerHTML = renderResult.svg;
			} catch {
				node.innerHTML = `<pre><code>${escapeHtml(code)}</code></pre>`;
			}
		}),
	);
}

function enhancePlantumlTheme(container: HTMLElement) {
	const isDark = document.documentElement.classList.contains("dark");
	const images = Array.from(
		container.querySelectorAll<HTMLImageElement>(".plantuml-image"),
	);

	for (const image of images) {
		const lightSource = image.getAttribute("data-light-src") || image.src;
		const darkSource = image.getAttribute("data-dark-src") || lightSource;
		image.src = isDark ? darkSource : lightSource;
		image.loading = "lazy";
		image.decoding = "async";
	}
}

function enhanceImages(container: HTMLElement, options: EnhancePreviewOptions) {
	const images = Array.from(
		container.querySelectorAll<HTMLImageElement>("img"),
	);

	for (const image of images) {
		const originalSource = image.getAttribute("src") || "";
		image.src = resolvePreviewAssetUrl(
			originalSource,
			options.repoConfig,
			options.postFilePath,
		);
		image.loading = "lazy";

		try {
			const hostname = new URL(image.src).hostname;
			if (matchesNoReferrerDomain(hostname) || image.src.startsWith("http")) {
				image.referrerPolicy = "no-referrer";
			}
		} catch {
			// ignore invalid URL
		}
	}
}

function enhanceLinks(container: HTMLElement) {
	const links = Array.from(
		container.querySelectorAll<HTMLAnchorElement>("a[href]"),
	);

	for (const link of links) {
		const href = link.getAttribute("href");
		if (!href) continue;
		if (href.startsWith("http://") || href.startsWith("https://")) {
			link.target = "_blank";
			link.rel = "noopener noreferrer";
		}
	}
}

function ensureExpressiveCodePreviewModules(container: HTMLElement) {
	const scripts = Array.from(
		container.querySelectorAll<HTMLScriptElement>(
			"script[data-ec-preview-module]",
		),
	);
	if (scripts.length === 0) {
		return;
	}

	type PreviewWindow = Window & {
		__fireflyWritePreviewModules?: Set<string>;
	};

	const previewWindow = window as PreviewWindow;
	previewWindow.__fireflyWritePreviewModules ??= new Set<string>();

	for (const script of scripts) {
		const code = script.textContent || "";
		if (!code) {
			script.remove();
			continue;
		}

		if (!previewWindow.__fireflyWritePreviewModules.has(code)) {
			const executableScript = document.createElement("script");
			executableScript.type = "module";
			executableScript.textContent = code;
			document.head.appendChild(executableScript);
			executableScript.remove();
			previewWindow.__fireflyWritePreviewModules.add(code);
		}

		script.remove();
	}
}

export async function renderFireflyPreview(
	options: RenderPreviewOptions,
): Promise<string> {
	const deps = await loadPreviewDeps();
	const source = await preprocessPreviewSource(options.source);

	const processor = deps
		.unified()
		.use(deps.remarkParse)
		.use(deps.remarkGfm)
		.use(deps.remarkDirective)
		.use(deps.remarkMath)
		.use(createGithubDirectivePlugin(deps.visit))
		.use(createMermaidDirectivePlugin(deps.visit))
		.use(createPlantumlDirectivePlugin(deps.visit))
		.use(remarkImageGrid)
		.use(parseDirectiveNode)
		.use(deps.remarkSectionize)
		.use(deps.remarkRehype, { allowDangerousHtml: true })
		.use(deps.rehypeRaw)
		.use(deps.rehypeKatex)
		.use(deps.rehypeCallouts, {
			theme: options.calloutTheme || siteConfig.post.rehypeCallouts.theme,
		})
		.use(deps.rehypeSlug)
		.use(rehypeFigure)
		.use(rehypeExternalLinks, { siteUrl: siteConfig.site_url })
		.use(deps.rehypeAutolinkHeadings, {
			behavior: "append",
			properties: {
				className: ["anchor"],
			},
			content: {
				type: "element",
				tagName: "span",
				properties: {
					className: ["anchor-icon"],
				},
				children: [{ type: "text", value: "#" }],
			},
		})
		.use(deps.rehypeStringify, { allowDangerousHtml: true });

	const rendered = await processor.process(source);
	return String(rendered);
}

export async function enhanceFireflyPreview(
	options: EnhancePreviewOptions,
): Promise<void> {
	ensureExpressiveCodePreviewModules(options.container);
	enhanceImages(options.container, options);
	enhancePlantumlTheme(options.container);
	enhanceLinks(options.container);
	await ensureIconifyLoaded(options.container);
	await enhanceGitHubCards(options.container);
	await enhanceMermaid(options.container);
}
