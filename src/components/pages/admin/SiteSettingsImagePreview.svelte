<script lang="ts">
import {onDestroy} from 'svelte';
import {isRemoteImageUrl,normalizeLocalImagePath} from '@/utils/settings/settings-editor-ui';
export let value:string='';
export let label:string='图片';
export let compact:boolean=false;
let checked='';
let imageSrc='';
let imageOptions:string[]=[];
let optionIndex=0;
let failed=false;
let loading=false;
let wait:ReturnType<typeof setTimeout>|undefined;
let version=0;

// Imported source assets are built into separate small chunks and fetched only
// when needed; public/ images are served by a preview-only same-origin proxy.
const bundledSourceImages=import.meta.glob('/src/assets/**/*.{png,jpg,jpeg,webp,avif,gif,svg,ico}',{query:'?url',import:'default'}) as Record<string,()=>Promise<string>>;

async function resolveSource(input:string,current:number){
 const raw=input.trim();
 if(!raw){imageSrc='';imageOptions=[];loading=false;failed=false;return;}
 if(isRemoteImageUrl(raw)){
  imageOptions=[raw];optionIndex=0;imageSrc=raw;failed=false;loading=true;return;
 }
 const normalized=normalizeLocalImagePath(raw);
 if(!normalized){imageSrc='';imageOptions=[];loading=false;failed=true;return;}
 const files=[`/api/admin/auth/site-image${normalized}`,normalized,`https://blog.casto.top${normalized}`];
 imageOptions=files;optionIndex=0;imageSrc=files[0];loading=true;failed=false;
 const sourceKey='/src/'+raw.replace(/^\/?(?:\.\/)?(?:src\/)?/,'').replace(/^public\//,'');
 const importer=bundledSourceImages[sourceKey];
 if(importer){
  try{const asset=await importer();
   if(current===version && typeof asset==='string'){
    imageOptions=[asset,...files];optionIndex=0;imageSrc=asset;failed=false;loading=true;
   }
  }catch{/* Fallback to the public route on preview domain. */}
 }
}
function changeImage(raw:string){
 checked=raw;
 version++;const current=version;
 if(wait)clearTimeout(wait);
 if(!raw.trim()){imageSrc='';imageOptions=[];loading=false;failed=false;return;}
 wait=setTimeout(()=>{void resolveSource(raw,current);},170);
}
$: if(value!==checked)changeImage(value);
function failedLoading(){
 if(optionIndex+1<imageOptions.length){optionIndex++;imageSrc=imageOptions[optionIndex];loading=true;return;}
 imageSrc='';loading=false;failed=true;
}
function loaded(){loading=false;failed=false;}
onDestroy(()=>{if(wait)clearTimeout(wait);});
</script>
<div class="image-preview" class:compact aria-label={`${label}预览`}>
 <div class="preview-caption"><span class="preview-icon">▣</span><span>图片实时预览</span><small>{isRemoteImageUrl(value)?'网络图片':'本地资源'}</small></div>
 {#if !value.trim()}
  <div class="preview-empty">输入图片地址后，这里会显示预览。</div>
 {:else if failed}
  <div class="preview-empty error">当前地址无法预览。请检查文件路径、大小写或网络权限。</div>
 {:else if imageSrc}
  <a href={imageSrc} target="_blank" rel="noopener noreferrer" title="点击查看原图" class="preview-image-link">
   <img src={imageSrc} onerror={failedLoading} onload={loaded} alt={`${label}的图片预览`} decoding="async" loading="lazy" referrerpolicy="no-referrer" />
  </a>
  {#if loading}<small class="preview-loading">正在尝试加载图片…</small>{/if}
 {:else}
  <div class="preview-empty">正在解析图片路径…</div>
 {/if}
</div>
<style>
.image-preview{min-width:0;max-width:100%;border:1px solid var(--line-divider);border-radius:.7rem;background:color-mix(in srgb,var(--card-bg) 87%,var(--primary) 3%);padding:.58rem;display:grid;gap:.5rem;margin-top:.3rem}
.preview-caption{display:flex;align-items:center;gap:.4rem;font-size:.72rem;font-weight:650;min-width:0}
.preview-caption small{margin-left:auto;font-size:.66rem;color:var(--text-muted,#888);font-weight:400}
.preview-icon{font-size:1rem;color:var(--primary)}
.preview-image-link{height:clamp(96px,16vw,180px);display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:.52rem;background:repeating-conic-gradient(#eee1 0% 25%,#7771 0% 50%) 50%/16px 16px;cursor:zoom-in}
.preview-image-link img{max-height:100%;max-width:100%;width:auto;height:auto;object-fit:contain}
.preview-empty{min-height:80px;padding:.6rem;display:flex;justify-content:center;align-items:center;text-align:center;font-size:.72rem;line-height:1.55;color:var(--text-muted,#888);background:color-mix(in srgb,var(--card-bg) 85%,transparent);border-radius:.5rem}
.preview-empty.error{color:#bd5656}
.preview-loading{font-size:.65rem;color:var(--text-muted,#888)}
@media(max-width:620px){.preview-image-link{height:150px}}
.image-preview.compact{padding:.3rem;gap:.25rem;margin-top:0}
.image-preview.compact .preview-caption{font-size:.64rem}
.image-preview.compact .preview-image-link{height:76px}
.image-preview.compact .preview-empty{min-height:45px;font-size:.64rem}
</style>
