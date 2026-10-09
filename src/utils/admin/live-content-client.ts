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
	for (const [key, value] of Object.entries(params || {})) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

async function readJson(response: Response) {
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error || `实时内容服务请求失败：${response.status}`);
	}
	return payload;
}

export async function fetchLiveContentIndex(kind: LiveContentKind): Promise<{
	updatedAt: string | null;
	entries: LiveContentIndexEntry[];
}> {
	const response = await fetch(endpoint("/index", { kind }), {
		cache: "no-store",
	});
	return readJson(response);
}

export async function fetchLiveContentItem(
	kind: LiveContentKind,
	id: string,
): Promise<LiveContentDocument | null> {
	const response = await fetch(endpoint("/item", { kind, id }), {
		cache: "no-store",
	});
	if (response.status === 404) return null;
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
}): Promise<{ revision: string; updatedAt: string }> {
	const response = await fetch(endpoint("/item"), {
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
		}),
	});
	return readJson(response);
}

export async function deleteLiveContentItem(options: {
	session: GitHubAdminSession;
	kind: LiveContentKind;
	id: string;
}): Promise<{ revision: string; updatedAt: string }> {
	const response = await fetch(
		endpoint("/item", { kind: options.kind, id: options.id }),
		{
			method: "DELETE",
			headers: { Authorization: `Bearer ${options.session.token}` },
		},
	);
	return readJson(response);
}

export async function exportLiveContent(
	session: GitHubAdminSession,
): Promise<unknown> {
	const response = await fetch(endpoint("/export"), {
		headers: { Authorization: `Bearer ${session.token}` },
		cache: "no-store",
	});
	return readJson(response);
}
