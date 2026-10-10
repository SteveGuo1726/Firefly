import type { GitHubAdminSession } from "@/utils/admin/github-session";

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(value: string): string {
	const binary=atob(value.replace(/\n/g,""));
	const bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

export async function fetchGitContentSource(
	session: GitHubAdminSession,
	path: string,
): Promise<{ source:string; sha:string }> {
	const response=await fetch(
		`https://api.github.com/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(session.branch)}`,
		{headers:{
			Accept:"application/vnd.github+json",
			...(session.oauth ? {} : {Authorization:`Bearer ${session.token}`}),
			"X-GitHub-Api-Version":"2022-11-28",
		}},
	);
	const payload=await response.json();
	if(!response.ok||!payload?.content||!payload?.sha){
		throw new Error(payload?.message||`读取 GitHub 源文件失败：${response.status}`);
	}
	return {source:decodeBase64Utf8(payload.content),sha:payload.sha};
}
