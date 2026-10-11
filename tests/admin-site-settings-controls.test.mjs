import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const editor=await readFile('src/components/pages/admin/AdminSiteSettings.svelte','utf8');
const list=await readFile('src/components/pages/admin/SiteSettingsListEditor.svelte','utf8');
const schema=await readFile('src/utils/settings/settings-list-schema.ts','utf8');
const raw=await readFile('src/utils/settings/settings-controls.ts','utf8');
const compiled=await transform(raw,{loader:'ts',format:'esm',target:'es2022'});
const {numberPresentation,percentageText}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

test('all normal booleans use one-click accessible switches, including list items',()=>{
 assert.match(editor,/<input class="setting-switch-input"[^>]+type="checkbox" role="switch"/);
 assert.match(list,/<input class="item-switch-input"[^>]+type="checkbox" role="switch"/);
 assert.doesNotMatch(editor,/<select[^>]*value=\{String\(field.value\)\}[^>]*><option value="true">开启/);
 assert.match(editor,/class:toggle-row=\{field.kind==="boolean"\}/);
 assert.match(list,/class:toggle-item=\{field.kind==='boolean'/);
});

test('two or three choices become direct, labeled buttons, not long select menus',()=>{
 assert.match(editor,/<div class="choice-row" role="group" aria-label=\{fieldName\(field\)\}>/);
 assert.match(editor,/aria-pressed=\{String\(field.value\)===option.value\}/);
 assert.match(list,/<div class="item-choice-row" role="group" aria-label=\{field.title\}>/);
 assert.match(list,/aria-pressed=\{val===opt\[0\]\}/);
});

test('continuous numbers expose native range, precise input and units',()=>{
 assert.match(editor,/type="range"/);
 assert.match(editor,/class="number-entry"/);
 assert.match(editor,/class="theme-color-swatch"/);
 const hue=numberPresentation('siteConfig',['themeColor','hue'],295);
 assert.deepEqual([hue.min,hue.max,hue.step,hue.slider,hue.unit],[0,360,1,true,'°']);
 const opacity=numberPresentation('backgroundWallpaper',['overlay','opacity'],0.8);
 assert.deepEqual([opacity.min,opacity.max,opacity.step,opacity.slider],[0,1,0.01,true]);
 assert.equal(percentageText(opacity,0.7),'70%');
 assert.equal(numberPresentation('siteConfig',['pagination','postsPerPage'],10).slider,false);
});

test('editable structured fields and homepage shortcuts require no raw JSON in the ordinary editor',()=>{
 assert.match(list,/class="item-advanced-options"/);
 assert.match(list,/changeNested\(index,field.key,nestedField.path/);
 assert.match(schema,/backgroundWallpaper\.common\.homeText\.links/);
 assert.match(editor,/playerUrl.*feedPaths/);
});
