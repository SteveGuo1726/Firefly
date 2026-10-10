import { parsePostDocument } from "../utils/admin/content-format.ts";

const OWNER="SteveGuo1726";
const REPO="Firefly";
const BRANCH="ai/preview-test";
const MAX_POSTS=2000;
function headers(token=""){
 return {
  Accept:"application/vnd.github+json",
  ...(token?{Authorization:"Bearer "+token}:{}),
  "User-Agent":"Firefly-Preview-Private-Index",
  "X-GitHub-Api-Version":"2022-11-28",
 };
}
function encodePath(path){return path.split("/").map(encodeURIComponent).join("/");}
export async function buildPreviewPrivatePostIndex({fetcher=fetch,token=""}={}){
 const root="https://api.github.com/repos/"+OWNER+"/"+REPO;
 const opts={headers:headers(token)};
 const treeRes=await fetcher(root+"/git/trees/"+encodeURIComponent(BRANCH)+"?recursive=1",opts);
 if(!treeRes.ok)throw new Error("GitHub tree unavailable");
 const tree=await treeRes.json();
 if(tree.truncated||!Array.isArray(tree.tree))throw new Error("GitHub tree incomplete");
 const paths=tree.tree.filter(file=>
  file.type==="blob" &&
  /^src\/content\/posts\/[A-Za-z0-9][A-Za-z0-9_./-]*\.mdx?$/.test(file.path) &&
  !file.path.includes("..") && !file.path.includes("\\")
 ).map(file=>file.path);
 if(paths.length>MAX_POSTS)throw new Error("Too many GitHub posts");
 const posts=[];
 for(let start=0;start<paths.length;start+=6){
  const rows=await Promise.all(paths.slice(start,start+6).map(async path=>{
   const response=await fetcher(root+"/contents/"+encodePath(path)+"?ref="+encodeURIComponent(BRANCH),opts);
   if(!response.ok)throw new Error("GitHub post unavailable");
   const raw=await response.json();
   if(typeof raw.content!=="string" || raw.content.length>3*1024*1024)throw new Error("Invalid Git content");
   const binary=atob(raw.content.replace(/\s/g,""));
   const source=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
   const {fields}=parsePostDocument(source);
   return {
    id:path.slice("src/content/posts/".length).replace(/\.mdx?$/,""),
    path,title:fields.title||path,description:fields.description||"",
    published:fields.published||"",updated:fields.updated||"",
    category:fields.category||"",tags:fields.tags||[],
    draft:Boolean(fields.draft),pinned:Boolean(fields.pinned),
    image:fields.image||"",
   };
  }));
  posts.push(...rows);
 }
 return {posts,source:"preview-github-index"};
}
