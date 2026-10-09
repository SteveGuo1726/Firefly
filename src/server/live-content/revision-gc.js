/**
 * Conservative v3 revision GC planner. Does not read or delete storage.
 * Callers must supply independently verified archival receipts, not just
 * the latest archive-state pointer.
 */
export function planLiveRevisionGc({
 revisions, activePointers, archivedRevisionKeys,
 now = Date.now(), minAgeDays = 30, keepLatest = 10,
} = {}) {
 if (!Array.isArray(revisions)) throw new TypeError("revisions must be an array");
 if (!(archivedRevisionKeys instanceof Set)) throw new TypeError("archivedRevisionKeys must be a Set");
 if (!(activePointers instanceof Set)) throw new TypeError("activePointers must be a complete Set");
 if (!Number.isInteger(keepLatest) || keepLatest < 1) throw new RangeError("keepLatest must be >= 1");
 if (!Number.isFinite(minAgeDays) || minAgeDays < 0) throw new RangeError("minAgeDays must be >= 0");
 const active = activePointers;
 const groups = new Map();
 for (const item of revisions) {
  const key = String(item?.key || "");
  const match = /^v3\/items\/(posts|dynamics)\/(.+)\/([a-f0-9-]{36})\.json$/i.exec(key);
  const date = Date.parse(String(item?.createdAt || ""));
  if (!match || match[2].split("/").some(part => !part || part === "." || part === "..") || !Number.isFinite(date) || date > now) continue;
  const group = match[1] + "/" + match[2];
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push({key,createdAt:date,group});
 }
 const candidates = [];
 for (const group of groups.values()) {
  group.sort((a,b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key));
  for (const [index,item] of group.entries()) {
   if (index < keepLatest || active.has(item.key)) continue;
   if (!archivedRevisionKeys.has(item.key)) continue;
   if (now - item.createdAt < minAgeDays * 86400000) continue;
   candidates.push(item.key);
  }
 }
 return candidates.sort();
}
