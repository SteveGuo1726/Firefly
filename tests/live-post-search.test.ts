import assert from "node:assert/strict";
import test from "node:test";
import {
	escapeSearchRegExp,
	highlightSearchText,
	livePostPath,
	mergeLiveSearchEntries,
} from "../src/utils/live-post-search";

test("search highlighting safely handles regexp metacharacters and HTML", () => {
	const escaped = escapeSearchRegExp("C++ [x]?");
	assert.doesNotThrow(() => new RegExp(escaped));
	const result = highlightSearchText("<C++ [x]?>", "C++ [x]?");
	assert.match(result, /&lt;<mark>C\+\+ \[x\]\?<\/mark>&gt;/);
});

test("live search state supersedes stale Pagefind state", () => {
	const oldUrl = livePostPath("hello");
	const pagefind = [{
		url: oldUrl,
		meta: { title: "Old title" },
		excerpt: "old body with legacyword",
	}];

	const noLongerMatches = mergeLiveSearchEntries(pagefind, [{
		id: "hello",
		meta: { title: "New title", description: "new description", searchText: "new body" },
	}], "legacyword");
	assert.deepEqual(noLongerMatches, []);

	const updated = mergeLiveSearchEntries(pagefind, [{
		id: "hello",
		meta: { title: "New title", description: "new description", searchText: "body contains freshword here" },
	}], "freshword");
	assert.equal(updated.length, 1);
	assert.match(updated[0].meta.title, /New title/);
	assert.match(updated[0].excerpt, /<mark>freshword<\/mark>/i);
});

test("live-only posts are searchable while hidden and deleted posts remove stale results", () => {
	const hiddenUrl = livePostPath("hidden");
	const deletedUrl = livePostPath("deleted");
	const results = mergeLiveSearchEntries(
		[
			{ url: hiddenUrl, meta: { title: "Hidden old" }, excerpt: "secret" },
			{ url: deletedUrl, meta: { title: "Deleted old" }, excerpt: "gone" },
		],
		[
			{ id: "hidden", hidden: true },
			{ id: "deleted", deleted: true },
			{ id: "new-live", meta: { title: "Realtime article", description: "published instantly", searchText: "edgeone blob content" } },
		],
		"edgeone",
	);
	assert.equal(results.length, 1);
	assert.equal(results[0].url, livePostPath("new-live"));
});
