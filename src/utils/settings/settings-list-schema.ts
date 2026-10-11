/** Explicit list schemas inspired by Firefly's local config manager.
 * All of these are STATIC build-time data, never direct imagebed writes.
 */
export type ListDefinition={title:string;help:string;itemLabel:string;fields:{key:string;title:string;hint?:string;kind?:'text'|'textarea'|'number'|'boolean'|'lines'|'image'|'json'}[];create:()=>Record<string,unknown>;orderByWeight?:boolean};
export const listDefinitions:Record<string,ListDefinition>={
 friendsConfig:{title:'友情链接',help:'添加、删除、调整友链。点击卡片可编辑站点名称、头像、描述、链接和订阅信息；排序会同步友链权重。',itemLabel:'友链',orderByWeight:true,fields:[
  {key:'title',title:'站点名称'},{key:'siteurl',title:'网站链接'},{key:'imgurl',title:'站点头像',kind:'image'},{key:'desc',title:'站点介绍',kind:'textarea'},{key:'tags',title:'分类标签',kind:'lines',hint:'每行一个标签'},{key:'enabled',title:'在友链页显示',kind:'boolean'},{key:'weight',title:'排序权重',kind:'number',hint:'数值越大越靠前，拖动排序也会自动更新'},{key:'fetchFeed',title:'订阅站点动态',kind:'boolean'},{key:'feedurl',title:'RSS / Atom 订阅地址',hint:'留空会尝试自动发现订阅地址'}],
  create:()=>({title:'新友链',imgurl:'',desc:'',siteurl:'https://example.com',fetchFeed:false,tags:[],weight:0,enabled:false})},
 'backgroundWallpaper.common.homeText.links':{title:'首页快捷链接',help:'首页大标题下面的图标嶻�q�^