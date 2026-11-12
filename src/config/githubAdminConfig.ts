type GitHubAdminConfig = {
	readonly allowedLogin: string;
	readonly owner: string;
	readonly repo: string;
	readonly branch: string;
	readonly sessionDays: number;
};

const configuredBranch: string =
	import.meta.env?.PUBLIC_GITHUB_ADMIN_BRANCH?.trim() || "master";

export const githubAdminConfig: GitHubAdminConfig = {
	allowedLogin: "SteveGuo1726",
	owner: "SteveGuo1726",
	repo: "Firefly",
	branch: configuredBranch,
	sessionDays: 30,
};
