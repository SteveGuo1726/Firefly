export type PostFrontmatter = {
	title: string;
	slug: string;
	published: string;
	updated: string;
	description: string;
	image: string;
	tags: string[];
	category: string;
	lang: string;
	draft: boolean;
	pinned: boolean;
	author: string;
	sourceLink: string;
	licenseName: string;
	licenseUrl: string;
	comment: boolean;
	password: string;
	passwordHint: string;
};

export type FrontmatterParseResult = {
	fields: PostFrontmatter;
	body: string;
	extraBlocks: string[];
	hasFrontmatter: boolean;
};

const KNOWN_FIELD_KEYS = new Set([
	"title",
	"slug",
	"published",
	"updated",
	"description",
	"image",
	"tags",
	"category",
	"lang",
	"draft",
	"pinned",
	"author",
	"sourceLink",
	"licenseName",
	"licenseUrl",
	"comment",
	"password",
	"passwordHint",
]);

const DEFAULT_FRONTMATTER: PostFrontmatter = {
	title: "",
	slug: "",
	published: "",
	updated: "",
	description: "",
	image: "",
	tags: [],
	category: "",
	lang: "",
	draft: false,
	pinned: false,
	author: "",
	sourceLink: "",
	licenseName: "",
	licenseUrl: "",
	comment: true,
	password: "",
	passwordHint: "",
};

type FrontmatterBlock = {
	key: string;
	lines: string[];
};

function normalizeNewlines(input: string): string {
	return input.replace(/\r\n?/g, "\n");
}

