import { githubAdminConfig } from "@/config/githubAdminConfig";
import type { GitHubRepoConfig } from "@/utils/write/github";

export const GITHUB_SESSION_CHANGED_EVENT =
	"firefly:github-admin-session-changed";

const STORAGE_KEY = "FIREFLY_GITHUB_ADMIN_SESSION_V1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type GitHubAdminSession = {
	login: string;
	name: string;
	avatarUrl: string;
	token: string;
	owner: string;
	repo: string;
	branch: string;
	expiresAt: number;
};

type GitHubUserResponse = {
	login?: string;
	name?: string | null;
	avatar_url?: string;
	message?: string;
};

type GitHubRepositoryResponse = {
	full_name?: string;
	permissions?: {
		push?: boolean;
	};
	message?: string;
};

function storageAvailable(): boolean {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function notifySessionChanged(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(GITHUB_SESSION_CHANGED_EVENT));
}

export function getGitHubAdminSession(): GitHubAdminSession | null {
	if (!storageAvailable()) return null;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;

	try {
		const session = JSON.parse(raw) as GitHubAdminSession;
		if (
			!session.token ||
			!session.login ||
			!session.expiresAt ||
			Date.now() >= session.expiresAt ||
			session.login.toLowerCase() !==
				githubAdminConfig.allowedLogin.toLowerCase()
		) {
			clearGitHubAdminSession(false);
			return null;
		}
		return session;
	} catch {
		clearGitHubAdminSession(false);
		return null;
	}
}

export function getGitHubRepoConfigFromSession(
	session = getGitHubAdminSession(),
): GitHubRepoConfig | null {
	if (!session) return null;
	return {
		owner: session.owner,
		repo: session.repo,
		branch: session.branch,
		token: session.token,
	};
}

export function clearGitHubAdminSession(notify = true): void {
	if (storageAvailable()) localStorage.removeItem(STORAGE_KEY);
	if (notify) notifySessionChanged();
}

export async function loginWithGitHubToken(
	tokenInput: string,
): Promise<GitHubAdminSession> {
	const token = tokenInput.trim();
	if (!token) throw new Error("请输入 GitHub Fine-grained PAT。");

	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const userResponse = await fetch("https://api.github.com/user", { headers });
	const user = (await userResponse.json()) as GitHubUserResponse;
	if (!userResponse.ok || !user.login) {
		throw new Error(user.message || `GitHub 验证失败：${userResponse.status}`);
	}
	if (
		user.login.toLowerCase() !== githubAdminConfig.allowedLogin.toLowerCase()
	) {
		throw new Error(`该账号没有管理权限：${user.login}`);
	}

	const repositoryResponse = await fetch(
		`https://api.github.com/repos/${githubAdminConfig.owner}/${githubAdminConfig.repo}`,
		{ headers },
	);
	const repository =
		(await repositoryResponse.json()) as GitHubRepositoryResponse;
	if (!repositoryResponse.ok) {
		throw new Error(
			repository.message || `仓库验证失败：${repositoryResponse.status}`,
		);
	}
	if (repository.permissions?.push === false) {
		throw new Error("当前 Token 没有仓库写入权限。");
	}

	const session: GitHubAdminSession = {
		login: user.login,
		name: user.name?.trim() || user.login,
		avatarUrl: user.avatar_url || "",
		token,
		owner: githubAdminConfig.owner,
		repo: githubAdminConfig.repo,
		branch: githubAdminConfig.branch,
		expiresAt: Date.now() + githubAdminConfig.sessionDays * DAY_MS,
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
	notifySessionChanged();
	return session;
}
