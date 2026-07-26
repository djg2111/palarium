const {open} = require('./lib');
const path = require('path'); const TESTS = path.join(__dirname,'..','..','tests');
(async()=>{
  const h = await open({viewport:{width:320,height:1400}});
  const {page}=h;
  await page.evaluate(()=>{localStorage.setItem('palbreed_roster',JSON.stringify([
    {id:'h1',k:'SheepBall',ps:['Musclehead'],g:'M',nick:'Woolly',note:'my first pal',iv:null},
    {id:'h2',k:'Anubis',ps:['Musclehead'],g:'M',nick:'',note:'breeding project',iv:null}]));});
  await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
  await page.evaluate(()=>location.hash='#/roster'); await page.waitForTimeout(300);
  await page.click('#savereadBtn');
  await page.setInputFiles('#saveFile', path.join(TESTS,'fixture-before.sav'));
  await page.waitForSelector('#smResult:not([hidden])');
  await page.screenshot({path:'shot-conflicts-320.png'});
  const m = await page.evaluate(()=>{const el=document.querySelector('.smodal');const r=el.getBoundingClientRect();
    return {h:Math.round(r.height), listVisible:!!document.querySelector('.smlist'), acts:!!document.querySelector('#smApply').offsetParent};});
  console.log('modal height at 320px:',m.h,'px · added-list rendered:',m.listVisible,'· import button reachable:',m.acts);
  await h.browser.close();
})();
