import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

async function loadTs(path) {
 const input=await readFile(path,'utf8');
 const result=await transform(input,{loader:'ts',format:'esm',target:'es2022'});
 return import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'));
}
const list=await loadTs('src/utils/settings/settings-list-schema.ts');
const validate=await loadTs('src/utils/settings/site-settings-list-validation.ts');
const original=JSON.parse(await readFile('src/data/site-settings.json','utf8'));
const source=await readFile('src/components/pages/admin/AdminSiteSettings.svelte','utf8');
const lists=await readFile('src/components/pages/admin/SiteSettingsListEditor.svelte','utf8');

test('all core collections have editable schemas and retain new friend feed fields',()=>{
 const wanted=[
  ['friendsConfig',[]],['profileConfig',['links']],
  ['sponsorConfig',['methods']],['sponsorConfig',['sponsors']],
  ['booknavConfig',[]],['booknavConfig',['0','items']],
  ['musicPlayerConfig',['local','playlist']],['navCustomLinks',[]],
  ['navCustomLinks',['0','children']],['friendApplicationConfig',['notes']],
  ['sidebarLayoutConfig',['leftComponents']],['sidebarLayoutConfig',['rightComponents']],
  ['sidebarLayoutConfig',['mobileBottomComponents']],
 ];
 for(const [section,path] of wanted){
  const definition=list.definitionForList(section,path);
  assert.ok(de¶»§q«^