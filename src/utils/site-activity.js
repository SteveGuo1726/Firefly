/**
 * Public content activity = newest publication or edit among visible posts and
 * dynamics. Works on build-time collections and the live-content public index.
 * No admin credentials or HTML/body text are required.
 */

export function siteActivityTimestamp(value) {
	if (value instanceof Date) {
		const stamp = value.getTime();
		return Number.isFinite(stamp) ? stamp : 0;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? value : 0;
	}
	if (typeof value !== "string" || !value.trim()) return 0;
	// Live CMS also accepts "YYYY-MM-DD HH:mm:ss" (UTC by convention).
	const source = value.trim();
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(source)
		? source.replace(" ", "T") + "Z"
		: source;
	const stamp = Date.parse(normalized);
	return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
}

/**
 * @param {Array<{kind:"post"|"dynamic",id:string,published?:unknown,updated?:unknown}>} baseline
 * @param {{post?:Array<any>|null,dynamic?:Array<any>|null}} live
 * @param {number} now
 * @returns {number|null} latest public activity in milliseconds
 */
export function lastPublicContentActivity(baseline, live = {}, now = Date.now()) {
	const content = new Map();
	const kindName = (kind) => kind === "post" || kind === "dynamic";
	for (const item of Array.isArray(baseline) ? baseline : []) {
		if (!item?.id || !kindName(item.kind)) continue;
		const published = siteActivityTimestamp(item.published);
		const updated = siteActivityTimestamp(item.updated);
		content.set(`${item.kind}:${item.id}`, { published, updated });
	}
	for (const kind of ["post", "dynamic"]) {
		const entries = live[kind];
		if (!Array.isArray(entries)) continue; // a failed index fetch must retain static data
		for (const item of entries) {
			if (!item?.id) continue;
			const key = `${kind}:${item.id}`;
			const meta = item.meta || {};
			if (item.deleted || item.hidden ||
				(kind === "post" && (meta.draft || meta.protected))) {
				content.delete(key);
				continue;
			}
			const old = content.get(key) || { published: 0, updated: 0 };
			const published = siteActivityTimestamp(meta.published) || old.published;
			const updated = Math.max(
				siteActivityTimestamp(meta.updated),
				siteActivityTimestamp(item.updatedAt),
				old.updated,
			);
			if (published || updated) content.set(key, { published, updated });
		}
	}
	let latest = 0;
	for (const { published, updated } of content.values()) {
		for (const stamp of [published, updated]) {
			// Future-dated scheduled content does not count as activity yet.
			if (stamp > latest && stamp <= now) latest = stamp;
		}
	}
	return latest || null;
}
