<script lang="ts">
import {onMount} from "svelte";
import bundledSettings from "@/data/site-settings.json";
import {assertSiteSettings} from "@/utils/settings/managed-config";
import type {GitHubAdminSession} from "@/utils/admin/github-session";
import {getGitHubRepoConfigFromSession} from "@/utils/admin/github-session";
import {fetchRepoFile,saveRepoFile} from "@/utils/write/github";
import SiteSettingsImagePreview from "./SiteSettingsImagePreview.svelte";
import SiteSettingsListEditor from "./SiteSettingsListEditor.svelte";
import {isManagedList} from "@/utils/settings/settings-list-schema";
import {numberPresentation,percentageText} from "@/utils/settings/settings-controls";
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
 friendsConfig:{title:"友情链接",hint:"友链头像、站点名称、网址、订阅和排序；支持增删。"},
 friendApplicationConfig:{title:"友链申请说明",hint:"本站友链资料、申请邮箱和可增删的申请注意事项。"},
 friendsPageConfig:{title:"友链页面",hint:"友链页介绍、申请说明及随机排序开关。"},
 friendCircleConfig:{title:"友链朋友圈",hint:"友链订阅聚合、更新间隔与缓存设置。"},
 sponsorConfig:{title:"赞助与支持",hint:"赞助方式、二维码和赞助者列表。"},
 booknavPageConfig:{title:"书签页面",hint:"书签导航页面名称及图标自动获取。"},
 booknavConfig:{title:"书签导航",hint:"书签分类和分类内的网址，可增删和排序。"},
 musicPlayerConfig:{title:"音乐播放器",hint:"歌单平台、播放设置、本地歌曲与封面。"},
 navCustomLinks:{title:"自定义导航",hint:"管理导航栏「链接」菜单中的项目和子菜单。"},

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
 if(path.length===0)(candidate.sections as Record<string,unknown>)[currentSection]=value;
 else{
  let object=candidate.sections[currentSection] as Record<string,unknown>;
  for(const key of path.slice(0,-1))object=object[key] as Record<string,unknown>;
  object[path.at(-1)!]=value;
 }
 draft=candidate;dirty=true;error="";
 // Validate only on save or after leaving JSON mode: partially typed URLs and
 // incomplete numbers must not force the text cursor back to the previous value.
 if(editorMode!=="json")jsonText=toJson(sectionValue());
}
type EditableField={path:string[];value:unknown;kind:"string"|"number"|"boolean"|"json"|"lines"|"list"};
function fieldsForCurrent(config:Draft,section:keyof Draft["sections"]):EditableField[]{
 const fields:EditableField[]=[];
 const push=(path:string[],value:unknown)=>{
  if(typeof value==="boolean"||typeof value==="string"||typeof value==="number"){
   fields.push({path,value,kind:typeof value});
  }else fields.push({path,value,kind:"json"});
 };
 const walk=(value:unknown,path:string[]=[],depth=0)=>{
  if(isManagedList(section,path,value)){fields.push({path,value,kind:"list"});return;}
  if(depth>9||fields.length>550){push(path,value);return;}
  if(Array.isArray(value)){
   if(['keywords','categoryOrder','excludedLangs','noReferrerDomains','playerUrl','feedPaths','apiUrl','fallbackApiUrl','apis','fallbackApis'].includes(path.at(-1)||'') && value.every(entry=>typeof entry==='string')){
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
 return fieldsForCurrent(config,section).filter(field=>field.path.length===0?keys.includes("$root"):keys.includes(field.path[0]));
}
function fieldName(field:EditableField):string{
 return field.path.length===0?(metadata[currentSection]?.title||"列表管理"):chineseLabel(currentSection,field.path);
}
function fieldContext(field:EditableField):string{
 const all=field.path.slice(0,-1);
 if(all.length<2)return '';
 return all.map((segment,index)=>chineseLabel(currentSection,all.slice(0,index+1))).join(' · ');
}
function enumOptions(field:EditableField):{value:string;label:string}[]|null{
 const path=currentSection+'.'+field.path.join('.');
 const map:Record<string,{value:string;label:string}[]>={
  'musicPlayerConfig.mode':[{value:'meting',label:'在线歌单'},{value:'local',label:'本地歌曲'}],
  'musicPlayerConfig.playMode':[{value:'list',label:'列表循环'},{value:'one',label:'单曲循环'},{value:'random',label:'随机播放'}],
  'musicPlayerConfig.meting.server':[{value:'netease',label:'网易云音乐'},{value:'tencent',label:'QQ 音乐'},{value:'kugou',label:'酷狗音乐'},{value:'xiami',label:'虾米音乐'},{value:'baidu',label:'百度音乐'}],
  'musicPlayerConfig.meting.type':[{value:'playlist',label:'歌单'},{value:'song',label:'单曲'},{value:'album',label:'专辑'},{value:'search',label:'搜索'},{value:'artist',label:'歌手'}],
  'siteConfig.post.rehypeCallouts.theme':[{value:'github',label:'GitHub 风格'},{value:'obsidian',label:'Obsidian 风格'},{value:'vitepress',label:'文档风格'}],
  'siteConfig.post.immersiveReading.tocPosition':[{value:'left',label:'左侧显示'},{value:'right',label:'右侧显示'}],
  'siteConfig.lang':[{value:'zh_CN',label:'简体中文'},{value:'en',label:'English'},{value:'ja',label:'日本語'}],
  'backgroundWallpaper.common.carousel.transitionEffect':[{value:'fade',label:'淡入淡出'},{value:'zoom',label:'缩放过渡'},{value:'slide',label:'滑动切换'},{value:'kenburns',label:'缓慢平移'}],
  'backgroundWallpaper.banner.postInfo.mode':[{value:'description',label:'显示文章摘要'},{value:'meta',label:'显示发布日期等信息'}],
  'backgroundWallpaper.banner.navbar.transparentMode':[{value:'semi',label:'半透明'},{value:'semifull',label:'随壁纸变化'},{value:'none',label:'不透明'}],
  'backgroundWallpaper.fullscreen.navbar.transparentMode':[{value:'semi',label:'半透明'},{value:'semifull',label:'随壁纸变化'},{value:'none',label:'不透明'}],
  'siteConfig.postListLayout.tagsBottomStyle':[{value:'chip',label:'标签按钮'},{value:'inline',label:'简洁文字'}],
  'siteConfig.bangumi.mode':[{value:'static',label:'构建时同步'},{value:'dynamic',label:'访问时加载'}],
  'siteConfig.feed.contentMode':[{value:'full',label:'完整内容'},{value:'summary',label:'仅摘要'}],
  'siteConfig.postListLayout.tagsPosition':[{value:'bottom',label:'卡片下方'},{value:'top',label:'卡片上方'}],
  'siteConfig.postListLayout.tagsBottomStyle':[{value:'chip',label:'标签按钮'},{value:'inline',label:'行内文字'}],
  'backgroundWallpaper.common.playerMode':[{value:'random',label:'随机切换'},{value:'list',label:'按顺序切换'}],
  'backgroundWallpaper.fullscreen.layout':[{value:'classic',label:'经典模式'},{value:'hero',label:'沉浸式横幅'}],
  'sidebarLayoutConfig.position':[{value:'both',label:'左右双侧栏'},{value:'left',label:'仅左侧'},{value:'right',label:'仅右侧'}],
  'sidebarLayoutConfig.tabletSidebar':[{value:'left',label:'平板左侧栏'},{value:'right',label:'平板右侧栏'}],
  'siteConfig.themeColor.defaultMode':[{value:'system',label:'跟随系统'},{value:'light',label:'浅色模式'},{value:'dark',label:'深色模式'}],
  'siteConfig.navbar.logo.type':[{value:'image',label:'图片标志'},{value:'icon',label:'图标标志'},{value:'url',label:'外链图标'}],
  'siteConfig.navbar.menuAlign':[{value:'left',label:'左对齐'},{value:'center',label:'居中'}],
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
  if(!parsed||parsed.schemaVersion!==1||!parsed.sections||typeof parsed.sections!=="object")throw Error("草稿格式不正确");
  // Earlier drafts only contain the original 14 groups.
  const merged=structuredClone(initial);
  for(const [key,value] of Object.entries(parsed.sections)){
   if(Object.hasOwn(merged.sections,key))(merged.sections as Record<string,unknown>)[key]=value;
  }
  const migrated=Object.keys(merged.sections).filter(key=>!Object.hasOwn(parsed.sections,key)).length;
  assertSiteSettings(merged);
  draft=merged;dirty=false;savedLocally=true;jsonText=toJson(sectionValue());
  setMessage(migrated?"已恢复旧草稿，并自动补全 "+migrated+" 组新设置；原有内容没有丢失。":"已从当前浏览器恢复站点设置草稿。");
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
  <div><p class="eyebrow">站点配置中心</p><h2>站点设置</h2><p>按用途选择设置。列表可直接新增、删除、排序，点开单条再编辑；图片地址输入后自动预览。</p></div>
  <div class="settings-actions"><button type="button" onclick={saveLocal} disabled={busy}>保存本机草稿</button><button type="button" onclick={exportJson} disabled={busy}>导出完整 JSON</button>{#if canCommit()}<button class="primary" type="button" onclick={publishExperiment} disabled={busy}>{busy?"提交中…":"提交实验分支"}</button>{/if}</div>
 </header>
 <div class="site-mode-notice card-base" role="note"><strong>生效方式：构建时更新</strong><span>站点访客无需额外获取设置文件。后台编辑不会自动影响正式站点；密码、令牌、运行函数和部分尚未迁入 JSON 的高级配置仍由原来的服务端或 TypeScript 文件管理。</span></div>
 {#if error}<p class="settings-feedback error" role="alert">{error}</p>{/if}
 {#if message}<p class="settings-feedback" role="status">{message}</p>{/if}
 <nav class="settings-topic-nav" aria-label="站点设置主要分类">
  {#each sectionCategories as category}
   {@const active=category.sections.some(name=>name===currentSection)}
   <button type="button" class:active aria-current={active?'page':undefined} onclick={()=>changeSection(category.sections[0] as keyof Draft['sections'])}>
    <strong>{category.title}</strong><small>{category.description}</small>
   </button>
  {/each}
 </nav>
 <nav class="settings-subnav" aria-label="当前分类的设置">
  {#each sectionCategories.filter(category=>category.sections.some(name=>name===currentSection)) as category}
   {#each category.sections as name}
    <button type="button" class:active={name===currentSection} aria-current={name===currentSection?'page':undefined} onclick={()=>changeSection(name as keyof Draft['sections'])}>
     {metadata[name]?.title||'其他设置'}
    </button>
   {/each}
  {/each}
 </nav>
 <div class="settings-grid">
  <main class="settings-form card-base">
   <header class="form-heading"><div><span class="eyebrow">可视化站点设置</span><h3>{metadata[currentSection]?.title||'站点功能'}</h3><p>{metadata[currentSection]?.hint}</p></div><div class="form-tools"><button type="button" onclick={toggleAdvanced}>{advanced?"返回图形化设置":"高级：编辑源码数据"}</button><button type="button" onclick={resetSection}>恢复本组默认值</button></div></header>
   {#if advanced}
    <label class="full-json"><span>高级模式：此分类的完整配置数据</span><textarea spellcheck="false" rows="22" bind:value={jsonText}></textarea><small>高级模式面向熟悉配置结构的用户；点击「检查并应用」后才会更新草稿。</small></label>
    <button class="primary" type="button" onclick={applyJson}>检查并应用此分类</button>
   {:else}
    <div class="logical-groups">
     {#each sectionGroups(currentSection,sectionValue()) as group, groupIndex (group.id)}
      <details class="logical-group" open={groupIndex===0}>
       <summary class="logical-group-heading"><h4>{group.title}</h4><span class="group-count">点击展开 / 收起</span></summary>
       <div class="fields">
        {#each fieldsForGroup(draft,currentSection,group.keys) as field (field.path.join('.'))}
         <div class="field" class:toggle-row={field.kind==="boolean"} class:wide={field.kind==="json"||field.kind==="lines"||field.kind==="list"||showImagePreview(field)||(typeof field.value==="string"&&field.value.length>130)}>
          {#if field.kind!=="boolean"&&field.kind!=="list"}
           {#if enumOptions(field)&&(enumOptions(field)||[]).length<=4}
            <span class="field-label">{fieldName(field)}</span>
           {:else}
            <label for={`site-field-${currentSection}-${field.path.join('-')}`} class="field-label">{fieldName(field)}</label>
           {/if}
           {#if fieldContext(field)}<small class="field-location">{fieldContext(field)}</small>{/if}
          {/if}
          {#if field.kind==="list"}
           <SiteSettingsListEditor section={currentSection} path={field.path} value={field.value as Record<string,unknown>[]} onChange={items=>cloneAndSet(field.path,items)}/>
          {:else if field.kind==="boolean"}
           <label class="setting-switch-row" for={`site-field-${currentSection}-${field.path.join('-')}`}>
            <span class="switch-copy"><strong>{fieldName(field)}</strong></span>
            <input class="setting-switch-input" id={`site-field-${currentSection}-${field.path.join('-')}`} type="checkbox" role="switch" checked={field.value===true} onchange={e=>updateField(field,(e.currentTarget as HTMLInputElement).checked)} />
            <span class="setting-switch-track" aria-hidden="true"><span></span></span>
            <small class="switch-status">{field.value===true?"已开启":"已关闭"}</small>
           </label>
          {:else if field.kind==="number"}
           {@const numberMeta=numberPresentation(currentSection,field.path,Number(field.value))}
           <div class="number-editor" class:with-slider={numberMeta.slider}>
            {#if currentSection==="siteConfig"&&field.path.join(".")==="themeColor.hue"}
             <span class="theme-color-swatch" style={`background:hsl(${Number(field.value)} 70% 55%)`} role="img" aria-label="当前主题颜色预览"></span>
            {/if}
            {#if numberMeta.slider}
             <input class="number-range" type="range" min={numberMeta.min??0} max={numberMeta.max??100} step={numberMeta.step} value={Number(field.value)} aria-label={fieldName(field)+"滑杆"} oninput={e=>updateField(field,(e.currentTarget as HTMLInputElement).value)} />
            {/if}
            <div class="number-entry">
             <input id={`site-field-${currentSection}-${field.path.join('-')}`} type="number" min={numberMeta.min} max={numberMeta.max} step={numberMeta.step} value={Number.isFinite(field.value)?String(field.value):''} oninput={e=>updateField(field,(e.currentTarget as HTMLInputElement).value)} />
             {#if numberMeta.unit}<span class="number-unit">{numberMeta.unit}</span>{/if}
            </div>
            {#if numberMeta.slider}<output class="range-output">{percentageText(numberMeta,Number(field.value))}</output>{/if}
           </div>
           {#if numberMeta.help}<small class="field-help">{numberMeta.help}</small>{/if}
          {:else if enumOptions(field)}
           {#if (enumOptions(field)||[]).length<=4}
            <div class="choice-row" role="group" aria-label={fieldName(field)}>
             {#each enumOptions(field)||[] as option}
              <button type="button" class:chosen={String(field.value)===option.value} aria-pressed={String(field.value)===option.value} onclick={()=>updateField(field,option.value)}>{option.label}</button>
             {/each}
            </div>
           {:else}
            <select id={`site-field-${currentSection}-${field.path.join('-')}`} value={String(field.value)} onchange={e=>updateField(field,(e.currentTarget as HTMLSelectElement).value)}>
             {#each enumOptions(field)||[] as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
           {/if}
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
          {#if field.kind!=="boolean"&&field.kind!=="number"&&chineseHelp(currentSection,field.path,field.value)}<small class="field-help">{chineseHelp(currentSection,field.path,field.value)}</small>{/if}
          {#if showImagePreview(field)}<SiteSettingsImagePreview value={String(field.value??'')} label={fieldName(field)}/>{/if}
         </div>
        {/each}
       </div>
      </details>
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

/* Compact disclosure-based settings layout, inspired by the local manager. */
.settings-header{padding:.82rem 1rem;gap:.7rem}.settings-header h2{font-size:1.13rem;margin:.1rem 0 .2rem}
.settings-header p{font-size:.74rem}.site-mode-notice{padding:.45rem .7rem;font-size:.7rem;gap:.1rem}
.settings-grid{grid-template-columns:minmax(10rem,12.5rem) minmax(0,1fr);gap:.6rem}
.settings-groups{padding:.38rem;gap:.1rem}.settings-groups button{padding:.36rem .55rem;min-height:2.05rem;gap:0}
.settings-groups button strong{font-size:.75rem}.settings-groups button small{display:none}
.sidebar-top{padding:.35rem .55rem}.sidebar-top small{font-size:.61rem}
.category-heading{margin:.38rem .15rem .06rem;padding:.42rem .35rem .18rem}
.category-heading strong{font-size:.68rem}.category-heading small{display:none}
.settings-form{padding:.66rem .72rem}.form-heading{padding-bottom:.55rem;margin-bottom:.52rem}
.form-heading h3{font-size:1rem}.form-heading p{font-size:.71rem}
.logical-groups{gap:.42rem}.logical-group{padding:.35rem .52rem;border-radius:.6rem;background:var(--card-bg)}
.logical-group-heading{cursor:pointer;display:flex;align-items:center;gap:.5rem;padding:.24rem .2rem;margin:0;border-bottom:0;list-style:none;min-height:2.05rem}
.logical-group-heading::-webkit-details-marker{display:none}
.logical-group-heading h4{font-size:.81rem;margin:0;flex:1}
.logical-group-heading:before{content:'▸';color:var(--primary);font-size:.75rem}
.logical-group[open]>.logical-group-heading:before{content:'▾'}
.group-count{font-size:.64rem;color:var(--text-muted,#888);white-space:nowrap}
.logical-group>.fields{padding:.45rem .15rem .28rem;border-top:1px solid var(--line-divider)}
.fields{gap:.42rem .65rem}
.settings-form .field{padding:.15rem .08rem;border:none;background:transparent;border-radius:0;gap:.19rem}
.field-label{font-size:.74rem;font-weight:640}
.field-location{display:none}.field-help{font-size:.65rem;line-height:1.35;color:var(--text-muted,#888)}
.settings-form .field input,.settings-form .field select,.settings-form .field textarea{padding:.37rem .52rem;border-radius:.4rem;font-size:.78rem;min-height:2.1rem;margin-top:0}
.settings-form .field input[type=number]{max-width:220px}
.form-footer{margin-top:.65rem;padding-top:.6rem}.form-tools{gap:.25rem}
.settings-workspace button{min-height:2.05rem;padding:.36rem .55rem;border-radius:.43rem;font-size:.72rem}
@media(min-width:901px){.settings-groups{max-height:calc(100vh - 1rem)}}
@media(max-width:900px){.settings-grid{grid-template-columns:minmax(0,1fr)}.settings-groups button{min-width:7.6rem;max-width:9rem}.settings-form{padding:.62rem}.settings-groups .category-heading{min-width:4.4rem;padding:.38rem .24rem}.settings-header{padding:.65rem .8rem}}
@media(max-width:620px){.logical-group{padding:.3rem .4rem}.settings-form .field{padding:.15rem .06rem}.settings-form .field input,.settings-form .field select,.settings-form .field textarea{font-size:16px}.group-count{font-size:.6rem}}
/* Direct switches, compact segmented choices and measured numeric controls. */
.settings-form .field.toggle-row{border:1px solid var(--line-divider);border-radius:.55rem;background:color-mix(in srgb,var(--card-bg) 98%,var(--primary) 2%);padding:.25rem .52rem;min-height:2.5rem;display:flex;justify-content:center}
.setting-switch-row{display:flex;align-items:center;gap:.5rem;cursor:pointer;width:100%;min-height:2.15rem;font-size:.77rem;user-select:none}
.switch-copy{flex:1;min-width:0;line-height:1.4;font-weight:600}
.switch-copy strong{font-size:.76rem;font-weight:650}
.settings-form .field .setting-switch-input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
.setting-switch-track{flex:none;width:2.35rem;height:1.35rem;border-radius:99px;background:color-mix(in srgb,var(--text-muted,#888) 45%,transparent);position:relative;transition:background .15s ease}
.setting-switch-track>span{display:block;width:1.03rem;height:1.03rem;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002;position:absolute;top:.16rem;left:.16rem;transition:transform .15s ease}
.setting-switch-input:checked+.setting-switch-track{background:var(--primary)}
.setting-switch-input:checked+.setting-switch-track>span{transform:translateX(1rem)}
.setting-switch-input:focus-visible+.setting-switch-track{outline:3px solid var(--primary);outline-offset:3px}
.switch-status{font-size:.65rem;color:var(--text-muted,#888);min-width:2.45rem;text-align:right}
.choice-row{display:flex;flex-wrap:wrap;gap:.3rem;min-width:0}
.settings-form .choice-row button{min-height:1.95rem;padding:.32rem .55rem;border-radius:.42rem;font-size:.72rem;font-weight:520;background:transparent}
.settings-form .choice-row button.chosen{background:color-mix(in srgb,var(--primary) 12%,var(--card-bg));color:var(--primary);border-color:var(--primary);font-weight:740}
.settings-form .choice-row button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.number-editor{display:flex;align-items:center;gap:.5rem;min-width:0;flex-wrap:wrap}
.number-editor.with-slider{flex-wrap:nowrap}
.settings-form .field .number-entry{display:flex;align-items:center;gap:.15rem;min-width:4.8rem;max-width:11rem;width:100%;position:relative}
.settings-form .field .number-entry input{width:100%;padding-right:2rem}
.settings-form .field .number-entry:has(.number-unit) input{padding-right:3rem}
.number-unit{position:absolute;right:.45rem;font-size:.64rem;color:var(--text-muted,#888);white-space:nowrap;pointer-events:none}
.settings-form .field .number-range{flex:1;min-width:65px;width:100%;height:1.1rem;accent-color:var(--primary);padding:0;border:none;background:none;cursor:pointer}
.range-output{min-width:2rem;font-size:.7rem;color:var(--primary);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
@media(max-width:620px){.number-editor.with-slider{gap:.3rem}.settings-form .field .number-entry{max-width:6.2rem}.switch-status{font-size:.62rem}}

.theme-color-swatch{width:1.3rem;height:1.3rem;flex-shrink:0;display:inline-block;border:2px solid var(--line-divider);border-radius:50%;box-shadow:0 1px 3px #0002}

/* Task-focused primary navigation: a single responsive workspace, not a 22-row sidebar. */
.settings-workspace .settings-topic-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem;min-width:0}
.settings-workspace .settings-topic-nav button{display:grid;gap:.14rem;text-align:left;padding:.58rem .76rem;border:1px solid var(--line-divider);border-radius:.55rem;background:var(--card-bg);min-width:0;min-height:3.15rem}
.settings-topic-nav button strong{font-size:.78rem;font-weight:710}
.settings-topic-nav button small{font-size:.65rem;font-weight:400;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:var(--text-muted,#888)}
.settings-topic-nav button.active{background:color-mix(in srgb,var(--primary) 12%,var(--card-bg));border-color:var(--primary);color:var(--primary)}
.settings-workspace .settings-subnav{display:flex;align-items:center;flex-wrap:wrap;gap:.28rem;padding:.15rem 0 .38rem;border-bottom:1px solid var(--line-divider)}
.settings-workspace .settings-subnav button{min-height:1.85rem;padding:.28rem .6rem;font-size:.72rem;background:transparent;border-color:transparent}
.settings-workspace .settings-subnav button.active{color:var(--primary);background:color-mix(in srgb,var(--primary) 11%,var(--card-bg));border-color:color-mix(in srgb,var(--primary) 35%,transparent)}
.settings-workspace .settings-grid{display:block;min-width:0}
.settings-workspace .settings-form{max-width:100%;width:100%;min-width:0}
@media(min-width:1100px){.settings-workspace .settings-topic-nav{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:650px){.settings-workspace .settings-topic-nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:.3rem}
 .settings-workspace .settings-topic-nav button{padding:.42rem .55rem;min-height:2.9rem}
 .settings-topic-nav button strong{font-size:.74rem}
 .settings-topic-nav button small{font-size:.61rem}
 .settings-workspace .settings-subnav{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:.4rem}
 .settings-workspace .settings-subnav button{flex-shrink:0;white-space:nowrap}
}
</style>
