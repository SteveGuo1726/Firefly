import type { GitHubAdminSession } from "./github-session";
import { fetchGitContentSource } from "./github-content-reader";
import { parsePostDocument } from "./content-format";

export type PrivateBasePost = {
 id:string;path:string;title:string;description:string;published:string;updated:string;
 category:string;tags:string[];draft:boolean;pinned:boolean;image:string;
};
type TreeEntry={path:string;type:string};
const POSTS_PREFIX="src/content/posts/";
const EXT=/\.(?:md|mdx)$/i;
function githubHeaders(session:GitHubAdminSession):HeadersInit {
 return {Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",
  ...(session.oauth?{}:{Authorization:`Bearer ${session.token}`})};
}
function safePostPath(path:string):boolean {
 return path.startsWith(POSTS_PREFIX) && EXT.test(path) && !path.includes("..") && !path.includes("\\");
}
async function readGitTree(session:GitHubAdminSession):Promise<string[]>{
 const endpoint=`https://api.github.com/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/git/trees/${encodeURIComponent(session.branch)}?recursive=1`;
 const response=await fetch(endpoint,{headers:githubHeaders(session),cache:"no-store"});
 if(!response.ok)throw new Error(`GitHub 文件树读取失败：${response.status}`);
 const data=await response.json() as {truncated?:boolean;tree?:TreeEntry[]};
 if(data.truncated || !Array.isArray(data.tree))throw new Error("GitHub 文件树不完整，已停止读取，防止遗漏草稿。");
 return data.tree.filter(item=>item.type==="blob"&&safePostPath(item.path)).map(item=>item.path);
}
function asPost(path:string,source:string):PrivateBasePost {
 const {fields}=parsePostDocument(source);
 return {id:path.slice(POSTS_PREFIX.length).replace(EXT,""),path,title:fields.title||path,
  description:fields.description||"",published:fields.published||"",updated:fields.updated||"",
  category:fields.category||"",tags:fields.tags||[],draft:fields.draft,
  pinned:fields.pinned,image:fields.image||""};
}
/** Complete Git baseline index for the authenticated CMS, including unpublished posts.
 * Public prerendered index remains filtered. GitHub access permissions still apply.
 */
export async function fetchPrivatePostIndex(session:GitHubAdminSession,publicPosts:PrivateBasePost[]):Promise<PrivateBasePost[]>{
 if(session.oauth){
  const response=await fetch("/api/admin/private-index",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("文章索引 API 暂时不可用，请稍后刷新重试。");
  const result=await response.json() as {posts:PrivateBasePost[]};
  if(!Array.isArray(result.posts))throw new Error("私有文章索引响应无效");
  const posts=result.posts as PrivateBasePost[] & {limited?:boolean};
  if((result as {limited?:boolean}).limited)posts.limited=true;
  return posts;
 }
 const paths=await readGitTree(session);
 const byPath=new Map(publicPosts.map(item=>[item.path,item]));
 const missing=paths.filter(path=>!byPath.has(path));
 const results:PrivateBasePost[]=[];
 let next=0;
 const worker=async()=>{while(next<missing.length){
  const path=missing[next++];
  const file=await fetchGitContentSource(session,path);
  results.push(asPost(path,file.source));
 }};
 await Promise.all(Array.from({length:Math.min(5,missing.length)},()=>worker()));
 const all=[...paths.filter(path=>byPath.has(path)).map(path=>byPath.get(path)!),...results];
 return all.sort((a,b)=>Date.parse(b.published||"0")-Date.parse(a.published||"0"));
}
