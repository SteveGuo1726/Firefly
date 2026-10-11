import matter from "gray-matter";
/**
 * Private Git content index. Unlike the prerendered public index this endpoint
 * is authenticated and never exposes article bodies.
 */
export async function buildPrivatePostIndex({token,owner,repo,branch,fetcher=fetch}){
 const headers={Accept:"application/vnd.github+json",...(token?{Authorization:"Bearer "+token}:{}),"X-GitHub-Api-Version":"2022-11-28","User-Agent":"Firefly-Admin-Index"};
 const root="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
 const treeResponse=await fetcher(root+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1",{headers});
 if(!treeResponse.ok)throw new Error("GitHub content tree unavailable");
 const tree=await treeResponse.json();
 if(!Array.isArray(tree.tree))throw new Error("GitHub content tree response malformed");
 if(tree.truncated)throw new Error("GitHub content tree truncated; refusing incomplete private index");
 const files=(tree.tree||[]).filter(x=>x.type==="blob"&&/^src\/content\/posts\/.+\.mdx?$/.test(x.path));
 if(files.length>2000)throw new Error("GitHub content index exceeds safe limit");
 const read=async file=>{
  const response=await fetcher(root+"/contents/"+file.path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers});
  if(!response.ok)throw new Error("GitHub content read failed: "+file.path);
  const value=await response.json();
  const raw=String(value.content||"").replace(/\s/g,"");
  const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
  const source=new TextDecoder().decode(bytes);
  const {data}=matter(source);
  const text=value=>value==null?"":value instanceof Date?value.toISOString():String(value);
  const list=value=>Array.isArray(value)?value.map(text).filter(Boolean):[];
  return {id:file.path.slice("src/content/posts/".length).replace(/\.mdx?$/,""),path:file.path,
   title:text(data.title),description:text(data.description),published:text(data.published),
   updated:text(data.updated),category:text(data.category),tags:list(data.tags),
   draft:data.draft===true,pinned:data.pinned===true,image:text(data.image)};

 };
 const posts=[];
 for(let i=0;i<files.length;i+=8){posts.push(...await Promise.all(files.slice(i,i+8).map(read)));}
 return {posts,source:"private-github-index"};
}
