import assert from "node:assert/strict";
import test from "node:test";
import {
	mergeLiveDynamicEntries,
	parseLiveDynamicPublished,
	type DynamicData,
} from "../src/utils/dynamic-live";

test("live dynamic merge adds, replaces, deletes and sorts entries", () => {
	const base: DynamicData[] = [
		{
			id: "old",
			published: Date.parse("2026-10-08T12:00:00Z"),
			html: "<p>old</p>",
			images: [],
			searchText: "old",
		},
		{
			id: "replace-me",
			published: Date.parse("2026-10-07T12:00:00Z"),
			html: "<p>base</p>",
			images: [],
			searchText: "base",
		},
	];

	const merged = mergeLiveDynamicEntries(base, [
		{ id: "old", deleted: true },
		{
			id: "replace-me",
			meta: {
				published: "2026-10-09 20:00:00",
				html: "<p>replaced</p>",
				searchText: "REPLACED",
				location: "Shanghai",
			},
		},
		{
			id: "pinned",
			meta: {
				published: "2025-01-01 00:00:00",
				html: "<p>pinned</p>",
				searchText: "PINNED",
				pinned: true,
			},
		},
		{
			id: "new",
			meta: {
				published: "2026-10-09 23:30:00",
				html: "<p>new</p>",
				searchText: "NEW",
			},
		},
		{
			id: "invalid",
			meta: { published: "not-a-date", html: "<p>ignored</p>" },
		},
	]);

	assert.deepEqual(merged.map((entry) => entry.id), [
		"pinned",
		"new",
		"replace-me",
	]);
	assert.equal(merged[1].published, Date.parse("2026-10-09T23:30:00Z"));
	assert.equal(merged[2].html, "<p>replaced</p>");
	assert.equal(merged[2].searchText, "replaced");
	assert.equal(merged[2].location, "Shanghai");
});

test("live dynamic timestamp parser preserves explicit ISO offsets", () => {
	assert.equal(
		parseLiveDynamicPublished("2026-10-09T23:30:00+08:00"),
		Date.parse("2026-10-09T23:30:00+08:00"),
	);
	assert.equal(parseLiveDynamicPublished(""), 0);
});
