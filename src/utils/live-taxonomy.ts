export type TaxonomyMode = "tag" | "category";
export type TaxonomyTerm = { name: string; count: number; url?: string };
export type TaxonomyStaticPost = { id: string; category?: string | null; tags?: string[] };
export type TaxonomyLivePost = {
 id: string;
 deleted?: boolean;
 hidden?: boolean;
 meta?: { category?: string; tags?: string[] };
};

/** Apply only the live changes over the build-time counts.
 * One overlay replaces one static post's metadata, not adds a duplicate.
 * A tombstone or draft overlay removes the static contribution.
 */
export function mergeLiveTaxonomy(
 baseline: TaxonomyTerm[],
 staticPosts: TaxonomyStaticPost[],
 live: TaxonomyLivePost[],
 mode: TaxonomyMode,
 uncategorized: string,
): TaxonomyTerm[] {
 const counts = new Map(baseline.map(t => [t.name, Math.max(0, t.count)]));
 const original = new Map(baseline.map(t => [t.name, t]));
 const staticMap = new Map(staticPosts.map(p => [p.id, p]));
 const names = (value: {category?: string | null; tags?: string[]}): string[] => {
  if (mode === "category") return [String(value.category || "").trim() || uncategorized];
  return [...new Set((value.tags || []).map(String).map(t => t.trim()).filter(Boolean))];
 };
 const adjust = (terms: string[], amount: number) => {
  for (const term of terms) counts.set(term, (counts.get(term) || 0) + amount);
 };
 for (const entry of live) {
  if (!entry?.id) continue;
  const base = staticMap.get(entry.id);
  if (base) adjust(names(base), -1);
  if (!entry.deleted && !entry.hidden && entry.meta) adjust(names(entry.meta), 1);
 }
 const result = [...counts].filter(([,count]) => count > 0).map(([name,count]) => ({
  name, count, ...(original.get(name)?.url ? {url:original.get(name)!.url} : {}),
 }));
 result.sort(mode === "tag"
  ? (a,b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  : (a,b) => b.count-a.count || a.name.localeCompare(b.name));
 return result;
}
