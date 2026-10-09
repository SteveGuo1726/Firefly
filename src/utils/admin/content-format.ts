export type AdminPostFields = {
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
	series: string;
	seriesOrder: number | null;
};

export type AdminDynamicFields = {
	published: string;
	pinned: boolean;
	location: string;
};

type Block = { key: string | null; lines: string[] };

function normalize(source: string): string {
	return source.replace(/\r\n?/g, "\n");
}

function splitDocument(source: string) {
	const value = normalize(source);
	if (!value.startsWith("---\n")) return { frontmatter: "", body: value };
	const closing = /^---[ \t]*(?:\n|$)/gm;
	closing.lastIndex = 4;
	const match = closing.exec(value);
	if (!match) return { frontmatter: "", body: value };
	return {
		frontmatter: value.slice(4, match.index),
		body: value.slice(match.index + match[0].length).replace(/^\n/, ""),
	};
}

function blocks(frontmatter: string): Block[] {
	const result: Block[] = [];
	let current: Block = { key: null, lines: [] };
	const flush = () => { if (current.lines.length) result.push(current); };
	for (const line of frontmatter.split("\n")) {
		const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s|$)/.exec(line);
		if (match) {
			flush();
			current = { key: match[1], lines: [line] };
		} else current.lines.push(line);
	}
	flush();
	return result;
}

function mapBlocks(frontmatter: string) {
	const map = new Map<string, Block>();
	for (const block of blocks(frontmatter)) if (block.key) map.set(block.key, block);
	return map;
}

