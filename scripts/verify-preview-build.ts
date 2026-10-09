// Preview build guard: edit this file to add post-build checks without
// changing GitHub Actions workflow files. Runs on every Netlify build.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveSiteRoot } from "./site-root";

const root = resolveSiteRoot();
const required = [
  "index.html",
  "archive/index.html",
  "gallery/index.html",
  "search/index.html",
  "pagefind/pagefind.js",
  "rss.xml",
];
const errors: string[] = [];
const inlineCss = await readFile(path.join(process.cwd(), "src/styles/markdown.css"), "utf8");
if (!inlineCss.includes(":not(pre) > code")) errors.push("code block and inline code selectors overlap");
if (/counter-reset:\s*line\b|span\.line\s*\{/.test(inlineCss)) errors.push("legacy synthetic line-number rules conflict with Expressive Code");

for (const relative of required) {
  const file = path.join(root, relative);
  try {
    const entry = await stat(file);
    if (!entry.isFile() || entry.size === 0) errors.push(relative + " is empty or not a file");
  } catch {
    errors.push(relative + " missing");
  }
}
const home = await readFile(path.join(root, "index.html"), "utf8").catch(() => "");
if (!home.includes("--font-code:")) {
  errors.push("home page is missing upstream --font-code fallback");
}
if (!home.includes("id=\"navbar\"")) {
  errors.push("home page is missing its navbar");
}
if (errors.length) {
  for (const error of errors) console.error("FIREFLY_BUILD_CHECK_FAIL", error);
  process.exitCode = 1;
} else {
  console.log("FIREFLY_BUILD_CHECK_PASS", JSON.stringify({ root, files: required.length, fontCode: true, navbar: true }));
}
