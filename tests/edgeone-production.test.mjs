import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../edgeone.json',import.meta.url),'utf8'));
const p=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const g=readFileSync(new URL('../scripts/generate-public-gallery-thumbnails.mjs',import.meta.url),'utf8');
test('EdgeOne Git-connected master build writes static dist without preview auth config',()=>{
 assert.equal(c.outputDirectory,'dist');
 assert.equal(c.nodeVersion,'24.18.0');
 assert.equal(c.installCommand,'pnpm install --frozen-lockfile');
 assert.match(c.buildCommand,/PUBLIC_GITHUB_ADMIN_BRANCH=master/);
 assert.match(c.buildCommand,/PUBLIC_FIREFLY_PREVIEW_DEMO=false/);
 assert.match(p.scripts.build,/^node scripts\/generate-public-gallery-thumbnails\.mjs/);
});
test('EdgeOne immutable hashed resources, uncacheable admin and dynamic APIs',()=>{
 const h=Object.fromEntries(c.headers.map(x=>[x.source,Object.fromEntries(x.headers.map(y=>[y.key,y.value]))]));
 assert.match(h['/_astro/*']['Cache-Control'],/immutable/);
 for(const url of ['/admin/*','/api/*','/internal/live-post-shell/*'])
  assert.match(h[url]['Cache-Control'],/no-store/);
 assert.match(h['/admin/*']['X-Robots-Tag'],/noindex/);
});
test('Gallery derivative builder reads existing public gallery and uses OS temp directory',()=>{
 assert.match(g,/gallery-api\.casto\.top\/api\/gallery\/public/);
 assert.match(g,/Origin: https:\/\/blog\.casto\.top/);
 assert.match(g,/join\(tmpdir\(\)/);
 assert.doesNotMatch(g,/\.git\/image-thumb-source/);
});
test('No external imagebed writes or GitHub Actions deployment SDK',()=>{
 assert.equal(p.devDependencies['@edgeone/makers-sdk'],undefined);
 assert.doesNotMatch(g,/fetch\(.+method: ['"]POST/);
});

test('EdgeOne uses a preinstalled Node runtime without an .nvmrc override',()=>{
 assert.equal(existsSync(new URL('../.nvmrc',import.meta.url)),false,
  '.nvmrc forces an extra Node download without preinstalled pnpm on EdgeOne');
 assert.equal(c.nodeVersion,'24.18.0');
 assert.match(p.engines.node,/>=22\.23\.0/);
 assert.equal(p.packageManager,'pnpm@11.22.0');
});
