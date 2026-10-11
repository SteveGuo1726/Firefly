/** Static, repository-owned site settings. No runtime fetches or KV reads.
 * This JSON intentionally contains only public, serializable values.
 * Credentials and executable configuration remain in their original modules.
 */
import initial from '@/data/site-settings.json';

export type SiteSettingsDocument = typeof initial;
export type SiteSettingsSectionName = keyof SiteSettingsDocument['sections'];
export const SITE_SETTINGS_VERSION = 1;

const isObject=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const forbidden=new Set(['__proto__','prototype','constructor']);

/** Deny type changes and invented settings so a JSON typo cannot silently
 * break a production build. Arrays are intentionally replaced atomically. */
function copyValid(defaults:unknown,override:unknown,path:string,depth=0):unknown{
 if(depth>16)throw new Error(`站点设置嵌套过深：${path}`);
 if(Array.isArray(defaults)){
  if(!Array.isArray(override))throw new Error(`站点设置 ${path} 应为数组`);
  const model=defaults[0];
  if(model!==undefined)override.forEach((value,index)=>copyValid(model,value,`${path}[${index}]`,depth+1));
  return override;
 }
 if(isObject(defaults)){
  if(!isObject(override))throw new Error(`站点设置 ${path} 应为对象`);
  const result={...defaults};
  for(const [key,value] of Object.entries(override)){
   if(forbidden.has(key)||!Object.hasOwn(defaults,key))throw new Error(`未知站点设置：${path}.${key}`);
   result[key]=copyValid(defaults[key],value,`${path}.${key}`,depth+1);
  }
  return result;
 }
 if(typeof override!==typeof defaults || (typeof defaults==='number'&&!Number.isFinite(override))){
  throw new Error(`站点设置类型不匹配：${path}`);
 }
 if(typeof override==='string'&&override.length>12000)throw new Error(`站点设置字符串过长：${path}`);
 return override;
}

export function assertSiteSettings(data:unknown,defaults:SiteSettingsDocument=initial):asserts data is SiteSettingsDocument{
 if(!isObject(data)||data.schemaVersion!==SITE_SETTINGS_VERSION||!isObject(data.sections)){
  throw new Error('站点设置版本错误，当前仅支持 schemaVersion: 1');
 }
 for(const [key,overrides] of Object.entries(data.sections)){
  if(forbidden.has(key)||!Object.hasOwn(defaults.sections,key))throw new Error(`未知站点设置分组：${key}`);
  copyValid((defaults.sections as Record<string,unknown>)[key],overrides,key);
 }
 const sections=data.sections as Record<string,unknown>;
 const site=sections.siteConfig;
 if(isObject(site)){
  const theme=isObject(site.themeColor)?site.themeColor:null;
  if(theme && typeof theme.hue==='number'&&(theme.hue<0||theme.hue>360))throw new Error('主题色相必须在 0～360 范围内');
  if(typeof site.pageWidth==='number'&&(site.pageWidth<40||site.pageWidth>200))throw new Error('页面宽度应在 40～200rem 范围内');
  if(typeof site.site_url==='string'&&!/^https:\/\/[^\s/]+/.test(site.site_url))throw new Error('站点 URL 必须使用 HTTPS');
 }
}

export function applyManagedConfig<T extends object>(section:SiteSettingsSectionName,defaults:T):T{
 const overrides=initial.sections[section];
 if(!overrides)return defaults;
 return copyValid(defaults,overrides,section) as T;
}

// Fail the static build early if committed JSON contains invalid setting types.
assertSiteSettings(initial);
