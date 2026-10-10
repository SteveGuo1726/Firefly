import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sandbox bootstrap runs only dev HMR on the experimental branch", async () => {
 const source = await readFile("scripts/sandbox-dev.sh","utf8");
 assert.match(source,/ai\/preview-test/);
 assert.match(source,/pnpm dev --host 0\.0\.0\.0 --port 4321/);
 assert.match(source,/__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS/);
 assert.match(source,/PUBLIC_FIREFLY_SANDBOX_HOST/);
 assert.match(source,/PUBLIC_GALLERY_API_ORIGIN/);
 assert.match(source,/node_modules\/\.bin\/astro/);
 assert.doesNotMatch(source,/pnpm build|wrangler deploy|git push/);
});
