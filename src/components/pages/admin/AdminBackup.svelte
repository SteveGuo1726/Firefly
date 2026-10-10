<script lang="ts">
import type {GitHubAdminSession} from "@/utils/admin/github-session";
import {exportLiveContent} from "@/utils/admin/live-content-client";
export let session:GitHubAdminSession;
let busy=false;
let error="";
let success="";
async function downloadBackup(){
 if(busy)return;
 busy=true;error="";success="";
 try{
  const data=await exportLiveContent(session);
  const text=JSON.stringify(data,null,2);
  if(!text || text==="null" || text==="{}")throw new Error("备份内容为空，已取消导出。");
  const file=new Blob([text],{type:"application/json;charset=utf-8"});
  const address=URL.createObjectURL(file);
  try{
   const link=document.createElement("a");
   link.href=address;
   link.download="firefly-live-content-"+new Date().toISOString().slice(0,10)+".json";
   document.body.appendChild(link);
   link.click();link.remove();
  }finally{
   window.setTimeout(()=>URL.revokeObjectURL(address),5000);
  }
  success=`已校验并导出 ${documents.length} 条实时内容记录。文件可能包含未公开文章和动态正文，请妥善保存。`;
 }catch(e){
  error=e instanceof Error?e.message:"备份下载失败。";
 }finally{busy=false;}
}
</script>
<section class="backup card-base">
 <header><h2>备份与恢复准备</h2><p>导出当前实时内容数据库的完整文章、动态和删除标记。不会修改 Git 仓库，也不会触发构建。</p></header>
 <div class="warning">导出文件包含实时内容源文件与可能未公开的草稿。不要把它放在公开网盘、Git 仓库或评论附件里。</div>
 <button type="button" class="primary" onclick={downloadBackup} disabled={busy}>{busy?"正在读取完整数据...":"下载完整实时内容 JSON 备份"}</button>
 {#if error}<p role="alert" class="error">{error}</p>{/if}
 {#if success}<p role="status" class="success">{success}</p>{/if}
 <p class="foot">历史版本恢复请在文章或动态编辑器中操作。自动 Git 归档是另一条受控流程，此按钮不会将任何内容推送到 master。</p>
</section>
<style>
.backup{padding:1.5rem;display:grid;gap:1rem}header h2{font-weight:800;font-size:1.3rem;margin:0}header p,.foot{font-size:.85rem;opacity:.66;margin:.3rem 0}.warning{padding:.85rem 1rem;border-radius:.6rem;border:1px solid rgb(210 151 45 / 45%);background:rgb(210 151 45 / 9%);font-size:.83rem}.primary{justify-self:start;padding:.75rem 1rem;border:0;border-radius:.55rem;background:var(--primary);color:#fff;font:inherit;font-weight:700;cursor:pointer}.primary:disabled{opacity:.5}.error{color:#c43d3d}.success{color:var(--primary)}
</style>
