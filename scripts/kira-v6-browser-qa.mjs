import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const report={checked_at:new Date().toISOString(),checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
let failImages=false;let delayOriginals=400;
const svg=(wide)=>wide
  ? '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#896bd3"/><circle cx="800" cy="240" r="170" fill="#fb91bf"/></svg>'
  : '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#5595ea"/><circle cx="240" cy="470" r="165" fill="#f6b973"/></svg>';
await page.route(/https:\/\/(?:i\.pixiv\.re|i\.pixiv\.cat|i\.pixiv\.nl|i\.pximg\.net|i-cf\.pximg\.net)\//,async route=>{
 if(failImages)return route.abort('failed');
 if(route.request().url().includes('img-original'))await new Promise(resolve=>setTimeout(resolve,delayOriginals));
 const wide=/[24680]_p0|[24680]_master|wide/.test(route.request().url());
 return route.fulfill({status:200,contentType:'image/svg+xml',body:svg(wide),headers:{'cache-control':'public,max-age=60'}});
});
page.on('pageerror',e=>report.errors.push(e.message));
async function test(label,task){
 try{const details=await task();report.checks.push({label,pass:true,...(details||{})});console.log('PASS',label,JSON.stringify(details||{}))}
 catch(e){report.checks.push({label,pass:false,error:String(e)});console.error('FAIL',label,e.message);throw e}
}
try{
 await page.goto('http://127.0.0.1:8788/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('.art-card').length>25,{},{timeout:15000});
 await test('Load real SFW Pixiv image gallery with no fake popularity',async()=>{
  const count=await page.locator('.art-card').count();
  assert(count>=35,'only '+count);
  assert((await page.locator('.art-likes').first().innerText()).includes('Pixiv'));
  assert(!(await page.locator('.art-name').first().innerText()).includes('银河尽头'));
  return {works:count};
 });
 await test('No header strip and portrait/landscape images fit viewport',async()=>{
  await page.locator('.art-cover').first().click();
  await page.waitForFunction(()=>document.querySelector('#viewerImage')?.classList.contains('loaded'));
  assert.equal(await page.locator('.reader-top').count(),0);
  assert.equal(await page.locator('.reader-floatbar').count(),1);
  const fit=await page.evaluate(()=>{
   const stage=document.querySelector('#readerStage'),image=document.querySelector('#viewerImage');
   return {stageW:stage.clientWidth,stageH:stage.clientHeight,imageW:image.offsetWidth,imageH:image.offsetHeight,
    naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};
  });
  assert(fit.imageW>1&&fit.imageH>1);
  assert(fit.imageW<fit.stageW&&fit.imageH<fit.stageH,JSON.stringify(fit));
  return fit;
 });
 await test('Rapid changes cannot restore an earlier image',async()=>{
  await page.evaluate(()=>{openReader(WORKS[1].id,null);openReader(WORKS[4].id,null);openReader(WORKS[8].id,null)});
  await page.waitForFunction(()=>{const im=document.querySelector('#viewerImage');return im?.classList.contains('loaded')&&im.src===state.focus?.preview},null,{timeout:12000});
  const stateOfView=await page.evaluate(()=>({current:state.focus.id,expected:WORKS[8].id,view:document.querySelector('#viewerImage').src,source:WORKS[8].preview,loadVisible:!document.querySelector('#mediaLoad').hidden}));
  assert.equal(stateOfView.current,stateOfView.expected);assert.equal(stateOfView.view,stateOfView.source);
  assert.equal(stateOfView.loadVisible,false);
  return {current:stateOfView.current};
 });
 await test('Unrestricted proportional zoom affects the image only',async()=>{
  await page.locator('#zoomPercent').fill('1250');
  await page.locator('#zoomPercent').dispatchEvent('change');
  const result=await page.evaluate(()=>{
   const im=document.querySelector('#viewerImage'),rect=im.getBoundingClientRect();
   const natural=im.offsetWidth/im.offsetHeight;
   return {zoom:state.zoom,matrix:getComputedStyle(im).transform,width:rect.width,height:rect.height,
    intrinsicRatio:natural,rootTransform:getComputedStyle(document.querySelector('#reader')).transform,
    sidebarTransform:getComputedStyle(document.querySelector('.reader-details')).transform};
  });
  assert(result.zoom>5,'zoom still capped at 500%');
  const ratio=result.width/result.height;
  assert(Math.abs(ratio-result.intrinsicRatio)<.01,'image stretched');
  assert.equal(result.rootTransform,'none');
  assert.equal(result.sidebarTransform,'none');
  await page.locator('#zoomReset').click();
  return result;
 });
 await test('Original preloads before clicking original button',async()=>{
  await page.evaluate(()=>openReader(WORKS[9].id,null));
  await page.waitForFunction(()=>originalPrefetching.size>0||warmImages.has(WORKS[9].original),null,{timeout:8000});
  const r=await page.evaluate(()=>({source:state.focus.original,cached:warmImages.has(state.focus.original)||originalPrefetching.has(state.focus.original)}));
  assert(r.cached,'original did not preload');
  return r;
 });
 await test('Recommendations are truly matched, with no random padding',async()=>{
  const r=await page.evaluate(()=>({
    all:['character','series','artist','color','mood'].map(axis=>({
      axis,count:related(state.focus,axis).length,
      valid:related(state.focus,axis).every(w=>relationScore(state.focus,w,axis)>0)
    }))
  }));
  for(const v of r.all){assert(v.valid);assert(v.count<=12)}
  const actual=await page.evaluate(()=>{
    const seriesSource=WORKS.find(x=>x.seriesKey&&related(x,'series').length>0);
    const artistSource=WORKS.find(x=>x.artistKey.startsWith('pixiv:')&&related(x,'artist').length>0);
    return {seriesExists:!!seriesSource,seriesMatches:seriesSource?related(seriesSource,'series').every(x=>x.seriesKey===seriesSource.seriesKey):false,
      artistExists:!!artistSource,artistMatches:artistSource?related(artistSource,'artist').every(x=>x.artistKey===artistSource.artistKey):false};
  });
  assert(actual.seriesExists&&actual.seriesMatches,'no valid Pixiv franchise graph');
  assert(actual.artistExists&&actual.artistMatches,'no valid same-artist graph');
  await page.locator('[data-path="series"]').click();
  await page.locator('[data-path="artist"]').click();
    await page.locator('[data-path="color"]').click();
  assert((await page.locator('#relatedCount').innerText()).includes('匹配')||(await page.locator('#relatedCount').innerText()).includes('足够'));
  return r;
 });
 await test('Non-blocking original loads in-place without navigation',async()=>{
  await page.locator('#zoomReset').click();
  const p=await page.evaluate(()=>state.focus);
  if(p.original&&p.preview!==p.original){
    const before=await page.locator('#viewerImage').getAttribute('src');
    await page.locator('#btnOriginal').click();
    // With browser preloading it is valid to swap immediately, or after async decoding.
    await page.waitForFunction(()=>state.original===true,null,{timeout:15000});
    const after=await page.locator('#viewerImage').getAttribute('src');
    assert.notEqual(after,before);
    assert.equal(await page.locator('.reader.open').count(),1);
    return{switched:true};
  }
  return {skipped:'upstream original URL equals preview'};
 });
 await test('Failed next-image load never leaves a stale previous image',async()=>{
  await page.locator('#closeReader').click();
  await page.locator('.art-cover').first().click();
  await page.waitForFunction(()=>document.querySelector('#viewerImage')?.classList.contains('loaded'));
  failImages=true;
  await page.evaluate(()=>{const target=WORKS[32];WORKS[32]={...target,preview:target.preview+'?kira_force_qa='+Date.now(),card:target.card+'?kira_force_qa='+Date.now()};openReader(WORKS[32].id,null)});
  await page.waitForFunction(()=>document.querySelector('#mediaFail')?.hidden===false,null,{timeout:20000});
  const failed=await page.evaluate(()=>({current:state.focus.id,expected:WORKS[32].id,imageLoaded:document.querySelector('#viewerImage').classList.contains('loaded'),retryVisible:!document.querySelector('#mediaFail').hidden}));
  assert.equal(failed.current,failed.expected);assert(!failed.imageLoaded);assert(failed.retryVisible);
  failImages=false;
  await page.locator('#mediaRetry').click();
  await page.waitForFunction(()=>document.querySelector('#viewerImage')?.classList.contains('loaded'),null,{timeout:16000});
  return {recovered:true};
 });
 await test('Local follows and mobile contain image without overflow',async()=>{
  await page.locator('#followArtist').click();
  const following=await page.evaluate(()=>JSON.parse(localStorage.getItem('kira.follows.v2')||'[]').length);
  assert(following>=1);
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(180);
  await page.locator('#zoomReset').click();
  const sizes=await page.evaluate(()=>({
    document:document.documentElement.scrollWidth,width:window.innerWidth,
    stageW:document.querySelector('#readerStage').clientWidth,stageH:document.querySelector('#readerStage').clientHeight,
    imageW:document.querySelector('#viewerImage').offsetWidth,imageH:document.querySelector('#viewerImage').offsetHeight
  }));
  assert(sizes.document<=sizes.width+2,JSON.stringify(sizes));
  assert(sizes.imageW<=sizes.stageW&&sizes.imageH<=sizes.stageH,JSON.stringify(sizes));
  await page.screenshot({path:'docs/kira-v7-mobile-smoke.png',fullPage:false});
  await page.locator('#closeReader').click();
  await page.locator('[data-mobile="rank"]').click();
  const selected=await page.evaluate(()=>state.main);
  assert.equal(selected,'精选','mobile featured button must select the existing channel');
  return sizes;
 });
 assert.deepEqual(report.errors,[],'page JS errors');
}finally{
 await fs.mkdir('docs',{recursive:true});
 await fs.writeFile('docs/kira-v7-browser-qa.json',JSON.stringify(report,null,2));
 await browser.close();
}
