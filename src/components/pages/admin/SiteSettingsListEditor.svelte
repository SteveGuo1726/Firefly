<script lang="ts">
import SiteSettingsImagePreview from './SiteSettingsImagePreview.svelte';
import {definitionForList,displayItemTitle,orderedMove} from '@/utils/settings/settings-list-schema';
import type {ListDefinition} from '@/utils/settings/settings-list-schema';
import {isImageSetting,chineseLabel} from '@/utils/settings/settings-editor-ui';
export let section:string;
export let path:string[];
export let value:Record<string,unknown>[];
export let onChange:(next:Record<string,unknown>[])=>void;
let query='',error='';
$: definition=definitionForList(section,path);
$: list=Array.isArray(value)?value:[];
$: visible=list.map((item,index)=>({item,index})).filter(({item})=>!query||Object.values(item).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase())));
function commit(items:Record<string,unknown>[]){if(items.length>300){error='单个列表最多添加 300 项';return;}error='';onChange(items);}
function add(){if(definition)commit([...list,definition.create()]);}
function remove(index:number){if(confirm('从本机草稿中删除「'+displayItemTitle(list[index],index,definition!)+'」？'))commit(list.filter((_,i)=>i!==index));}
function move(index:number,to:number){commit(orderedMove(list,index,to,Boolean(definition?.orderByWeight)));}
function change(index:number,key:string,next:unknown){commit(list.map((item,i)=>i===index?{...item,[key]:next}:item));}
function jsonField(index:number,key:string,text:string){try{change(index,key,JSON.parse(text))}catch{error='附加选项的 JSON 格式不正确。'}}
function fields(item:Record<string,unknown>,def:ListDefinition){
 const keys=new Set(def.fields.map(f=>f.key));
 return [...def.fields.filter(f=>Object.hasOwn(item,f.key)||['enabled','showName','fetchFeed','feedurl','qrCode','avatar','tags'].includes(f.key)),...Object.keys(item).filter(k=>!keys.has(k)&&k!=='items'&&k!=='children').map(k=>({key:k,title:chineseLabel(section,[...path,k]),kind:typeof item[k]==='object'?'json':typeof item[k]==='boolean'?'boolean':typeof item[k]==='number'?'number':'text'}))];
}
function imageField(key:string,value:unknown){return ['imgurl','avatar','qrCode','cover','src'].includes(key)||(key==='icon'&&typeof value==='string'&&isImageSetting(section,[...path,key],value));}
function nested(item:Record<string,unknown>,key:string){return Array.isArray(item[key])?item[key] as Record<string,unknown>[]:[];}
const componentOptions=[['profile','个人资料'],['announcement','公告'],['music','音乐播放器'],['categories','分类'],['tags','标签'],['advertisement','广告'],['stats','统计'],['calendar','日历'],['sidebarToc','目录'],['dynamic','最新动态'],['siteInfo','站点信息']];
function options(key:string):string[][]{
 if(key==='type'&&path.some(x=>x.includes('Components')))return componentOptions;
 if(key==='position'&&path.some(x=>x.includes('Components')))return [['top','正常显示'],['sticky','跟随滚动']];
 return [];
}
</script>
<section class="list-manager" aria-label={definition?.title||'列表'}>
 <header class="list-toolbar">
  <strong>{definition?.title||'列表'}</strong><span>{list.length} 项</span>
  {#if list.length>8}<input class="list-search" type="search" aria-label="搜索列表" placeholder="搜索名称或网址" bind:value={query}/>{/if}
  <button type="button" class="add" onclick={add} disabled={!definition}>＋ 新增{definition?.itemLabel||'项目'}</button>
 </header>
 {#if definition?.help}<p class="list-description">{definition.help}</p>{/if}
 {#if error}<p role="alert" class="list-error">{error}</p>{/if}
 {#if !visible.length}<p class="empty">{list.length?'没有匹配的条目':'暂无内容，点击右上角新增。'}</p>{/if}
 <div class="list-rows">
  {#each visible as found (found.index)}
   {@const item=found.item}
   {@const index=found.index}
   <article class="list-card" class:inactive={item.enabled===false||item.enable===false}>
    <div class="list-line">
     <details class="item-detail">
      <summary><span class="num">{index+1}</span><span class="item-title"><strong>{displayItemTitle(item,index,definition!)}</strong><small>{item.enabled===false?'已停用 · ':''}{String(item.siteurl||item.url||item.desc||'点击展开编辑')}</small></span><span class="expand">编辑 ▾</span></summary>
      <div class="item-body">
       <div class="item-fields">
        {#each fields(item,definition!) as field (field.key)}
         {@const val=item[field.key]}
         <div class="item-field" class:wide={['textarea','json','lines','image'].includes(field.kind||'')||imageField(field.key,val)}>
          <label>{field.title}</label>
          {#if field.kind==='boolean'||typeof val==='boolean'}
           <label class="checkbox-inline"><input type="checkbox" checked={val===true} onchange={e=>change(index,field.key,(e.currentTarget as HTMLInputElement).checked)}/><span>{val===true?'开启':'关闭'}</span></label>
          {:else if field.kind==='lines'||Array.isArray(val)&&val.every(v=>typeof v==='string')}
           <textarea rows="2" onblur={e=>change(index,field.key,(e.currentTarget as HTMLTextAreaElement).value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))}>{Array.isArray(val)?val.join('\n'):''}</textarea>
          {:else if field.kind==='json'||val!==null&&typeof val==='object'}
           <textarea rows="3" spellcheck="false" onblur={e=>jsonField(index,field.key,(e.currentTarget as HTMLTextAreaElement).value)}>{JSON.stringify(val??{},null,2)}</textarea>
          {:else if field.kind==='number'||typeof val==='number'}
           <input type="number" value={Number(val??0)} oninput={e=>change(index,field.key,Number((e.currentTarget as HTMLInputElement).value))}/>
          {:else if options(field.key).length}
           <select value={String(val??'')} onchange={e=>change(index,field.key,(e.currentTarget as HTMLSelectElement).value)}>{#each options(field.key) as opt}<option value={opt[0]}>{opt[1]}</option>{/each}{#if val&&!options(field.key).some(opt=>opt[0]===val)}<option value={String(val)}>{String(val)}</option>{/if}</select>
          {:else if field.kind==='textarea'}
           <textarea rows="2" oninput={e=>change(index,field.key,(e.currentTarget as HTMLTextAreaElement).value)}>{String(val??'')}</textarea>
          {:else}
           <input type="text" value={String(val??'')} oninput={e=>change(index,field.key,(e.currentTarget as HTMLInputElement).value)}/>
          {/if}
          {#if field.hint}<small>{field.hint}</small>{/if}
          {#if imageField(field.key,val)}<SiteSettingsImagePreview compact={true} label={field.title} value={typeof val==='string'?val:''}/>{/if}
         </div>
        {/each}
       </div>
       {#if path.length===0&&(section==='booknavConfig'||section==='navCustomLinks')}
        <div class="nested">
         <svelte:self {section} path={[...path,String(index),section==='booknavConfig'?'items':'children']} value={nested(item,section==='booknavConfig'?'items':'children')} onChange={children=>change(index,section==='booknavConfig'?'items':'children',children)}/>
        </div>
       {/if}
      </div>
     </details>
     <div class="list-actions">
      <button type="button" aria-label={'上移 '+displayItemTitle(item,index,definition!)} title="上移" onclick={()=>move(index,index-1)} disabled={index===0||!!query}>↑</button>
      <button type="button" aria-label={'下移 '+displayItemTitle(item,index,definition!)} title="下移" onclick={()=>move(index,index+1)} disabled={index===list.length-1||!!query}>↓</button>
      <button type="button" class="danger" aria-label={'删除 '+displayItemTitle(item,index,definition!)} onclick={()=>remove(index)}>删除</button>
     </div>
    </div>
   </article>
  {/each}
 </div>
</section>
<style>
.list-manager{min-width:0;display:grid;gap:.4rem;width:100%;font-size:.76rem}
.list-toolbar{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap}
.list-toolbar strong{font-size:.78rem}.list-toolbar span{font-size:.66rem;color:var(--text-muted,#888)}
.list-toolbar .add{margin-left:auto;min-height:1.95rem!important;padding:.28rem .55rem!important;color:var(--primary);background:color-mix(in srgb,var(--primary) 10%,var(--card-bg));white-space:nowrap}
.list-search{width:160px!important;min-height:1.9rem!important;margin:0!important;font-size:.75rem!important}
.list-description{font-size:.68rem;color:var(--text-muted,#888);line-height:1.45;margin:0}
.list-error{font-size:.7rem;color:#b44;margin:0}.empty{padding:.8rem;text-align:center;border:1px dashed var(--line-divider);border-radius:.5rem;font-size:.72rem;color:var(--text-muted,#888)}
.list-rows{display:grid;gap:.26rem;min-width:0}
.list-card{border:1px solid var(--line-divider);background:var(--card-bg);border-radius:.5rem;min-width:0}
.list-card.inactive{opacity:.75}
.list-line{display:flex;min-width:0;align-items:flex-start;gap:.2rem;padding:.22rem .36rem}
.item-detail{flex:1;min-width:0}
.item-detail>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:.42rem;min-height:2.25rem;padding:.08rem 0;min-width:0}
.item-detail>summary::-webkit-details-marker{display:none}
.item-detail>summary:focus-visible{outline:2px solid var(--primary);border-radius:.35rem}
.num{width:1.8rem;height:1.8rem;flex-shrink:0;background:color-mix(in srgb,var(--primary) 8%,var(--card-bg));color:var(--primary);display:grid;place-items:center;border-radius:.36rem;font-size:.69rem}
.item-title{display:grid;flex:1;min-width:0;gap:.08rem}
.item-title strong{font-weight:650;font-size:.77rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-title small{font-size:.64rem;color:var(--text-muted,#888);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.expand{font-size:.65rem;color:var(--text-muted,#888);white-space:nowrap}
.item-detail[open] .expand{color:var(--primary)}
.list-actions{display:flex;align-items:center;gap:.1rem;flex-shrink:0;padding-top:.21rem}
.list-manager .list-actions button{font-size:.74rem;min-height:1.8rem!important;min-width:1.7rem!important;padding:.15rem .27rem!important;border-radius:.3rem!important}
.list-manager .list-actions .danger{color:#c45;border-color:transparent;padding-inline:.42rem!important}
.item-body{padding:.55rem .18rem .5rem;margin-top:.14rem;border-top:1px solid var(--line-divider);min-width:0}
.item-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.48rem}
.item-field{display:grid;min-width:0;gap:.21rem}
.item-field.wide{grid-column:span 2}
.item-field>label:first-child{font-size:.7rem;font-weight:660}
.item-field>small{color:var(--text-muted,#888);font-size:.64rem}
.item-field input,.item-field textarea,.item-field select{font-size:.76rem;width:100%;min-width:0;border:1px solid var(--line-divider);border-radius:.4rem;background:var(--card-bg);color:inherit;padding:.28rem .5rem;min-height:2.05rem;margin:0!important}
.item-field textarea{resize:vertical}
.checkbox-inline{display:flex;align-items:center;gap:.38rem;min-height:2rem;font-size:.72rem}
.checkbox-inline input{width:1rem!important;height:1rem!important;min-height:0!important;accent-color:var(--primary)}
.nested{border-top:1px solid var(--line-divider);margin-top:.65rem;padding-top:.65rem}
.item-field :global(.image-preview.compact){margin:0;padding:.3rem}
.item-field :global(.image-preview.compact .preview-image-link){height:76px}
@media(max-width:620px){.item-fields{grid-template-columns:minmax(0,1fr)}.item-field.wide{grid-column:span 1}.expand{font-size:.58rem}.list-search{order:3;width:100%!important}.list-manager .list-actions button{min-width:1.4rem!important;padding:.12rem!important}.item-title small{max-width:140px}}
</style>
