/**
 * Validate a live-content export before allowing it to be downloaded as a backup.
 * This checks structural consistency, not whether the underlying storage has
 * retained versions that were already garbage-collected.
 */
export type BackupSummary = { currentCount: number; deletedCount: number; historyCount: number };

type BackupDocument = {
 kind: "post" | "dynamic";
 id: string;
 path: string;
 revision: string;
 deleted?: boolean;
 source?: string;
};

function record(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value);
}

function document(value: unknown, kind: "post" | "dynamic", isHistory: boolean): BackupDocument {
 if (!record(value) || value.kind !== kind || typeof value.id !== "string" || !value.id.trim() ||
  typeof value.revision !== "string" || !value.revision.trim() || typeof value.path !== "string") {
  throw new Error("备份完整性校验失败：内容缺少有效类型、ID、路径或版本。");
 }
 const root = kind === "post" ? "src/content/posts/" : "src/content/dynamic/";
 if (!value.path.startsWith(root) || value.path.includes("..") || value.path.includes("\\") ||
  !(kind === "post" ? /\.mdx?$/i : /\.md$/i).test(value.path)) {
  throw new Error("备份完整性校验失败：包含无效内容路径。");
 }
 if (isHistory && value.deleted === true) throw new Error("备份历史版本不应包含删除标记。");
 if ((isHistory || value.deleted !== true) && typeof value.source !== "string") {
  throw new Error("备份完整性校验失败：内容正文缺失。");
 }
 return value as BackupDocument;
}

function identity(item: BackupDocument): string {
 return JSON.stringify([item.kind, item.id, item.revision]);
}

export function validateLiveContentBackup(data: unknown): BackupSummary {
 if (!record(data) || data.schemaVersion !== 3 ||
  !Array.isArray(data.posts) || !Array.isArray(data.dynamics) || !Array.isArray(data.history)) {
  throw new Error("备份格式异常：需要 schemaVersion=3、文章、动态与历史版本列表。");
 }
 const current = [
  ...data.posts.map((item) => document(item, "post", false)),
  ...data.dynamics.map((item) => document(item, "dynamic", false)),
 ];
 const history = data.history.map((item) => {
  if (!record(item) || (item.kind !== "post" && item.kind !== "dynamic")) {
   throw new Error("备份完整性校验失败：历史版本类型无效。");
  }
  return document(item, item.kind, true);
 });
 const revisions = new Map<string, BackupDocument>();
 for (const item of history) {
  const key = identity(item);
  if (revisions.has(key)) throw new Error("备份完整性校验失败：历史版本重复。");
  revisions.set(key, item);
 }
 const currentIds = new Set<string>();
 let deletedCount = 0;
 for (const item of current) {
  const key = JSON.stringify([item.kind, item.id]);
  if (currentIds.has(key)) throw new Error("备份完整性校验失败：当前内容 ID 重复。");
  currentIds.add(key);
  if (item.deleted === true) { deletedCount++; continue; }
  const historical = revisions.get(identity(item));
  if (!historical || historical.path !== item.path || historical.source !== item.source) {
   throw new Error("备份完整性校验失败：当前内容对应的历史版本缺失或不匹配。");
  }
 }
 return { currentCount: current.length, deletedCount, historyCount: history.length };
}
