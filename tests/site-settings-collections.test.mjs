import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const source=JSON.parse(await readFile('src/data/site-settings.json','utf8'));
const {sections}=source;
async function tsModule(file){
 const code=await readFile(file,'utf8');
 const js=await transform(code,{loader:'ts',format:'esm',target:'es2022'});
 return import('data:text/javascript;base64,'+Buffer.from(js.code).toString('base64'));
}
const {assertSiteSettingsCollections}=await tsModule('src/utils/settings/site-settings-list-validation.ts');
const {definitionForList,orderedMove,isManagedList}=await tsModule('src/utils/settings/settings-list-schema.ts');

test('config-manager collections expose friends, sponsors, bookmarks, songs and dynamic menu entries',()=>{
 for(const key of ['friendsConfig','friendsPageConfig','friendCircleConfig','sponsorConfig','booknavConfig','booknavPageConfig','musicPlayerConfig','navCustomLinks']){
  assert.ok(Object.hasOwn(sections,key),'missing '+key);
 }
 assert.equal(sections.friendsConfig.length,18);
 assert.equal(sections.booknavConfig.length,5);
 assert.equal(sections.navCustomLinks.length,3);
 assert.ok(sections.sponsorConfig.methods.length>=4);
 assert.ok(sections.musicPlayerConfig.local.playlist.length>0);
 assert.ok(!Object.hasOwn(sections.musicPlayerConfig.meting,'auth'),'private auth must not be copied to public JSON');
 assert.doesNotThrow(()=>assertSiteSettingsCollections(sections));
});

test('all list types have explicit creation templates including empty sponsors and nested bookmark items',()=>{
 for(const [section,path] of [
  ['friendsConfig',[]],['profileConfig',['links']],['sponsorConfig',['methods']],['sponsorConfig',['sponsors']],
  ['booknavConfig',[]],['booknavConfig',['0','items']],['musicPlayerConfig',['local','playlist']],
  ['navCustomLinks',[]],['navCustomLinks',['0','children']],['sidebarLayoutConfig',['leftComponents']]
 ]){
  const schema=definitionForList(section,path);
  assert.ok(schema,section+'.'+path.join('.'));
  assert.equal(typeof schema.create,'function');
  assert.ok(isManagedList(section,path,[]));
 }
});

test('reordering friends/bookmarks synchronizes weights with visible list order',()=>{
 const records=[{title:'first',weight:5},{title:'second',weight:100},{title:'third',weight:0}];
 const reordered=orderedMove(records,2,0,true);
 assert.deepEqual(reordered.map(x=>x.title),['third','first','second']);
 assert.ok(reordered[0].weight>reordered[1].weight&&reordered[1].weight>reordered[2].weight);
 assert.equal(records[2].weight,0,'input must remain unchanged');
});

test('reject dangerous links, duplicates, and incomplete list items before build/save',()=>{
 const clone=()=>structuredClone(sections);
 let d=clone();d.friendsConfig.push({title:'evil',siteurl:'javascript:alert(1)',weight:0,enabled:true});
 assert.throws(()=>assertSiteSettingsCollections(d),/网址无效/);
 d=clone();d.booknavConfig.push({...d.booknavConfig[0]});
 assert.throws(()=>assertSiteSettingsCollections(d),/重复/);
 d=clone();d.sponsorConfig.methods.push({name:'broken',enabled:'yes'});
 assert.throws(()=>assertSiteSettingsCollections(d),/开关/);
 d=clone();d.navCustomLinks.push({name:'bad',url:'data:text/html,payload'});
 assert.throws(()=>assertSiteSettingsCollections(d),/网址无效/);
});

test('new collection sections are connected to build-time TypeScript consumers',async()=>{
 const targets=[
  ['src/config/friendsConfig.ts',['friendsConfig','friendsPageConfig','friendCircleConfig']],
  ['src/config/sponsorConfig.ts',['sponsorConfig']],
  ['src/config/booknavConfig.ts',['booknavConfig','booknavPageConfig']],
  ['src/config/musicConfig.ts',['musicPlayerConfig']],
  ['src/config/navBarConfig.ts',['navCustomLinks']],
 ];
 for(const [file,sections] of targets){
  const text=await readFile(file,'utf8');
  for(const sec of sections)assert.match(text,new RegExp('applyManagedConfig\\("'+sec+'"'));
 }
});
