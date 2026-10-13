import test from "node:test";
import assert from "node:assert/strict";
import { lastPublicContentActivity, siteActivityTimestamp } from "../src/utils/site-activity.js";

const date = (value) => Date.parse(value);
const now = date("2026-10-13T15:00:00Z");
const post = { kind: "post", id: "blog", published: "2026-10-01T00:00:00Z" };
const dynamic = { kind: "dynamic", id: "hello", published: "2026-10-09T12:00:00Z" };

test("static publication counts both articles and dynamics", () => {
	assert.equal(lastPublicContentActivity([post, dynamic], {}, now), date(dynamic.published));
});

test("article edits and dynamic edits both update last activity", () => {
	assert.equal(
		lastPublicContentActivity([{ ...post, updated: "2026-10-11T11:00:00Z" }, dynamic], {}, now),
		date("2026-10-11T11:00:00Z"),
	);
	assert.equal(
		lastPublicContentActivity([post, { ...dynamic, updated: "2026-10-12T11:00:00Z" }], {}, now),
		date("2026-10-12T11:00:00Z"),
	);
});

test("new public live dynamic is visible without a rebuild", () => {
	const result = lastPublicContentActivity([post], {
		dynamic: [{ id: "new", updatedAt: "2026-10-13T08:00:00Z", meta: { published: "2026-10-13 08:00:00" } }],
	}, now);
	assert.equal(result, date("2026-10-13T08:00:00Z"));
});

test("live revision update counts for both kinds", () => {
	const activity = lastPublicContentActivity([post, dynamic], {
		post: [{ id: "blog", updatedAt: "2026-10-12T03:00:00Z", meta: { published: post.published } }],
		dynamic: [{ id: "hello", updatedAt: "2026-10-13T12:00:00Z", meta: { published: dynamic.published } }],
	}, now);
	assert.equal(activity, date("2026-10-13T12:00:00Z"));
});

test("deleted, draft, protected and hidden overlays never appear as activity", () => {
	const overlays = {
		post: [
			{ id: "blog", deleted: true, updatedAt: "2026-10-13T12:00:00Z" },
			{ id: "hidden", hidden: true, updatedAt: "2026-10-13T12:00:00Z" },
			{ id: "draft", updatedAt: "2026-10-13T12:00:00Z", meta: { draft: true } },
			{ id: "private", updatedAt: "2026-10-13T12:00:00Z", meta: { protected: true } },
		],
		dynamic: [{ id: "hello", deleted: true, updatedAt: "2026-10-13T12:00:00Z" }],
	};
	assert.equal(lastPublicContentActivity([post, dynamic], overlays, now), null);
});

test("failed indexes cannot erase public static activity", () => {
	assert.equal(lastPublicContentActivity([post, dynamic], { post: null, dynamic: null }, now), date(dynamic.published));
});

test("future scheduled items, invalid timestamps and empty indexes are ignored", () => {
	const future = { kind: "dynamic", id: "future", published: "2026-10-30T08:00:00Z" };
	const invalid = { kind: "post", id: "invalid", published: "not a date" };
	assert.equal(lastPublicContentActivity([post, future, invalid], {}, now), date(post.published));
	assert.equal(lastPublicContentActivity([], {}, now), null);
	assert.equal(siteActivityTimestamp("2026-10-12 12:10:00"), date("2026-10-12T12:10:00Z"));
});

test("identically named article and dynamic are distinct items", () => {
	const items = [{ ...post, id: "same" }, { ...dynamic, id: "same" }];
	const result = lastPublicContentActivity(items, {
		post: [{ id: "same", deleted: true }],
	}, now);
	assert.equal(result, date(dynamic.published));
});