function unquote(value: string): string {
	const v = value.trim();
	if (!v || v === "null") return "";
	if (v.startsWith('"') && v.endsWith('"')) {
		try { return JSON.parse(v); } catch {}
	}
	if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
	return v.replace(/\s+#.*$/, "");
}

function scalar(block?: Block): string {
	if (!block?.key) return "";
	const first = block.lines[0];
	const inline = first.slice(first.indexOf(":") + 1).trim();
	if (/^[|>][+-]?(?:\s+#.*)?$/.test(inline)) {
		const content = block.lines.slice(1);
		const nonempty = content.filter(line => line.trim());
		const indent = nonempty.length ? Math.min(...nonempty.map(line => line.match(/^ */)?.[0].length ?? 0)) : 0;
		const lines = content.map(line => line.slice(Math.min(indent, line.length)));
		return inline.startsWith("|") ? lines.join("\n").replace(/\n$/, "") : lines.join(" ").trim();
	}
	if (inline) {
		const commentFree = inline.replace(/^("(?:\\.|[^"\\])*"|'(?:''|[^'])*')\s+#.*$/, "$1");
		return unquote(commentFree);
	}
	return block.lines.slice(1).map((line) => line.trim()).filter(Boolean).map(unquote).join("\n");
}

function boolean(block: Block | undefined, fallback: boolean): boolean {
	const value = scalar(block).toLowerCase();
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

function list(block?: Block): string[] {
	if (!block?.key) return [];
	const first = block.lines[0];
	const inline = first.slice(first.indexOf(":") + 1).trim();
	if (inline.startsWith("[") && inline.endsWith("]")) {
		try {
			const parsed = JSON.parse(inline);
			if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
		} catch {}
		return inline.slice(1, -1).split(",").map(unquote).filter(Boolean);
	}
	return block.lines.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => unquote(line.slice(2)))
		.filter(Boolean);
}

function numeric(block?: Block): number | null {
	const value = scalar(block);
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function extras(frontmatter: string, known: Set<string>): string[] {
	return blocks(frontmatter)
		.filter((block) => !block.key || !known.has(block.key))
		.map((block) => block.lines.join("\n").trim())
		.filter(Boolean);
}

function quote(value: string): string {
	return JSON.stringify(value ?? "");
}

function finish(lines: string[], extra: string[], body: string): string {
	return ["---", ...lines, ...extra, "---", "", normalize(body).replace(/^\n+/, "").replace(/\s*$/, ""), ""].join("\n");
}

const POST_KEYS = new Set([
	"title","slug","published","updated","pinned","description","image","tags","category",
	"draft","comment","lang","author","sourceLink","licenseName","licenseUrl","password",
	"passwordHint","series","seriesOrder",
]);
const DYNAMIC_KEYS = new Set(["published","pinned","location"]);

export function emptyPostFields(): AdminPostFields {
	return {
		title:"",slug:"",published:new Date().toISOString().slice(0,10),updated:"",
		description:"",image:"",tags:[],category:"",lang:"",draft:false,pinned:false,
		author:"",sourceLink:"",licenseName:"",licenseUrl:"",comment:true,password:"",
		passwordHint:"",series:"",seriesOrder:null,
	};
}

export function parsePostDocument(source: string) {
	const doc=splitDocument(source);
	const map=mapBlocks(doc.frontmatter);
	const fields=emptyPostFields();
	fields.title=scalar(map.get("title"));
	fields.slug=scalar(map.get("slug"));
	fields.published=scalar(map.get("published"));
	fields.updated=scalar(map.get("updated"));
	fields.description=scalar(map.get("description"));
	fields.image=scalar(map.get("image"));
	fields.tags=list(map.get("tags"));
	fields.category=scalar(map.get("category"));
	fields.lang=scalar(map.get("lang"));
	fields.draft=boolean(map.get("draft"),false);
	fields.pinned=boolean(map.get("pinned"),false);
	fields.author=scalar(map.get("author"));
	fields.sourceLink=scalar(map.get("sourceLink"));
	fields.licenseName=scalar(map.get("licenseName"));
	fields.licenseUrl=scalar(map.get("licenseUrl"));
	fields.comment=boolean(map.get("comment"),true);
	fields.password=scalar(map.get("password"));
	fields.passwordHint=scalar(map.get("passwordHint"));
	fields.series=scalar(map.get("series"));
	fields.seriesOrder=numeric(map.get("seriesOrder"));
	return { fields, body: doc.body };
}

export function buildPostDocument(fields: AdminPostFields, body: string, original = ""): string {
	const doc=splitDocument(original);
	const lines=[
		`title: ${quote(fields.title.trim())}`,
		...(fields.slug.trim()?[`slug: ${quote(fields.slug.trim())}`]:[]),
		`published: ${fields.published.trim()||new Date().toISOString().slice(0,10)}`,
		...(fields.updated.trim()?[`updated: ${fields.updated.trim()}`]:[]),
		`pinned: ${fields.pinned}`,
		`description: ${quote(fields.description.trim())}`,
		`image: ${quote(fields.image.trim())}`,
		`tags: ${JSON.stringify(fields.tags.map((v)=>v.trim()).filter(Boolean))}`,
		`category: ${quote(fields.category.trim())}`,
		`draft: ${fields.draft}`,
		`comment: ${fields.comment}`,
		...(fields.lang.trim()?[`lang: ${quote(fields.lang.trim())}`]:[]),
		...(fields.author.trim()?[`author: ${quote(fields.author.trim())}`]:[]),
		...(fields.sourceLink.trim()?[`sourceLink: ${quote(fields.sourceLink.trim())}`]:[]),
		...(fields.licenseName.trim()?[`licenseName: ${quote(fields.licenseName.trim())}`]:[]),
		...(fields.licenseUrl.trim()?[`licenseUrl: ${quote(fields.licenseUrl.trim())}`]:[]),
		...(fields.password.trim()?[`password: ${quote(fields.password.trim())}`]:[]),
		...(fields.passwordHint.trim()?[`passwordHint: ${quote(fields.passwordHint.trim())}`]:[]),
		...(fields.series.trim()?[`series: ${quote(fields.series.trim())}`]:[]),
		...(fields.seriesOrder===null?[]:[`seriesOrder: ${fields.seriesOrder}`]),
	];
	const canonical = finish(lines,extras(doc.frontmatter,POST_KEYS),body);
	return preserveDocument(original, fields, body, parsePostDocument, canonical);
}

export function parseDynamicDocument(source: string) {
	const doc=splitDocument(source);
	const map=mapBlocks(doc.frontmatter);
	return {
		fields:{
			published:scalar(map.get("published")),
			pinned:boolean(map.get("pinned"),false),
			location:scalar(map.get("location")),
		} satisfies AdminDynamicFields,
		body:doc.body,
	};
}

export function buildDynamicDocument(fields: AdminDynamicFields, body: string, original = ""): string {
	const doc=splitDocument(original);
	const canonical = finish([
		`published: ${fields.published.trim()}`,
		`pinned: ${fields.pinned}`,
		...(fields.location.trim()?[`location: ${quote(fields.location.trim())}`]:[]),
	],extras(doc.frontmatter,DYNAMIC_KEYS),body);
	return preserveDocument(original, fields, body, parseDynamicDocument, canonical);
}


/**
 * Preserve existing YAML verbatim for all form fields the editor did not change.
 * This protects custom YAML, comments and block scalars from lossy serialization.
 */
function preserveDocument<T extends object>(
 original: string, fields: T, body: string,
 parse: (source: string) => { fields: T; body: string },
 canonical: string,
): string {
 const match = /^---(\r?\n)([\s\S]*?)^---[ \t]*(\r?\n|$)/m.exec(original);
 if (!match || match.index !== 0) return canonical;
 const previous = parse(original);
 const nextFields = fields as Record<string, unknown>;
 const prevFields = previous.fields as Record<string, unknown>;
 const changed = Object.keys(nextFields).filter(k => JSON.stringify(nextFields[k]) !== JSON.stringify(prevFields[k]));
 if (!changed.length && body === previous.body) return original;
 const substitutions = mapBlocks(splitDocument(canonical).frontmatter);
 const existing = blocks(match[2].replace(/\r\n/g, "\n").replace(/\n$/, ""));
 const written = new Set<string>();
 const output: string[] = [];
 for (const item of existing) {
  if (item.key && changed.includes(item.key)) {
   if (written.has(item.key)) continue;
   written.add(item.key);
   const replacement = substitutions.get(item.key);
   if (replacement) output.push(replacement.lines.join("\n"));
  } else output.push(item.lines.join("\n"));
 }
 for (const key of changed) {
  if (written.has(key)) continue;
  const replacement = substitutions.get(key);
  if (replacement) output.push(replacement.lines.join("\n"));
 }
 const eol = match[1];
 const matter = output.join("\n").replace(/\n/g, eol);
 const prefix = "---" + eol + matter + (matter.endsWith(eol) ? "" : eol) + "---" + match[3];
 const suffix = body === previous.body ? original.slice(match[0].length) : eol + body;
 return prefix + suffix;
}

export function excerptMarkdown(value: string, max=120): string {
	return value.replace(/!\[[^\]]*\]\([^)]*\)/g," [图片] ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
		.replace(/<[^>]+>/g," ").replace(/[`*_>#~]/g," ")
		.replace(/\s+/g," ").trim().slice(0,max);
}
