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
  assert.ok(definition,section+':'+path.join('.'));
  assert.ok(definition.create());
 }
 const keys=list.definitionForList('friendsConfig',[]).fields.map(x=>x.key);
 for(const key of ['title','siteurl','imgurl','desc','tags','enabled','weight','fetchFeed','feedurl'])assert.ok(keys.includes(key),key);
 assert.equal(original.sections.friendsConfig.length,18);
 assert.equal(original.sections.booknavConfig.length,5);
 assert.equal(original.sections.friendApplicationConfig.notes.length,4);
});
test('editing nested bookmarks and friend notes cannot erase other configuration branches',()=>{
 const draft=structuredClone(original);
 const savedBefore=JSON.stringify(draft.sections);
 const bookmark=draft.sections.booknavConfig[0];
 const initialSize=bookmark.items.length;
 bookmark.items.push(list.definitionForList('booknavConfig',['0','items']).create());
 assert.equal(bookmark.items.length,initialSize+1);
 bookmark.items=list.orderedMove(bookmark.items,bookmark.items.length-1,0,true);
 assert.equal(bookmark.items[0].title,'新书签');
 assert.equal(bookmark.items[0].weight,(initialSize+1)*10);
 draft.sections.friendApplicationConfig.notes.push(list.definitionForList('friendApplicationConfig',['notes']).create());
 draft.sections.friendsConfig[0].fetchFeed=false;
 validate.assertSiteSettingsCollections(draft.sections);
 assert.equal(original.sections.booknavConfig[0].items.length,initialSize);
 assert.equal(original.sections.friendApplicationConfig.notes.length,4);
 for(const key of Object.keys(original.sections).filter(x=>!['booknavConfig','friendApplicationConfig','friendsConfig'].includes(x))){
  assert.deepEqual(draft.sections[key],original.sections[key],key+' unexpectedly modified');
 }
 assert.notEqual(JSON.stringify(draft.sections),savedBefore);
});
test('list reorder does not mutate the original items and keeps opaque extra fields',()=>{
 const before=[{title:'甲',weight:42,custom:{nested:'safe'}},{title:'乙',weight:1}];
 const next=list.orderedMove(before,1,0,true);
 assert.equal(next[0].title,'乙');
 assert.equal(next[1].custom.nested,'safe');
 assert.equal(before[0].weight,42);
 assert.equal(before[1].weight,1);
 assert.deepEqual(list.orderedMove(before,-1,1,true),before);
});
test('friend application MDX renders values from centralized JSON; UI offers undo and purpose navigation',async()=>{
 const mdx=await readFile('src/content/spec/friends.mdx','utf8');
 assert.match(mdx,/siteSettings\.sections\.friendApplicationConfig\.site/);
 assert.match(mdx,/siteSettings\.sections\.friendApplicationConfig\.notes/);
 assert.match(source,/settings-topic-nav/);
 assert.match(source,/settings-subnav/);
 assert.match(lists,/undoRemove/);
 assert.match(lists,/imageThumbnail/);
 assert.match(lists,/SiteSettingsImagePreview/);
});

test('friend application rejects invalid note structures and contact information',()=>{
 const clone=()=>structuredClone(original.sections);
 const blankTitle=clone();
 blankTitle.friendApplicationConfig.notes[0].title='';
 assert.throws(()=>validate.assertSiteSettingsCollections(blankTitle),/注意事项/);
 const nonObject=clone();
 nonObject.friendApplicationConfig.notes.push(null);
 assert.throws(()=>validate.assertSiteSettingsCollections(nonObject),/注意事项/);
 const badEmail=clone();
 badEmail.friendApplicationConfig.site.email='invalid-address';
 assert.throws(()=>validate.assertSiteSettingsCollections(badEmail),/邮箱/);
 const badSite=clone();
 badSite.friendApplicationConfig.site.url='javascript:alert(1)';
 assert.throws(()=>validate.assertSiteSettingsCollections(badSite),/网址/);
 validate.assertSiteSettingsCollections(clone());
});

test('site settings publishing is strictly scoped to the matching domain and GitHub branch',()=>{
 assert.ok(source.includes('hostname==="blog.casto.top"&&session.branch==="master"'));
 assert.ok(source.includes('hostname==="v1-preview.casto.top"&&session.branch==="ai/preview-test"'));
 assert.ok(source.includes('session.oauth||!session.token'));
 assert.ok(source.includes('确认将本页统一设置 JSON 提交到正式 GitHub master 分支'));
 assert.ok(source.includes('页面加载后发生变化'));
 assert.ok(source.includes('提交正式设置'));
});
