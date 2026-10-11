import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={checked_at:new Date().toISOString(),checks:[],errors:[]};
let page;
async function check(label,fn){try{const result=await fn();report.checks.push({name:label,ok:true,...(result||{})});console.log('PASS',label)}catch(err){report.checks.push({name:label,ok:false,error:String(err)});console.error('FAIL',label,err.message);throw err}}
try{
  page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  // Metadata + controls should remain functional even if a third-party image CDN is blocked.
  await page.route(/https:\/\/(?:i\.pixiv\.re|i\.pixiv\.cat|i\.pximg\.net|i-cf\.pximg\.net)\//,route=>route.abort('blockedbyclient'));
  await page.goto('http://127.0.0.1:8788/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('.art-card').length>20,null,{timeout:12000});
  await check('Real Pixiv gallery loads',async()=>{
    const count=await page.locator('.art-card').count();
    assert(count>=25,'expected >=25 real artworks, got '+count);
    assert.equal(await page.locator('.art-card .art-likes').first().innerText(),'✦ Pixiv');
    assert.equal((await page.locator('.art-name').first().innerText()).includes('银河尽头的蝶光'),false);
    return {works:count};
  });
  await check('Image opens within an unscaled reader',async()=>{
    await page.locator('.art-cover').first().click();
    await page.waitForSelector('.reader.open');
    assert(await page.locator('#readerTitle').innerText());
    assert.equal(await page.locator('#pixivSource').getAttribute('href')?.then(v=>v.startsWith('https://www.pixiv.net/artworks/')),true);
    await page.locator('#zoomIn').click();
    const v=await page.evaluate(()=>({
      zoom:getComputedStyle(document.querySelector('#viewerImage')).transform,
      reader:getComputedStyle(document.querySelector('#reader')).transform,
      body:getComputedStyle(document.querySelector('.reader-body')).transform
    }));
    assert.notEqual(v.zoom,'none');
    assert.equal(v.reader,'none');assert.equal(v.body,'none');
    return v;
  });
  await check('Character/color/mood jump content is visible',async()=>{
    assert(await page.locator('#relatedWorks .related-item').count()>=2);
    for(const axis of ['color','mood','character']){
      await page.locator('[data-path="'+axis+'"]').click();
      assert(await page.locator('#relatedWorks .related-item').count()>=2);
    }
  });
  await check('Local artist follow persists',async()=>{
    await page.locator('#followArtist').click();
    const a=await page.evaluate(()=>JSON.parse(localStorage.getItem('kira.follows.v2')||'[]'));
    assert(a.length===1);
    await page.locator('#closeReader').click();
    await page.locator('[data-main="关注"]').click();
    assert(await page.locator('.art-card').count()>=1);
    return {following:a[0]};
  });
  await check('Mobile avoids horizontal overflow',async()=>{
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(300);
    const sz=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}));
    assert(sz.scrollWidth<=sz.innerWidth+2,JSON.stringify(sz));
    return sz;
  });
  await fs.mkdir('docs',{recursive:true});
  await page.screenshot({path:'docs/kira-v6-mobile-smoke.png',fullPage:false});
  assert.deepEqual(report.errors,[],'pageerror exceptions');
}finally{
  await browser.close();
  await fs.writeFile('docs/kira-v6-browser-qa.json',JSON.stringify(report,null,2));
}
