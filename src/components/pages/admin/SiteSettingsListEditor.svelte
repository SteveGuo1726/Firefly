<script lang="ts">
import SiteSettingsImagePreview from './SiteSettingsImagePreview.svelte';
import {definitionForList,displayItemTitle,orderedMove} from '@/utils/settings/settings-list-schema';
import type {ListDefinition} from '@/utils/settings/settings-list-schema';
import {isImageSetting,chineseLabel,isRemoteImageUrl,normalizeLocalImagePath} from '@/utils/settings/settings-editor-ui';
export let section:string;
export let path:string[];
export let value:Record<string,unknown>[];
export let onChange:(next:Record<string,unknown>[])=>void;
let query='',error='';
let removed:{index:number;item:Record<string,unknown>;title:string}|null=null;
function imageThumbnail(item:Record<string,unknown>):string|null{
 const source=item.imgurl||item.avatar||item.cover;
 if(typeof source!=='string'||!source.trim())return null;
 if(isRemoteImageUrl(source))return source;
 const local=normalizeLocalImagePath(source);
 return local?'/api/admin/auth/site-image'+local:null;
}
function undoRemove(){
 if(!removed)return;
 const next=[...list];
 next.splice(Math.min(removed.index,next.length),0,removed.item);
 removed=null;
 commit(next);
}

$: definition=definitionForList(section,path);
$: list=Array.isArray(value)?value:[];
$: visible=list.map((item,index)=>({item,index})).filter(({item})=>!query||Object.values(item).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase())));
function commit(items:Record<string,unknown>[]){if(items.length>300){error='单个列表最多添加 30���q�^