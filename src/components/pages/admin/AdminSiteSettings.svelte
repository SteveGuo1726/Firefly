<script lang="ts">
import {onMount} from "svelte";
import bundledSettings from "@/data/site-settings.json";
import {assertSiteSettings} from "@/utils/settings/managed-config";
import type {GitHubAdminSession} from "@/utils/admin/github-session";
import {getGitHubRepoConfigFromSession} from "@/utils/admin/github-session";
import {fetchRepoFile,saveRepoFile} from "@/utils/write/github";
import SiteSettingsImagePreview from "./SiteSettingsImagePreview.svelte";
import {sectionCategories,sectionGroups,chineseLabel,chineseHelp,isImageSetting} from "@/utils/settings/settings-editor-ui";

export let session:GitHubAdminSession;
const configPath="src/data/site-settings.json";
const draftKey="firefly.site-settings.local-draft.v1";
const initial=structuredClone(bundledSettings);
const metadata:Record<string,{title:string;hint:string}>={
 siteConfig:{title:"站点与 SEO",hint:"标题、介绍、语言、主题色、页面宽度、页面及文章展示"},
 announcementConfig:{title:"站点公告",hint:"公告文案、链接与关闭开关"},
 profileConfig:{title:"个人资料",hint:"头像、名称、简介和社交链接"},
 backgroundWallpaper:{title:"首页与壁纸",hint:"桌面与移动端背景、横幅、覆盖与全屏参数"},
 dynamicConfig:{title:"动态页面",hint:"列表标题、描述、分页及评论配置"},
 displaySettingsConfig:{title:"外观控制",hint:"主题与壁纸切换面板、功能开关，部署时解析环境变量"},
 mermaidConfig:{title:"Mermaid 图表",hint:"亮暗主题和图表展示"},
 plantumlConfig:{title:"PlantUML 图表",hint:"图表渲染设置和服务器地址"},
 coverImageConfig:{title:"文章封面",hint:"封面模式、路径及展示行为"},
 licenseConfig:{title:"版权与许可",hint:"授权方式、许可证名称及链接"},
 expressiveCodeConfig:{title:"代码块样式",hint:"代码高亮、行号、Logo和主题"},
 sakuraConfig:{title:"樱花与特效",hint:"动画开关、速度、数量及显示参数"},
 sidebarLayoutConfig:{title:"侧边栏组件",hint:"组件排列、响应式隐藏、布局与内容"},
 analyticsConfig:{title:"访问统计",hint:"公开统计标识与前端分析开关，不含服务端密钥"},
};
type Draft=typeof bundledSettings;
let draft:Draft=structuredClone(initial);
let currentSection:keyof Draft["sections"]="siteConfig";
let advanced=false;
let jsonText="";
let dirty=false;
let savedLocally=false;
let message="";
let error="";
let busy=false;
let editorMode:"fields"|"json"="fields";
const sections=Object.keys(initial.sections) as (keyof Draft["sections"])[];
const toJson=(value:unknown)=>JSON.stringify(value,null,2);
function setMessage(success:string){message=success;error="";}
function sectionValue():Record<string,unknown>{return draft.sections[currentSection] as Record<string,unknown>;}
function changeSection(section:keyof Draft["sections"]){
 if(section===currentSection)return;
 if(editorMode==="json"&&!applyJson())return;
 currentSection=section;
 jsonText=toJson(sectionValue());
 advanced=false;error="";message="";
}
function cloneAndSet(path:string[],value:unknown){
 const candidate=structuredClone(draft);
 let object=candidate.sections[currentSection] as Record<string,unknown>;
 for(const key of path.slice(0,-1))object=object[key] as Record<string,unknown>;
 object[path.at(-1)!]=value;
 draft=candidate;dirty=true;error="";
 // Validate only on save or after leaving JSON mode: partially typed URLs and
 // incomplete numbers must not force the text cursor back to the previous value.
 if(editorMode!=="json")jsonText=toJson(sectionValue());
}
type EditableField={path:string[];value:unknown;kind:"string"|"number"|"boolean"|"json"|"lines"};
function fieldsForCurrent(config:Draft,section:keyof Draft["sections"]):EditableField[]{
 const fields:EditableField[]=[];
 const push=(path:string[],value:unknown)=>{
  if(typeof value==="boolean"||typeof value==="string"||typeof value==="number"){
   fields.push({path,value,kind:typeof value});
  }else fields.push({path,value,kind:"json"});
 };
 const walk=(value:unknown,path:string[]=[],depth=0)=>{
  if(depth>9||fields.length>550){push(path,value);return;}
  if(Array.isArray(value)){
   if(['keywords','categoryOrder','excludedLangs','noReferrerDomains'].includes(path.at(-1)||'') && value.every(entry=>typeof entry==='string')){
    fields.push({path,value,kind:'lines'});return;
   }
   if(!value.length){push(path,value);return;}
   value.forEach((item,index)=>walk(item,[...path,String(index)],depth+1));
  }else if(value!==null&&typeof value==="object"){
   if(!Object.keys(value).length){push(path,value);return;}
   for(const [name,item] of Object.entries(value))walk(item,[...path,name],depth+1);
  }else push(path,value);
 };
 walk(config.sections[section]);return fields;
}
function fieldsForGroup(config:Draft,section:keyof Draft["sections"],keys:string[]):EditableField[]{
 return fieldsForCurrent(config,section).filter(field=>keys.includes(field.path[0]));
}
function fieldName(field:EditableField):string{
 return chineseLabel(currentSection,field.path);
}
function fieldContext(field:EditableField):string{
 const all=field.path.slice(0,-1);
 if(!all.length)return '';
 return all.map((segment,index)=>chineseLabel(currentSection,all.slice(0,index+1))).join(' · ');
}
function enumOptions(field:EditableField):{value:string;label:string}[]|null{
 const path=currentSection+'.'+field.path.join('.');
 const map:Record<string,{value:string;label:string}[]>={
  'siteConfig.themeColor.defaultMode':[{value:'system',label:'跟随系统'},{value:'light',label:'浅色模式'},{value:'dark',label:'深色模式'}],
  'siteConfig.navbar.logo.type':[{value:'image',label:'使用图片'},{value:'icon',label:'使用图标库'}],
  'siteConfig.navbar.menuAlign':[{value:'left',label:'左对齐'},{value:'center',label:'居中'},{value:'right',label:'右对齐'}],
  'siteConfig.navbar.navbarMode':[{value:'fixed',label:'固定在顶部'},{value:'sticky',label:'滚动时吸顶'},{value:'static',label:'跟随页面滚动'}],
  'backgroundWallpaper.mode':[{value:'banner',label:'横幅壁纸'},{value:'fullscreen',label:'全屏壁纸'},{value:'overlay',label:'透明覆盖'},{value:'none',label:'纯色背景'}],
  'siteConfig.imageOptimization.formats':[{value:'webp',label:'WebP 图片'},{value:'avif',label:'AVIF 图片'},{value:'both',label:'两种格式'}],
  'siteConfig.postListLayout.defaultMode':[{value:'list',label:'列表'},{value:'grid',label:'网格'}],
  'siteConfig.postListLayout.mobileDefaultMode':[{value:'list',label:'列表'},{value:'grid',label:'网格'}],
  'siteConfig.postListLayout.coverPosition':[{value:'left',label:'左侧'},{value:'right',label:'右侧'}],
  'siteConfig.categoryStyle':[{value:'rectangle',label:'方角'},{value:'pill',label:'胶囊'},{value:'rounded',label:'圆角'}],
  'siteConfig.tagStyle':[{value:'rectangle',label:'方角'},{value:'pill',label:'胶囊'},{value:'rounded',label:'圆角'}],
 };
 const values=map[path];
 return values?.some(option=>option.value===String(field.value))?values:null;
}
function showImagePreview(field:EditableField):boolean{
 if(!isImageSetting(currentSection,field.path,field.value))return false;
 if(field.path.at(-1)==='value'&&field.path.includes('logo')){
  const root=draft.sections.siteConfig;
  return root.navbar.logo.type==='image';
 }
 return true;
}
function updateField(field:EditableField,raw:string|boolean){
 try{
  const value=field.kind==="boolean"?raw:field.kind==="number"?(String(raw).trim()===''?NaN:Number(raw)):field.kind==="json"?JSON.parse(String(raw)):field.kind==="lines"?String(raw).split(/\r?\n/).map(line=>line.trim()).filter(Boolean):raw;
  cloneAndSet(field.path,value);
 }catch(e){error=e instanceof Error?e.message:"输入格式错误";}
}
function applyJson():boolean{
 try{
  const parsed=JSON.parse(jsonText);
  const candidate=structuredClone(draft);
  (candidate.sections as Record<string,unknown>)[currentSection]=parsed;
  assertSiteSettings(candidate);
  draft=candidate;dirty=true;error="";message="该配置分组 JSON 已通过结构与类型检查。";
  return true;
 }catch(e){error=e instanceof Error?e.message:"JSON 格式有误";return false;}
}
function toggleAdvanced(){
 if(advanced && editorMode==="json" && !applyJson())return;
 advanced=!advanced;
 editorMode=advanced?"json":"fields";
 jsonText=toJson(sectionValue());
}
function validate():boolean{
 if(editorMode==="json"&&!applyJson())return false;
 try{assertSiteSettings(draft);error="";return true;}
 catch(e){error=e instanceof Error?e.message:"配置校验失败";return false;}
}
function saveLocal(){
 if(!validate())return;
 try{
  localStorage.setItem(draftKey,JSON.stringify({version:1,settings:draft,updatedAt:new Date().toISOString()}));
  savedLocally=true;dirty=false;setMessage("配置已保存在此浏览器的本机草稿。不会改动正式博客；需要构建才能发布到站点。");
 }catch(e){error=e instanceof Error?e.message:"本机存储不可用";}
}
function restoreLocal(){
 if(dirty&&!confirm("要舍弃当前未保存的修改并恢复本机草稿吗？"))return;
 try{
  const saved=localStorage.getItem(draftKey);if(!saved){error="当前设备没有保存的站点设置草稿。";return;}
  const parsed=JSON.parse(saved).settings;
  assertSiteSettings(parsed);draft=parsed;dirty=false;savedLocally=true;jsonText=toJson(sectionValue());setMessage("已从当前浏览器恢复站点设置草稿。");
 }catch(e){error=e instanceof Error?e.message:"恢复本机草稿失败";}
}
function resetSection(){
 if(!confirm(`恢复“${metadata[currentSection]?.title||currentSection}”为本次构建的初始值？`))return;
 const candidate=structuredClone(draft);
 (candidate.sections as Record<string,unknown>)[currentSection]=structuredClone(initial.sections[currentSection]);
 draft=candidate;dirty=true;jsonText=toJson(sectionValue());setMessage("此分组已恢复初始值。其他分组保持不变。");
}
function exportJson(){
 if(!validate())return;
 const blob=new Blob([toJson(draft)+"\n"],{type:"application/json;charset=utf-8"});
 const uri=URL.createObjectURL(blob);const a=document.createElement("a");a.href=uri;a.download="firefly-site-settings-DRAFT-"+new Date().toISOString().slice(0,10)+".json";
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(uri);
 setMessage("已下载统一站点设置 JSON 草稿。仅包含公开配置，不包含图床或后台凭据。");
}
const canCommit=()=>Boolean(!session.oauth&&session.token&&session.branch==="ai/preview-test"&&session.owner==="SteveGuo1726"&&session.repo==="Firefly");
async function publishExperiment(){
 if(!canCommit()||busy)return;
 if(!validate())return;
 if(!confirm("提交统一设置 JSON 到 GitHub 的 ai/preview-test 实验分支？这只触发实验构建，不会自动改动 master 或正式站点。"))return;
 const config=getGitHubRepoConfigFromSession(session);
 if(!config||config.branch!=="ai/preview-test"){error="未找到实验分支的 GitHub 写入权限。";return;}
 busy=true;
 try{
  const remote=await fetchRepoFile(config,configPath);
  if(remote.content.trim()!==toJson(initial).trim())throw Error("实验分支上的设置文件自页面加载后已发生变化。请先刷新页面并重新合并，不能直接覆盖。 ");
  const result=await saveRepoFile({config,filePath:configPath,sha:remote.sha,content:toJson(draft)+"\n",message:"config: update centralized experimental site settings"});
  dirty=false;setMessage("已提交到 ai/preview-test 分支。需要等待构建并切换实验预览静态资源后才会在站点生效。"+(result.commitUrl?" GitHub 提交地址可在分支历史中查看。":""));
 }catch(e){error=e instanceof Error?e.message:"实验分支提交失败";}
 finally{busy=false;}
}
onMount(()=>{jsonText=toJson(sectionValue());try{savedLocally=!!localStorage.getItem(draftKey);}catch{}});
</script>

