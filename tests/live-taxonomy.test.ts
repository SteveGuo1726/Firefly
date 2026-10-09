import assert from "node:assert/strict";
import test from "node:test";
import {mergeLiveTaxonomy} from "../src/utils/live-taxonomy";

const posts=[
 {id:"a",category:"Old",tags:["astro","blog"]},
 {id:"b",category:"Old",tags:["astro"]},
 {id:"c",category:"Other",tags:["notes"]},
];
const categories=[{name:"Old",count:2},{name:"Other",count:1}];
const tags=[{name:"astro",count:2},{name:"blog",count:1},{name:"notes",count:1}];
const asCounts=(entries)=>Object.fromEntries(entries.map(t=>[t.name,t.count]));

test("new live-only posts immediately add new categories and tags",()=>{
 const live=[{id:"new-post",meta:{category:"Fresh",tags:["astro","launch"]}}];
 assert.deepEqual(asCounts(mergeLiveTaxonomy(categories,posts,live,"category","Uncategorized")),
  {Old:2,Other:1,Fresh:1});
 assert.deepEqual(asCounts(mergeLiveTaxonomy(tags,posts,live,"tag","Uncategorized")),
  {astro:3,blog:1,launch:1,notes:1});
});
test("edited static posts replace rather than duplicate original taxonomy",()=>{
 const live=[{id:"a",meta:{category:"Updated",tags:["notes","news"]}}];
 assert.deepEqual(asCounts(mergeLiveTaxonomy(categories,posts,live,"category","Uncategorized")),
  {Old:1,Other:1,Updated:1});
 assert.deepEqual(asCounts(mergeLiveTaxonomy(tags,posts,live,"tag","Uncategorized")),
  {astro:1,news:1,notes:2});
});
test("static tombstones and protected drafts remove old contributions",()=>{
 const live=[{id:"a",deleted:true},{id:"c",hidden:true}];
 assert.deepEqual(asCounts(mergeLiveTaxonomy(categories,posts,live,"category","Uncategorized")),{Old:1});
 assert.deepEqual(asCounts(mergeLiveTaxonomy(tags,posts,live,"tag","Uncategorized")),{astro:1});
});
test("republishing a hidden static post restores new taxonomy",()=>{
 const hidden=[{id:"a",hidden:true}];
 const restored=[{id:"a",meta:{category:"Restored",tags:["fresh"]}}];
 assert.ok(!mergeLiveTaxonomy(tags,posts,hidden,"tag","Uncategorized").some(t=>t.name==="blog"));
 assert.equal(asCounts(mergeLiveTaxonomy(tags,posts,restored,"tag","Uncategorized")).fresh,1);
});
test("blank live categories map to localized uncategorized and zero-count terms disappear",()=>{
 const live=[{id:"a",meta:{category:"",tags:["astro","astro"]}}];
 assert.deepEqual(asCounts(mergeLiveTaxonomy(categories,posts,live,"category","未分类")),
  {Old:1,Other:1,"未分类":1});
 assert.equal(asCounts(mergeLiveTaxonomy(tags,posts,live,"tag","未分类")).astro,2);
});
