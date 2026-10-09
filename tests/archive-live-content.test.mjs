import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyArchivePlan, createArchivePlan, gitBlobSha, loadArchiveState } from "../scripts/archive-live-content.mjs";

async function workspace() {
	const root = await mkdtemp(path.join(os.tmpdir(), "firefly-archive-"));
	await mkdir(path.join(root, "src/content/posts"), { recursive: true });
	await mkdir(path.join(root, "src/content/dynamic"), { recursive: true });
	return root;
}
function snapshot(items) {
	return { schemaVersion:3, exportedAt:"2026-10-09T00:00:00.000Z", posts:items.filter((x)=>x.kind==="post"), dynamics:items.filter((x)=>x.kind==="dynamic") };
}

test("archive state permits successive live revisions", async () => {
	const root=await workspace(), file=path.join(root,"src/content/posts/hello.md");
	await writeFile(file,"base","utf8");
	const baseGitSha=gitBlobSha("base");
	const first=snapshot([{kind:"post",id:"hello",path:"src/content/posts/hello.md",revision:"r1",baseGitSha,source:"live one",deleted:false}]);
	await applyArchivePlan(await createArchivePlan(first,{rootDir:root}),{rootDir:root});
	const second=snapshot([{...first.posts[0],revision:"r2",source:"live two"}]);
	await applyArchivePlan(await createArchivePlan(second,{rootDir:root}),{rootDir:root});
	assert.equal(await readFile(file,"utf8"),"live two");
	const state=await loadArchiveState(root);
	assert.equal(state.entries["post:hello"].revision,"r2");
	assert.equal(state.entries["post:hello"].blobSha,gitBlobSha("live two"));
});

test("archive preflight refuses external edits without touching other files", async () => {
	const root=await workspace();
	const a=path.join(root,"src/content/posts/a.md"), b=path.join(root,"src/content/posts/b.md");
	await writeFile(a,"a base","utf8"); await writeFile(b,"manual edit","utf8");
	const data=snapshot([
		{kind:"post",id:"a",path:"src/content/posts/a.md",revision:"r1",baseGitSha:gitBlobSha("a base"),source:"a live",deleted:false},
		{kind:"post",id:"b",path:"src/content/posts/b.md",revision:"r2",baseGitSha:gitBlobSha("b base"),source:"b live",deleted:false},
	]);
	await assert.rejects(createArchivePlan(data,{rootDir:root}),/Archive conflicts detected/);
	assert.equal(await readFile(a,"utf8"),"a base");
	assert.equal(await readFile(b,"utf8"),"manual edit");
});

test("tombstone safely deletes the last archived live revision", async () => {
	const root=await workspace(), file=path.join(root,"src/content/posts/delete.md");
	await writeFile(file,"base","utf8");
	const baseGitSha=gitBlobSha("base");
	const live=snapshot([{kind:"post",id:"delete",path:"src/content/posts/delete.md",revision:"r1",baseGitSha,source:"live",deleted:false}]);
	await applyArchivePlan(await createArchivePlan(live,{rootDir:root}),{rootDir:root});
	const gone=snapshot([{kind:"post",id:"delete",path:"src/content/posts/delete.md",revision:"r2",baseGitSha,deleted:true}]);
	await applyArchivePlan(await createArchivePlan(gone,{rootDir:root}),{rootDir:root});
	await assert.rejects(readFile(file),(error)=>error?.code==="ENOENT");
	assert.equal((await loadArchiveState(root)).entries["post:delete"].deleted,true);
});

test("new live content cannot overwrite an unrelated Git file", async () => {
	const root=await workspace(), file=path.join(root,"src/content/posts/collision.md");
	await writeFile(file,"manual","utf8");
	const data=snapshot([{kind:"post",id:"collision",path:"src/content/posts/collision.md",revision:"r1",baseGitSha:"",source:"live",deleted:false}]);
	await assert.rejects(createArchivePlan(data,{rootDir:root}),/refusing to overwrite Git content changed outside live archive/);
	assert.equal(await readFile(file,"utf8"),"manual");
});


test("replaying an identical archive snapshot is a true no-op", async () => {
	const root = await workspace();
	const file = path.join(root, "src/content/posts/idempotent.md");
	await writeFile(file, "base", "utf8");
	const data = snapshot([{
		kind: "post",
		id: "idempotent",
		path: "src/content/posts/idempotent.md",
		revision: "same-revision",
		baseGitSha: gitBlobSha("base"),
		source: "live once",
		deleted: false,
	}]);

	const firstPlan = await createArchivePlan(data, { rootDir: root });
	const firstResult = await applyArchivePlan(firstPlan, { rootDir: root });
	assert.equal(firstResult.written, 1);
	assert.equal(firstResult.stateUpdated, true);

	const stateFile = path.join(root, ".firefly/live-content-archive-state.json");
	const beforeState = await readFile(stateFile, "utf8");
	const beforeContent = await readFile(file, "utf8");

	const secondPlan = await createArchivePlan(data, { rootDir: root });
	assert.equal(secondPlan.stateChanged, false);
	assert.deepEqual(secondPlan.operations, []);
	const secondResult = await applyArchivePlan(secondPlan, { rootDir: root });
	assert.deepEqual(secondResult, { written: 0, deleted: 0, stateUpdated: false });
	assert.equal(await readFile(stateFile, "utf8"), beforeState);
	assert.equal(await readFile(file, "utf8"), beforeContent);
});
