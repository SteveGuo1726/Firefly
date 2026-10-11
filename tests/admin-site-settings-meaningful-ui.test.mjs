import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const source=await readFile('src/utils/settings/settings-editor-ui.ts','utf8');
const compiled=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
const model=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
const settings=JSON.parse(await readFile('src/data/site-settings.json','utf8')).sections;
test('all centralized settings keys have friendly Chinese titles',()=>{
 const keys=new Set();
 function traverse(value){if(Array.isArray(value))value.forEach(traverse);else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){keys.add(key);traverse(v)}}
 Object.values(settings).forEach(traverse);
 assert.ok(keys.size>200);
 assert.deepEqual([...keys].filter(key=>!model.fieldNames[key]),[]);
 assert.equal(model.chineseLabel('siteConfig',['themeColor','hue']),'品牌主题颜色');
 assert.equal(model.chineseLabel('backgroundWallpaper',['src','desktop','0']),'第 1 张电脑壁纸');
 assert.equal(model.chineseLabel('backgroundWallpaper',['src','mobile','1']),'第 2 张手机壁纸');
});
test('site settings arrange important choices in meaningful categories',()=>{
 const categories=model.sectionCategories.flatMap(group=>group.sections);
 assert.deepEqual(new Set(categories),new Set(Object.keys(settings)));
 const basics=model.sectionGroups('siteConfig',settings.siteConfig);
 assert.ok(basics.length>=6);
 assert.ok(basics.some(group=>group.title.includes('导航')&&group.keys.includes('navbar')));
 assert.ok(basics.some(group=>group.title.includes('文章')&&group.keys.includes('post')));
});
test('image picker recognizes local public and src/assets paths without network write',()=>{
 const paths=['/assets/images/icon.png','assets/images/icon.png','public/assets/images/icon.png','src/assets/images/icon.png'];
 assert.ok(paths.every(path=>model.normalizeLocalImagePath(path)==='/assets/images/icon.png'));
 assert.equal(model.normalizeLocalImagePath('../../secret.txt'),null);
 assert.equal(model.normalizeLocalImagePath('javascript:alert(1)'),null);
 assert.ok(model.isImageSetting('siteConfig',['navbar','logo','value'],'src/assets/images/icon.png'));
 assert.ok(model.isImageSetting('backgroundWallpaper',['src','mobile','0'],'https://images.example.org/demo.webp'));
 assert.ok(!model.isImageSetting('siteConfig',['site_url'],'https://blog.example.org/'));
 assert.ok(model.isRemoteImageUrl('https://img.casto.top/file/example.webp'));
});
test('visual editor updates images while typing, keeps source import fallback and avoids exposing internals',async()=>{
 const editor=await readFile('src/components/pages/admin/AdminSiteSettings.svelte','utf8');
 const image=await readFile('src/components/pages/admin/SiteSettingsImagePreview.svelte','utf8');
 assert.match(editor,/SiteSettingsImagePreview/);
 assert.match(editor,/oninput=\{e=>updateField/);
 assert.match(editor,/chineseLabel\(currentSection,field\.path\)/);
 assert.match(editor,/sectionCategories/);
 assert.match(image,/import\.meta\.glob\('\/src\/assets/);
 assert.match(image,/site-image/);
 assert.match(image,/\$: if\(value!==checked\)changeImage\(value\)/);
});
