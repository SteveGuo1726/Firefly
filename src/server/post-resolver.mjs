/**
 * Resolve one public article against the current CMS pointer BEFORE serving an
 * archived/baseline version. A tombstone or private revision must suppress the
 * baseline, even when the original post was bundled as static HTML.
 */
import {createCms,publicContentItem} from './live-cms.mjs';

export const publicBaselinePosts = Object.freeze({
  'mmd-recovery': {title:'尝试做mmd （1/∞）（还没完成）',body:'众所周知：做mmd死路一条……',publishedAt:'2026-05-23',fields:{category:'日常',tags:['mmd','教程'],description:'原文目前只有可核验的公开摘录。'}},
  'firefly-config-manager': {title:'Firefly 本地管理器',body:'一个用于管理 Firefly / Fuwari / Astro 博客的本地图形化工具。支持配置管理、文章 Frontmatter 管理、资源预览以及保存前备份。\n\n原始完整正文尚待恢复。',publishedAt:'2026-05-12',fields:{category:'工具',tags:['工具']}},
  'firefly': {title:'Firefly 一款清新美观的 Astro 博客主题模板',body:'# 🌟 项目概述\n\nFirefly 是一款基于 Astro 框架和 Fuwari 模板开发的清新美观且现代化个人博客主题模板，专为技术爱好者和内容创作者设计。\n\n原始完整正文尚待恢复。',publishedAt:'2026-05-08',fields:{category:'文章示例',tags:[]}}
});
export async function resolvePublicPost(store,slug,{baseline=publicBaselinePosts}={}) {
  if (store) {
    try {
      const cms=createCms(store);
      const current=await cms.load('posts',slug);
      if(current)return {item:publicContentItem(current),source:'cms',suppressed:!publicContentItem(current)};
    } catch {}
  }
  const item=Object.hasOwn(baseline,slug)?baseline[slug]:null;
  if(!item)return {item:null,source:'missing',suppressed:false};
  return {item:{...structuredClone(item),id:slug,kind:'posts',state:'published'},source:'baseline',suppressed:false};
}
