export type GitHubRepoConfig = {
	owner: string;
	repo: string;
	branch: string;
	token: string;
};

export type GitHubRepoFile = {
	path: string;
	sha: string;
	content: string;
	htmlUrl: string;
	downloadUrl: string;
};

export type GitHubRepoTreeEntry = {
	path: string;
	type: string;
};

type GitHubContentsResponse = {
	content?: string;
	encoding?: string;
	sha?: string;
	html_url?: string;
	download_url?: string;
	message?: string;
};

type GitHubTreeResponse = {
	tree?: Array<{
		path?: string;
		type?: string;
	}>;
	message?: string;
};

function encodePath(path: string): string {
	return path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function getHeaders(token: string): HeadersInit {
	return {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

function decodeBase64Utf8(base64Content: string): string {
	const binary = atob(base64Content.replace(/\n/g, ""));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

export function encodeUtf8ToBase64(content: string): string {
	const bytes = new TextEncoder().encode(content);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function buildGitHubSourceUrl(
	config: Pick<GitHubRepoConfig, "owner" | "repo" | "branch">,
	filePath: string,
): string {
	return `https://github.com/${config.owner}/${config.repo}/blob/${encodeURIComponent(config.branch)}/${filePath}`;
}

export function buildGitHubRawUrl(
	config: Pick<GitHubRepoConfig, "owner" | "repo" | "branch">,
	filePath: string,
): string {
	return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${filePath}`;
}

export async function fetchRepoFile(
	config: GitHubRepoConfig,
	filePath: string,
): Promise<GitHubRepoFile> {
	const response = await fetch(
		`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(config.branch)}`,
		{
			headers: getHeaders(config.token),
		},
	);

	const payload = (await response.json()) as GitHubContentsResponse;
	if (!response.ok || !payload.content || !payload.sha) {
		throw new Error(payload.message || `读取文件失败：${response.status}`);
	}

	return {
		path: filePath,
		sha: payload.sha,
		content: decodeBase64Utf8(payload.content),
		htmlUrl: payload.html_url || buildGitHubSourceUrl(config, filePath),
		downloadUrl: payload.download_url || buildGitHubRawUrl(config, filePath),
	};
}

export async function listRepoTree(
	config: GitHubRepoConfig,
): Promise<GitHubRepoTreeEntry[]> {
	const response = await fetch(
		`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`,
		{
			headers: getHeaders(config.token),
		},
	);

	const payload = (await response.json()) as GitHubTreeResponse;
	if (!response.ok || !payload.tree) {
		throw new Error(payload.message || `读取仓库目录失败：${response.status}`);
	}

	return payload.tree
		.filter(
			(entry): entry is { path: string; type: string } =>
				typeof entry.path === "string" && typeof entry.type === "string",
		)
		.map((entry) => ({
			path: entry.path,
			type: entry.type,
		}));
}

export async function saveRepoFile(options: {
	config: GitHubRepoConfig;
	filePath: string;
	content: string;
	message: string;
	sha?: string;
}): Promise<{ commitUrl: string | null }> {
	const response = await fetch(
		`https://api.github.com/repos/${encodeURIComponent(options.config.owner)}/${encodeURIComponent(options.config.repo)}/contents/${encodePath(options.filePath)}`,
		{
			method: "PUT",
			headers: {
				...getHeaders(options.config.token),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				message: options.message,
				content: encodeUtf8ToBase64(options.content),
				branch: options.config.branch,
				sha: options.sha,
			}),
		},
	);

	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.message || `保存文件失败：${response.status}`);
	}

	return {
		commitUrl: payload?.commit?.html_url ?? null,
	};
}