<section class="settings-workspace">
 <header class="settings-header card-base">
  <div><p class="eyebrow">站点配置中心</p><h2>站点设置</h2><p>从左侧选择你想修改的功能，再按说明调整具体设置。图片地址会在输入时自动预览；高级模式保留完整配置编辑能力。</p></div>
  <div class="settings-actions"><button type="button" onclick={saveLocal} disabled={busy}>保存本机草稿</button><button type="button" onclick={exportJson} disabled={busy}>导出完整 JSON</button>{#if canCommit()}<button class="primary" type="button" onclick={publishExperiment} disabled={busy}>{busy?"提交中…":"提交实验分支"}</button>{/if}</div>
 </header>
 <div class="site-mode-notice card-base" role="note"><strong>生效方式：构建时更新</strong><span>站点访客无需额外获取设置文件。后台编辑不会自动影响正式站点；密码、令牌、运行函数和部分尚未迁入 JSON 的高级配置仍由原来的服务端或 TypeScript 文件管理。</span></div>
 {#if error}<p class="settings-feedback error" role="alert">{error}</p>{/if}
 {#if message}<p class="settings-feedback" role="status">{message}</p>{/if}
 <div class="settings-grid">
  <aside class="settings-groups card-base" aria-label="配置分组">
   <div class="sidebar-top"><strong>按用途查找设置</strong><small>已整理 {sections.length} 类功能</small></div>
   {#each sectionCategories as category}
    <div class="category-heading"><strong>{category.title}</strong><small>{category.description}</small></div>
    {#each category.sections as name}
     {#if sections.includes(name as keyof Draft["sections"])}
      <button type="button" class:active={name===currentSection} onclick={()=>changeSection(name as keyof Draft["sections"])} aria-current={name===currentSection?"true":undefined}>
       <strong>{metadata[name]?.title||'其他功能设置'}</strong><small>{metadata[name]?.hint||'调整此功能的展示方式'}</small>
      </button>
     {/if}
    {/each}
   {/each}
  </aside>
  <main class="settings-form card-base">
   <header class="form-heading"><div><span class="eyebrow">可视化站点设置</span><h3>{metadata[currentSection]?.title||'站点功能'}</h3><p>{metadata[currentSection]?.hint}</p></div><div class="form-tools"><button type="button" onclick={toggleAdvanced}>{advanced?"返回图形化设置":"高级：编辑源码数据"}</button><button type="button" onclick={resetSection}>恢复本组默认值</button></div></header>
   {#if advanced}
    <label class="full-json"><span>高级模式：此分类的完整配置数据</span><textarea spellcheck="false" rows="22" bind:value={jsonText}></textarea><small>高级模式面向熟悉配置结构的用户；点击「检查并应用」后才会更新草稿。</small></label>
    <button class="primary" type="button" onclick={applyJson}>检查并应用此分类</button>
   {:else}
    <div class="logical-groups">
     {#each sectionGroups(currentSection,sectionValue()) as group (group.id)}
      <section class="logical-group">
       <header class="logical-group-heading"><h4>{group.title}</h4><p>{group.description}</p></header>
       <div class="fields">
        {#each fieldsForGroup(draft,currentSection,group.keys) as field (field.path.join('.'))}
         <div class="field" class:wide={field.kind==="json"||field.kind==="lines"||showImagePreview(field)||(typeof field.value==="string"&&field.value.length>130)}>
          <label for={`site-field-${currentSection}-${field.path.join('-')}`} class="field-label">{fieldName(field)}</label>
          {#if fieldContext(field)}<small class="field-location">{fieldContext(field)}</small>{/if}
          {#if field.kind==="boolean"}
           <select id={`site-field-${currentSection}-${field.path.join('-')}`} value={String(field.value)} onchange={e=>updateField(field,(e.currentTarget as HTMLSelectElement).value==="true")}><option value="true">开启</option><option value="false">关闭</option></select>
          {:else if field.kind==="number"}
           <input id={`site-field-${currentSection}-${field.path.join('-')}`} type="number" value={Number.isFinite(field.value)?String(field.value):''} oninput={e=>updateField(field,(e.currentTarget as HTMLInputElement).value)}/>
          {:else if enumOptions(field)}
           <select id={`site-field-${currentSection}-${field.path.join('-')}`} value={String(field.value)} onchange={e=>updateField(field,(e.currentTarget as HTMLSelectElement).value)}>
            {#each enumOptions(field)||[] as option}<option value={option.value}>{option.label}</option>{/each}
           </select>
          {:else if field.kind==="lines"}
           <textarea id={`site-field-${currentSection}-${field.path.join('-')}`} rows="5" spellcheck="false" onblur={e=>updateField(field,(e.currentTarget as HTMLTextAreaElement).value)}>{(field.value as string[]).join('\n')}</textarea>
           <small class="field-help">每行一个内容。可以直接增加或删除行，不需要了解配置格式。</small>
          {:else if field.kind==="json"}
           <textarea id={`site-field-${currentSection}-${field.path.join('-')}`} rows="4" spellcheck="false" onblur={e=>updateField(field,(e.currentTarget as HTMLTextAreaElement).value)}>{toJson(field.value)}</textarea>
          {:else if typeof field.value==="string"&&field.value.length>130}
           <textarea id={`site-field-${currentSection}-${field.path.join('-')}`} rows="3" oninput={e=>updateField(field,(e.currentTarget as HTMLTextAreaElement).value)}>{field.value}</textarea>
          {:else}
           <input id={`site-field-${currentSection}-${field.path.join('-')}`} type="text" value={String(field.value??'')} oninput={e=>updateField(field,(e.currentTarget as HTMLInputElement).value)}/>
          {/if}
          {#if chineseHelp(currentSection,field.path,field.value)}<small class="field-help">{chineseHelp(currentSection,field.path,field.value)}</small>{/if}
          {#if showImagePreview(field)}<SiteSettingsImagePreview value={String(field.value??'')} label={fieldName(field)}/>{/if}
         </div>
        {/each}
       </div>
      </section>
     {/each}
    </div>
   {/if}
   <footer class="form-footer"><small>{dirty?"● 有未保存修改":savedLocally?"✓ 当前设备已有本机草稿":"当前配置来自实验构建"}</small><div class="form-tools"><button onclick={validate}>检查所有配置</button><button onclick={restoreLocal} disabled={!savedLocally}>恢复本机草稿</button><button class="primary" onclick={saveLocal}>保存草稿</button></div></footer>
  </main>
 </div>
 <p class="settings-footnote">未迁移配置：动态导航生成函数、图床/后台身份验证、音乐鉴权、复杂组件逻辑等继续保持现状；不支持用浏览器配置覆盖服务端密钥。此设置区不会自动修改正式站点。配置变更需要实验分支重新构建后生效。</p>
</section>

<style>
.settings-workspace{max-width:100%;min-width:0;display:grid;gap:.85rem;font-size:.84rem;overflow-x:clip;color:var(--text-color)}
.settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.2rem;border-radius:.9rem;min-width:0}
.settings-header>div:first-child{min-width:0;flex:1}
.settings-header h2{font-size:1.35rem;font-weight:790;line-height:1.4;margin:.2rem 0 .4rem}
.settings-header p,.form-heading p{line-height:1.6;color:var(--text-muted,#888);margin:0;overflow-wrap:anywhere}
.eyebrow{font-size:.65rem;letter-spacing:.13em;color:var(--primary);font-weight:750;text-transform:uppercase;overflow-wrap:anywhere}
.settings-actions,.form-tools{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}
.settings-workspace button{padding:.55rem .75rem;border:1px solid var(--line-divider);border-radius:.6rem;background:var(--card-bg);font-weight:650;min-height:2.45rem;cursor:pointer}
.settings-workspace button:hover{border-color:var(--primary)}
.settings-workspace button:disabled{opacity:.47;cursor:not-allowed}
.settings-workspace button.primary{background:var(--primary);color:white;border-color:var(--primary)}
.site-mode-notice{padding:.7rem .95rem;border-left:3px solid var(--primary);display:grid;gap:.3rem;line-height:1.6;overflow-wrap:anywhere}
.site-mode-notice span,.settings-footnote{font-size:.74rem;color:var(--text-muted,#888)}
.settings-feedback{border:1px solid var(--line-divider);border-radius:.65rem;padding:.7rem .85rem;overflow-wrap:anywhere}
.settings-feedback.error{border-color:#c44;color:#c44}
.settings-grid{display:grid;grid-template-columns:minmax(12rem,15rem) minmax(0,1fr);gap:.85rem;align-items:start;min-width:0}
.settings-groups{padding:.65rem;display:grid;gap:.3rem;min-width:0;border-radius:.9rem}
.sidebar-top{display:flex;justify-content:space-between;gap:.5rem;align-items:center;padding:.55rem;font-size:.8rem}
.sidebar-top small{font-size:.63rem;color:var(--text-muted,#888)}
.settings-groups button{display:grid;text-align:left;gap:.18rem;min-width:0;border-color:transparent;background:transparent}
.settings-groups button small{font-size:.67rem;font-weight:400;line-height:1.45;color:var(--text-muted,#888);overflow-wrap:anywhere}
.settings-groups button.active{background:color-mix(in srgb,var(--primary) 10%,var(--card-bg));color:var(--primary);border-color:color-mix(in srgb,var(--primary) 30%,transparent)}
.settings-form{padding:1rem;border-radius:.9rem;min-width:0;overflow:hidden}
.form-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:.65rem;padding-bottom:.85rem;margin-bottom:.85rem;border-bottom:1px solid var(--line-divider);min-width:0}
.form-heading h3{font-size:1.12rem;font-weight:750;margin:.2rem 0}
.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;min-width:0}
.field,.full-json{display:grid;gap:.3rem;min-width:0;align-content:start;font-size:.74rem;font-weight:650;overflow-wrap:anywhere}
.field.wide{grid-column:span 2}
.field input,.field textarea,.field select,.full-json textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box;border:1px solid var(--line-divider);border-radius:.5rem;background:var(--card-bg);color:inherit;padding:.58rem .7rem;font-size:.83rem;line-height:1.6;font-weight:400}
.field input:focus-visible,.field textarea:focus-visible,.field select:focus-visible,.full-json textarea:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.field textarea,.full-json textarea{resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.76rem}
.full-json textarea{min-height:28rem}
.full-json small{font-size:.67rem;font-weight:400;color:var(--text-muted,#888)}
.form-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.65rem;margin-top:1.15rem;padding-top:.85rem;border-top:1px solid var(--line-divider)}
.form-footer small{font-size:.72rem}
.settings-footnote{line-height:1.65;overflow-wrap:anywhere;margin:.25rem .35rem}
@media(max-width:900px){.settings-grid{grid-template-columns:minmax(0,1fr)}.settings-groups{display:flex;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:thin}.settings-groups>.sidebar-top{flex:0 0 8rem}.settings-groups button{min-width:9.4rem;max-width:11rem}.settings-groups button small{font-size:.65rem}.settings-header{flex-wrap:wrap}}
@media(max-width:620px){.settings-workspace{gap:.55rem}.settings-header{padding:.8rem}.settings-header h2{font-size:1.15rem}.settings-header .settings-actions{width:100%}.settings-actions button{flex:1;min-width:7rem}.settings-groups{padding:.38rem}.settings-form{padding:.68rem}.fields{grid-template-columns:minmax(0,1fr)}.field.wide{grid-column:span 1}.form-heading{flex-direction:column}.form-tools{width:100%;flex-wrap:wrap}.form-tools button{flex:1}.field input,.field select,.field textarea{font-size:16px}.settings-footnote{padding:.2rem}}

/* Semantic groups replace the former flat dump of internal field names. */
.logical-groups{display:grid;gap:1.1rem;min-width:0}
.logical-group{border:1px solid var(--line-divider);border-radius:.75rem;padding:.9rem;min-width:0;background:color-mix(in srgb,var(--card-bg) 94%,var(--primary) 2%)}
.logical-group-heading{padding:0 0 .8rem;margin-bottom:.85rem;border-bottom:1px solid var(--line-divider)}
.logical-group-heading h4{margin:0 0 .25rem;font-size:.94rem;font-weight:740}
.logical-group-heading p{margin:0;font-size:.74rem;line-height:1.65;color:var(--text-muted,#888)}
.category-heading{display:grid;gap:.13rem;margin:.48rem .3rem .1rem;padding:.6rem .35rem .22rem;border-top:1px solid var(--line-divider)}
.category-heading strong{font-size:.75rem;font-weight:740;color:var(--primary)}
.category-heading small{font-size:.66rem;color:var(--text-muted,#888)}
.settings-groups button{min-height:0}
.field-label{font-size:.8rem;font-weight:730;line-height:1.45;overflow-wrap:anywhere}
.field-location{font-size:.65rem;font-weight:400;color:var(--text-muted,#888);line-height:1.35}
.field-help{font-size:.68rem;font-weight:400;line-height:1.6;color:var(--text-muted,#888)}
.settings-form .field{display:flex;flex-direction:column;align-items:stretch;gap:.34rem;padding:.7rem;border:1px solid var(--line-divider);border-radius:.65rem;background:var(--card-bg)}
.settings-form .field select,.settings-form .field input,.settings-form .field textarea{margin-top:.15rem}
@media(min-width:901px){.settings-groups{position:sticky;top:1rem;max-height:calc(100vh - 2rem);overflow:auto}}
@media(max-width:900px){.category-heading{min-width:6.5rem;max-width:7.5rem;flex:0 0 auto;border-top:0;border-left:1px solid var(--line-divider);padding:.38rem}.category-heading small{display:none}.settings-groups>.sidebar-top{flex:0 0 7rem}.settings-groups button{min-width:8.5rem;max-width:10rem}}
@media(max-width:620px){.logical-group{padding:.6rem}.settings-form .field{padding:.6rem}.category-heading{min-width:5rem}.settings-groups button{min-width:8rem}}
</style>
