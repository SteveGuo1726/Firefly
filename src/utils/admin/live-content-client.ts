import type { GitHubAdminSession } from "@/utils/admin/github-session";

export type LiveContentKind = "post" | "dynamic";

export type LiveContentIndexEntry = {
	id: string;
	path: string;
	meta: Record<string, unknown>;
	baseGitSha: string;
	revision: string;
	deleted: boolean;
	updatedAt: string;
};

export type LiveContentDocument = LiveContentIndexEntry & {
	schemaVersion: number;
	kind: LiveContentKind;
	source?: string;
	updatedBy: string;
};

function endpoint(path: string, params?: Record<string, string>): string {
	const url = new URL(`/api/live-content${path}`, window.location.origin);
	for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
	return url.toString();
}

function announceLiveMutation(kind: LiveContentKind): void {
 try {
  window.localStorage.setItem("firefly:live-content-updated", JSON.stringify({kind, at: Date.now()}));
 } catch {
  // Never fail a successful write because storage is unavailable.
 }
}

async function readJson(response: Response) {
	const payload = await response.json().catch(() => ({}));
	if (response.status === 409) throw new Error(`远端实时版本已变化，保存已取消。请先复制当前编辑内容，再重新打开最新版本并合并修改。${payload?.error ? `（${payload.error}）` : ""}`);
	if (!response.ok) throw new Error(payload?.error || `实时内容服务请求失败：${response.status}`);
	return payload;
}

export async function fetchLiveContentIndex(
	kind: LiveContentKind,
	session?: GitHubAdminSession,
): Promise<{ updatedAt: string | null; entries: LiveContentIndexEntry[] }> {
	return readJson(await fetch(endpoint("/index", { kind }), {
		cache: "no-store",
		headers: session
			? { Authorization: `Bearer ${session.token}` }
			: undefined,
	}));
}

export async function fetchLiveContentItem(
	kind: LiveContentKind,
	id: string,
	session?: GitHubAdminSession,
): Promise<LiveContentDocument | null> {
	const response = await fetch(endpoint("/item", { kind, id }), {
		cache: "no-store",
		headers: session
			? { Authorization: `Bearer ${session.token}` }
			: undefined,
	});
	if (response.status === 404) return null;
	if (response.status === 410) {
		return { id, kind, deleted: true } as LiveContentDocument;
	}
	return readJson(response);
}

export async function saveLiveContentItem(options: {
	session: GitHubAdminSession;
	kind: LiveContentKind;
	id: string;
	path: string;
	source: string;
	meta: Record<string, unknown>;
	baseGitSha?: string;
	baseGitBranch?: string;
	expectedRevision?: string;
	previousId?: string;
	previousPath?: string;
	previousBaseGitSha?: string;
	previousBaseGitBranch?: string;
}): Promise<{ revision: string; updatedAt: string }> {
	const result = await readJson(await fetch(endpoint("/item"), {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${options.session.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			kind: options.kind,
			id: options.id,
			path: options.path,
			source: options.source,
			meta: options.meta,
			baseGitSha: options.baseGitSha || "",
			baseGitBranch: options.baseGitBranch || options.session.branch,
			expectedRevision: options.expectedRevision || "",
			previousId: options.previousId || "",
			previousPath: options.previousPath || "",
			previousBaseGitSha: options.previousBaseGitSha || "",
			previousBaseGitBranch:
				options.previousBaseGitBranch || options.session.branch,
		}),
	}));
	announceLiveMutation(options.kind);
	return result;
}

export async function deleteLiveContentItem(options: {
	session: GitHubAdminSession;
	kind: LiveContentKind;
	id: string;
	path?: string;
	meta?: Record<string, unknown>;
	baseGitSha?: string;
	baseGitBranch?: string;
	expectedRevision?: string;
}): Promise<{ revision: string; updatedAt: string }> {
	const result = await readJson(await fetch(endpoint("/item", { kind: options.kind, id: options.id }), {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${options.session.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			path: options.path || "",
			meta: options.meta || {},
			baseGitSha: options.baseGitSha || "",
			baseGitBranch: options.baseGitBranch || options.session.branch,
			expectedRevision: options.expectedRevision || "",
		}),
	}));
	announceLiveMutation(options.kind);
	return result;
}

export async function exportLiveContent(session: GitHubAdminSession): Promise<unknown> {
	return readJson(await fetch(endpoint("/export"), {
		headers: { Authorization: `Bearer ${session.token}` },
		cache: "no-store",
	}));
}
