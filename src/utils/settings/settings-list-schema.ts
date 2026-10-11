/** Explicit list schemas inspired by Firefly's local config manager.
 * All of these are STATIC build-time data, never direct imagebed writes.
 */
export type ListDefinition={title:string;help:string;itemLabel:string;fields:{key:string;title:string;hint?:string;kind?:'text'|'textarea'|'number'|'boolean'|'lines'|'image'|'json'}[];create:()=>Record<string,unknown>;orderByWeight?:boolean};
export const listDefinitions:Record<string,ListDefinition>={
 friendsConfig:{title:'友情链接',help:'添加、删除、调整友链。点击卡片可编辑站点名称、头像、描述、链接和订阅信息；排序会同步友链权重。',itemLabel:'友链',orderByWeight:true,fields:[
  {key:'title',title:'站点名称'},{key:'siteurl',title:'网站链接'},{key:'imgurl',title:'站点头像',kind:'image'},{key:'desc',title:'站点介绍',kind:'textarea'},{key:'tags',title:'分类标签',kind:'lines',hint:'每行一个标签'},{key:'enabled',title:'在友链页显示',kind:'boolean'},{key:'weight',title:'排序权重',kind:'number',hint:'数值越大越靠前，拖动排序也会自动更新'},{key:'fetchFeed',title:'订阅站点动态',kind:'boolean'},{key:'feedurl',title:'RSS / Atom 订阅地址',hint:'留空会尝试自动发现订阅地址'}],
  create:()=>({title:'新友链',imgurl:'',desc:'',siteurl:'https://example.com',fetchFeed:false,tags:[],weight:0,enabled:false})},
 'profileConfig.links':{title:'个人社交链接',help:'侧栏资料卡中的 GitHub、RSS、邮箱等快捷入口。',itemLabel:'社交链接',fields:[
  {key:'name',title:'显示名称'},{key:'url',title:'跳转链接'},{key:'icon',title:'图标名称或图片'},{key:'showName',title:'显示名称文字',kind:'boolean'}],create:()=>({name:'新社交链接',icon:'material-symbols:link',url:'https://example.com',showName:true})},
 'sponsorConfig.methods':{title:'赞助方式',help:'管理支付宝、微信或第三方支持方式。每种方式都可独立启用或关闭。',itemLabel:'赞助方式',fields:[
  {key:'name',title:'方式名称'},{key:'icon',title:'方式图标'},{key:'qrCode',title:'收款码图片',kind:'image'},{key:'link',title:'跳转链接'},{key:'description',title:'使用说明',kind:'textarea'},{key:'enabled',title:'对访客显示',kind:'boolean'}],create:()=>({name:'新赞助方式',icon:'',qrCode:'',link:'',description:'',enabled:false})},
 'sponsorConfig.sponsors':{title:'赞助者名单',help:'记录并展示赞助者。留空头像可使用默认头像；这不会处理真实付款。',itemLabel:'赞助者',fields:[
  {key:'name',title:'赞助者名称'},{key:'avatar',title:'头像图片',kind:'image'},{key:'amount',title:'金额或留言'},{key:'date',title:'支持日期'}],create:()=>({name:'匿名',avatar:'',amount:'',date:new Date().toISOString().slice(0,10)})},
 booknavConfig:{title:'书签分类',help:'创建书签分组，再在每个分组内管理网址；上下移动会同步书签权重。',itemLabel:'书签分类',orderByWeight:true,fields:[
  {key:'name',title:'分组名称'},{key:'id',title:'分组标识',hint:'用于跳转锚点，不要与其他分组重复'},{key:'icon',title:'分组图标'},{key:'desc',title:'分组介绍'},{key:'weight',title:'分组排序权重',kind:'number'},{key:'enabled',title:'显示分组',kind:'boolean'}],
  create:()=>({id:'new-group-'+Date.now().toString(36),name:'新书签分类',icon:'material-symbols:bookmark',desc:'',weight:0,enabled:true,items:[]})},
 'booknavConfig.items':{title:'分类内的网址',help:'管理此分类下的网址、图标和简介。',itemLabel:'书签',orderByWeight:true,fields:[
  {key:'title',title:'网站名称'},{key:'url',title:'网址'},{key:'desc',title:'网址介绍'},{key:'icon',title:'网站图标或图片'},{key:'weight',title:'排序权重',kind:'number'},{key:'enabled',title:'显示此网址',kind:'boolean'}],
  create:()=>({title:'新书签',url:'https://example.com',desc:'',icon:'',weight:0,enabled:true})},
 'musicPlayerConfig.local.playlist':{title:'本地音乐列表',help:'仅使用本地播放器模式时生效；曲目地址可以是网站内的音频文件或公开网络链接。',itemLabel:'曲目',fields:[
  {key:'name',title:'歌曲名称'},{key:'artist',title:'歌手或作者'},{key:'url',title:'音频文件地址'},{key:'cover',title:'专辑封面',kind:'image'},{key:'lrc',title:'歌词内容',kind:'textarea'}],
  create:()=>({name:'新歌曲',artist:'',url:'/assets/music/song.mp3',cover:'',lrc:''})},
 navCustomLinks:{title:'自定义导航链接',help:'主导航栏「链接」菜单内的可编辑链接。其他动态菜单和页面开关联动保持由原代码管理。',itemLabel:'导航链接',fields:[
  {key:'name',title:'菜单名称'},{key:'url',title:'目标网址'},{key:'icon',title:'菜单图标'},{key:'external',title:'外部链接（新标签页）',kind:'boolean'}],
  create:()=>({name:'新链接',url:'https://example.com',icon:'material-symbols:link',external:true})},
 'navCustomLinks.children':{title:'子菜单链接',help:'可以在一个导航项下面继续新增子菜单。',itemLabel:'子链接',fields:[
  {key:'name',title:'显示名称'},{key:'url',title:'访问地址'},{key:'icon',title:'图标名称'},{key:'external',title:'新标签页打开',kind:'boolean'}],
  create:()=>({name:'新子链接',url:'https://example.com',external:true,icon:'material-symbols:link'})},
 'sidebarLayoutConfig.leftComponents':{title:'左侧栏组件',help:'决定左侧栏显示哪些组件。调整顺序后重新构建生效。',itemLabel:'组件',fields:[
  {key:'type',title:'显示组件类型'},{key:'enable',title:'启用组件',kind:'boolean'},{key:'position',title:'普通展示或吸顶'},{key:'showOnPostPage',title:'文章页显示',kind:'boolean'},{key:'showOnNonPostPage',title:'非文章页显示',kind:'boolean'},{key:'configId',title:'广告等关联编号'},{key:'responsive',title:'响应式设置',kind:'json'},{key:'specificConfig',title:'组件专属设置',kind:'json'}],
  create:()=>({type:'profile',enable:true,position:'top',showOnPostPage:true,showOnNonPostPage:true})},
 'sidebarLayoutConfig.rightComponents':{title:'右侧栏组件',help:'决定右侧栏显示哪些组件及其顺序。',itemLabel:'组件',fields:[
  {key:'type',title:'显示组件类型'},{key:'enable',title:'启用组件',kind:'boolean'},{key:'position',title:'普通展示或吸顶'},{key:'showOnPostPage',title:'文章页显示',kind:'boolean'},{key:'showOnNonPostPage',title:'非文章页显示',kind:'boolean'},{key:'configId',title:'关联编号'},{key:'responsive',title:'响应式设置',kind:'json'},{key:'specificConfig',title:'组件专属设置',kind:'json'}],
  create:()=>({type:'profile',enable:true,position:'top',showOnPostPage:true,showOnNonPostPage:true})},
 'sidebarLayoutConfig.mobileBottomComponents':{title:'手机底部组件',help:'安排手机屏幕底部的组件。',itemLabel:'组件',fields:[
  {key:'type',title:'显示组件类型'},{key:'enable',title:'启用组件',kind:'boolean'},{key:'position',title:'显示位置'},{key:'showOnPostPage',title:'文章页显示',kind:'boolean'},{key:'showOnNonPostPage',title:'非文章页显示',kind:'boolean'}],
  create:()=>({type:'profile',enable:true,position:'top',showOnPostPage:true,showOnNonPostPage:true})},
 'siteConfig.favicon':{title:'网站浏览器图标',help:'可添加多个尺寸或浅深色对应图标；浏览器会选择适合的图片。',itemLabel:'图标',fields:[
  {key:'src',title:'图标图片地址',kind:'image'},{key:'sizes',title:'图标尺寸'},{key:'theme',title:'适配主题'}],create:()=>({src:'/favicon/favicon.ico'})},
};
const listPaths=new Set(Object.keys(listDefinitions));
export function listKey(section:string,path:string[]):string{
 return [section,...path.filter(key=>!/^\d+$/.test(key))].join('.');
}
export function definitionForList(section:string,path:string[]):ListDefinition|null{
 return listDefinitions[listKey(section,path)]||null;
}
export function isManagedList(section:string,path:string[],value:unknown):boolean{
 if(!Array.isArray(value))return false;
 const key=listKey(section,path);
 return listPaths.has(key)||value.some(entry=>entry!==null&&typeof entry==='object'&&!Array.isArray(entry));
}
export function displayItemTitle(item:Record<string,unknown>,index:number,def:ListDefinition):string{
 const candidate=item.title||item.name||item.type||item.id||item.url;
 return typeof candidate==='string'&&candidate.trim()?candidate.trim():`${def.itemLabel} ${index+1}`;
}
export function orderedMove(items:Record<string,unknown>[],from:number,to:number,weight:boolean):Record<string,unknown>[]{
 const reordered=items.map(v=>({...v}));
 if(from===to||from<0||to<0||from>=items.length||to>=items.length)return reordered;
 const [entry]=reordered.splice(from,1);reordered.splice(to,0,entry);
 if(weight)reordered.forEach((record,index)=>{record.weight=(reordered.length-index)*10;});
 return reordered;
}
