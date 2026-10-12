/**
 * Public post/dynamic activity timestamp utilities.
 * Live index types match the public /api/live-content/index?kind=post|dynamic response.
 */
export type SiteActivityBase = {
  kind: "post" | "dynamic";
  id: string;
  published?: string | number | Date | null;
  updated?: string | number | Date | null;
};
export type SiteActivityOverlay = {
  id: string;
  deleted?: boolean;
  hidden?: boolean;
  updatedAt?: string;
  meta?: {
    published?: string;
    updated?: string;
    draft?: boolean;
    protected?: boolean;
  };
};
export function siteActivityTimestamp(value: unknown): number;
export function lastPublicContentActivity(
  baseline: SiteActivityBase[],
  live?: { post?: SiteActivityOverlay[] | null; dynamic?: SiteActivityOverlay[] | null },
  now?: number,
): number | null;
