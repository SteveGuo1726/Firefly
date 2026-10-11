/** Static settings collection safeguards; no server or imagebed writes. */
const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function bad(s:string):never{throw new Error(s)}
function safeURL(v:unknown,relative=false):boolean{
 if(typeof v!=='string'||!v.trim()||v.length>2048)return false;
 const x=v.trim();
 if(relative&&((x.startsWith('/')&&!x.startsWith('//'))||x.startsWith('#')||x.startsWith('mailto:')||x.startsWith('tel:')))return true;
 try{const u=new URL(x);return (u.protocol==='https:'||u.protocol==='http:')&&Boolean(u.hostname)}catch{return false}
}
function inspect(value:unknown,where:string,depth=0):void{
 if(depth>15)bad(where+'嵌套层级过深');
 if(Array.isArray(value)){
  if(value.length>300)bad(where+'最多允许 300 项');
  for(let i=0;i<value.length;i++)inspect(value[i],where+'第'+(i+1)+'项',depth+1);
 }else if(isObject(value)){
  for(const [key,val] of Object.entries(value)){
   if(['__proto__','constructor','prototype'].includes(key))bad(where+'包含非法属性');
   inspect(val,where+'.'+key,depth+1);
  }
 }else if(typeof value==='number'&&!Number.isFinite(value))bad(where+'必须是有效数字');
 else if(typeof value==='string'&&value.length>12000)bad(where+'内容过长');
}
function links(items:unknown[],label:string,urlKey:string,nameKey:string,relative:boolean,depth=0):void{
 if(depth>3)bad('导航子菜单最多支持三层');
 for(let i=0;i<items.length;i++){
  const value=items[i],here=label+'第'+(i+1)+'项';
  if(!isObject(value))bad(here+'格式不正确');
  if(typeof value[nameKey]!=='string'||!String(value[nameKey]).trim())bad(here+'缺少名称');
  if(!safeURL(value[urlKey],relative))bad(here+'网址无效，请填写 http(s) 链接或站内地址');
  if(value.enabled!==undefined&&typeof value.enabled!=='boolean')bad(here+'启用状态应为开关');
  if(value.weight!==undefined&&(typeof value.weight!=='number'||!Number.isFinite(value.weight)))bad(here+'权重必须是数字');
  if(value.children!==undefined){
   if(!Array.isArray(value.children))bad(here+'的子菜单必须为列表');
   links(value.children,here+'的子菜单','url','name',true,depth+1);
  }
 }
}
function getList(o:Record<string,unknown>,key:string,label:string):unknown[]{
 const v=o[key];if(!Array.isArray(v))bad(label+'格式不正确');
 if(v.length>300)bad(label+'太长');
 return v as unknown[];
}
export function assertSiteSettingsCollections(sections:Record<string,unknown>):void{
 inspect(sections,'设置');
 if(sections.friendsConfig!==undefined){
  if(!Array.isArray(sections.friendsConfig))bad('友链数据应为列表');
  links(sections.friendsConfig,'友链','siteurl','title',false);
 }
 if(sections.friendApplicationConfig!==undefined){
  const app=sections.friendApplicationConfig;
  if(!isObject(app)||!isObject(app.site))bad('友链申请信息格式不正确');
  const site=app.site;
  if(typeof site.name!=='string'||!site.name.trim())bad('友链申请信息需要填写本站名称');
  if(!safeURL(site.url))bad('友链申请信息的本站网址无效');
  if(typeof site.avatar!=='string')bad('友链申请头像需要填写图片路径或地址');
  if(typeof site.email!=='string'||!/^\S+@\S+\.\S+$/.test(site.email))bad('友链申请联系邮箱格式不正确');
  const notes=getList(app,'notes','友链申请注意事项');
  for(const [i,note] of notes.entries()){
   if(!isObject(note)||typeof note.title!=='string'||!note.title.trim()||
      typeof note.content!=='string'||!note.content.trim())bad('友链申请第'+(i+1)+'条注意事项需要标题和正文');
  }
 }
 if(sections.booknavConfig!==undefined){
  if(!Array.isArray(sections.booknavConfig))bad('书签分组应为列表');
  const ids=new Set<string>();
  for(const [i,g] of sections.booknavConfig.entries()){
   const here='书签第'+(i+1)+'组';
   if(!isObject(g))bad(here+'无效');
   if(typeof g.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(g.id))bad(here+'标识只允许字母、数字、短横线或下划线');
   if(ids.has(g.id))bad('书签分组标识重复：'+g.id);
   ids.add(g.id);
   if(typeof g.name!=='string'||!g.name.trim())bad(here+'缺少名称');
   if(!Array.isArray(g.items))bad(here+'没有正确的书签列表');
   links(g.items,here,'url','title',true);
  }
 }
 if(sections.navCustomLinks!==undefined){
  if(!Array.isArray(sections.navCustomLinks))bad('导航链接应为列表');
  links(sections.navCustomLinks,'导航链接','url','name',true);
 }
 if(sections.sponsorConfig!==undefined){
  const sponsor=sections.sponsorConfig;
  if(!isObject(sponsor))bad('赞助设置格式错误');
  for(const [key,label] of [['methods','赞助方式'],['sponsors','赞助者']] as const){
   const list=getList(sponsor,key,label);
   for(const [i,item] of list.entries()){
    if(!isObject(item)||typeof item.name!=='string'||!item.name.trim())bad(label+'第'+(i+1)+'项缺少名称');
    if(key==='methods'&&typeof item.enabled!=='boolean')bad(label+'第'+(i+1)+'项必须有启用开关');
    if(item.link!==undefined&&item.link!==''&&!safeURL(item.link,true))bad(label+'第'+(i+1)+'项的链接无效');
   }
  }
 }
 if(isObject(sections.profileConfig)&&sections.profileConfig.links!==undefined){
  links(getList(sections.profileConfig,'links','社交链接'),'社交链接','url','name',true);
 }
 const music=sections.musicPlayerConfig;
 if(isObject(music)&&isObject(music.local)&&music.local.playlist!==undefined){
  for(const [i,t] of getList(music.local,'playlist','歌曲列表').entries()){
   if(!isObject(t)||typeof t.name!=='string'||!t.name.trim())bad('第'+(i+1)+'首歌曲缺少名称');
   if(!safeURL(t.url,true))bad('第'+(i+1)+'首歌曲的音频地址无效');
  }
 }
}