function splitFrontmatterBlocks(frontmatterBody: string): FrontmatterBlock[] {
	const lines = frontmatterBody.split("\n");
	const blocks: FrontmatterBlock[] = [];
	let currentBlock: FrontmatterBlock | null = null;

	for (const line of lines) {
		const isTopLevelKey = /^[A-Za-z][A-Za-z0-9_-]*:\s*(.*)?$/.test(line);
		if (isTopLevelKey) {
			if (currentBlock) {
				blocks.push(currentBlock);
			}
			currentBlock = {
				key: line.slice(0, line.indexOf(":")).trim(),
				lines: [line],
			};
			continue;
		}

		if (currentBlock) {
			currentBlock.lines.push(line);
		}
	}

	if (currentBlock) {
		blocks.push(currentBlock);
	}

	return blocks;
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseScalarBlock(lines: string[]): string {
	if (lines.length === 0) return "";

	const firstLine = lines[0];
	const colonIndex = firstLine.indexOf(":");
	if (colonIndex === -1) return "";

	const inlineValue = firstLine.slice(colonIndex + 1).trim();
	if (inlineValue.length > 0) {
		if (inlineValue === "null") return "";
		return stripQuotes(inlineValue);
	}

	const nestedLines = lines
		.slice(1)
		.map((line) => line.trim())
		.filter(Boolean);

	if (nestedLines.length === 0) return "";
	if (nestedLines[0] === "null") return "";
	return stripQuotes(nestedLines.join("\n"));
}

function parseBooleanBlock(lines: string[], fallback: boolean): boolean {
	const value = parseScalarBlock(lines).toLowerCase();
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

function parseArrayBlock(lines: string[]): string[] {
	if (lines.length === 0) return [];

	const firstLine = lines[0];
	const colonIndex = firstLine.indexOf(":");
	if (colonIndex === -1) return [];

	const inlineValue = firstLine.slice(colonIndex + 1).trim();
	if (inlineValue.startsWith("[") && inlineValue.endsWith("]")) {
		const content = inlineValue.slice(1, -1).trim();
		if (!content) return [];
		return content
			.split(",")
			.map((item) => stripQuotes(item.trim()))
			.filter(Boolean);
	}

	return lines
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => stripQuotes(line.slice(2).trim()))
		.filter(Boolean);
}

function formatString(value: string): string {
	return JSON.stringify(value ?? "");
}

function formatArray(values: string[]): string {
	const normalized = values.map((item) => item.trim()).filter(Boolean);
	if (normalized.length === 0) return "[]";
	return `[${normalized.map((item) => JSON.stringify(item)).join(", ")}]`;
}

function buildKnownFieldLines(fields: PostFrontmatter): string[] {
	const lines: string[] = [];

	lines.push(`title: ${formatString(fields.title)}`);

	if (fields.slug.trim()) {
		lines.push(`slug: ${formatString(fields.slug.trim())}`);
	}

	lines.push(
		`published: ${fields.published || new Date().toISOString().slice(0, 10)}`,
	);

	if (fields.updated.trim()) {
		lines.push(`updated: ${fields.updated.trim()}`);
	}

	lines.push(`pinned: ${fields.pinned ? "true" : "false"}`);
	lines.push(`description: ${formatString(fields.description)}`);
	lines.push(`image: ${formatString(fields.image)}`);
	lines.push(`tags: ${formatArray(fields.tags)}`);
	lines.push(`category: ${formatString(fields.category)}`);
	lines.push(`draft: ${fields.draft ? "true" : "false"}`);
	lines.push(`comment: ${fields.comment ? "true" : "false"}`);

	if (fields.lang.trim()) {
		lines.push(`lang: ${formatString(fields.lang.trim())}`);
	}
	if (fields.author.trim()) {
		lines.push(`author: ${formatString(fields.author.trim())}`);
	}
	if (fields.sourceLink.trim()) {
		lines.push(`sourceLink: ${formatString(fields.sourceLink.trim())}`);
	}
	if (fields.licenseName.trim()) {
		lines.push(`licenseName: ${formatString(fields.licenseName.trim())}`);
	}
	if (fields.licenseUrl.trim()) {
		lines.push(`licenseUrl: ${formatString(fields.licenseUrl.trim())}`);
	}
	if (fields.password.trim()) {
		lines.push(`password: ${formatString(fields.password.trim())}`);
	}
	if (fields.passwordHint.trim()) {
		lines.push(`passwordHint: ${formatString(fields.passwordHint.trim())}`);
	}

	return lines;
}

export function parsePostSource(source: string): FrontmatterParseResult {
	const normalizedSource = normalizeNewlines(source);
	const fields: PostFrontmatter = { ...DEFAULT_FRONTMATTER };

	if (!normalizedSource.startsWith("---\n")) {
		return {
			fields,
			body: normalizedSource,
			extraBlocks: [],
			hasFrontmatter: false,
		};
	}

	const lines = normalizedSource.split("\n");
	let closingIndex = -1;
	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index].trim() === "---") {
			closingIndex = index;
			break;
		}
	}

	if (closingIndex === -1) {
		return {
			fields,
			body: normalizedSource,
			extraBlocks: [],
			hasFrontmatter: false,
		};
	}

	const frontmatterBody = lines.slice(1, closingIndex).join("\n");
	const body = lines
		.slice(closingIndex + 1)
		.join("\n")
		.replace(/^\n/, "");
	const blocks = splitFrontmatterBlocks(frontmatterBody);
	const extraBlocks: string[] = [];

	for (const block of blocks) {
		switch (block.key) {
			case "title":
				fields.title = parseScalarBlock(block.lines);
				break;
			case "slug":
				fields.slug = parseScalarBlock(block.lines);
				break;
			case "published":
				fields.published = parseScalarBlock(block.lines);
				break;
			case "updated":
				fields.updated = parseScalarBlock(block.lines);
				break;
			case "description":
				fields.description = parseScalarBlock(block.lines);
				break;
			case "image":
				fields.image = parseScalarBlock(block.lines);
				break;
			case "tags":
				fields.tags = parseArrayBlock(block.lines);
				break;
			case "category":
				fields.category = parseScalarBlock(block.lines);
				break;
			case "lang":
				fields.lang = parseScalarBlock(block.lines);
				break;
			case "draft":
				fields.draft = parseBooleanBlock(block.lines, false);
				break;
			case "pinned":
				fields.pinned = parseBooleanBlock(block.lines, false);
				break;
			case "author":
				fields.author = parseScalarBlock(block.lines);
				break;
			case "sourceLink":
				fields.sourceLink = parseScalarBlock(block.lines);
				break;
			case "licenseName":
				fields.licenseName = parseScalarBlock(block.lines);
				break;
			case "licenseUrl":
				fields.licenseUrl = parseScalarBlock(block.lines);
				break;
			case "comment":
				fields.comment = parseBooleanBlock(block.lines, true);
				break;
			case "password":
				fields.password = parseScalarBlock(block.lines);
				break;
			case "passwordHint":
				fields.passwordHint = parseScalarBlock(block.lines);
				break;
			default:
				if (!KNOWN_FIELD_KEYS.has(block.key)) {
					extraBlocks.push(block.lines.join("\n"));
				}
				break;
		}
	}

	return {
		fields,
		body,
		extraBlocks,
		hasFrontmatter: true,
	};
}

export function buildPostSource(
	fields: PostFrontmatter,
	body: string,
	extraBlocks: string[] = [],
): string {
	const frontmatterLines = buildKnownFieldLines(fields);
	const normalizedExtraBlocks = extraBlocks
		.map((block) => block.trim())
		.filter(Boolean);
	const frontmatter = [
		"---",
		...frontmatterLines,
		...normalizedExtraBlocks,
		"---",
		"",
	].join("\n");

	const normalizedBody = normalizeNewlines(body).replace(/^\n*/, "");
	return `${frontmatter}${normalizedBody}\n`;
}
