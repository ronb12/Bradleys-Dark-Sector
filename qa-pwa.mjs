import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173/';
const out = '/Volumes/YOTUO/DarkSector-PWA-QA';
mkdirSync(out, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true, executablePath: '/Users/ronellbradley/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--enable-webgl', '--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'] });
const check = (name, value, detail) => { results.push({name,pass:Boolean(value),detail}); console.log((value ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + JSON.stringify(detail).slice(0,300) : '')); };
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if(m.type() === 'error') errors.push('console: '+m.text());});
  const response = await page.goto(base, {waitUntil:'domcontentloaded', timeout:60000});
  check('Desktop response HTTP 200', response?.status() === 200, response?.status());
  await page.waitForTimeout(1500);
  const manifest = await page.evaluate(async () => {
    const link=document.querySelector('link[rel=manifest]');
    const res=await fetch(link?.getAttribute('href')||'/manifest.webmanifest');
    const data=await res.json();
    return {status:res.status, name:data.name, icons:data.icons?.map(x=>x.sizes), display:data.display, swAllowed: 'serviceWorker' in navigator};
  });
  check('Installable PWA metadata', manifest.status===200 && manifest.display==='standalone' && manifest.icons.includes('192x192') && manifest.icons.includes('512x512'), manifest);
  const shell = await page.getByRole('button', {name:/deploy\s*[—-]/i}).isVisible().catch(()=>false);
  check('Desktop FPS menu available',shell);
  await page.getByRole('button', {name:/deploy\s*[—-]/i}).click({timeout:25000});
  await page.waitForTimeout(1300);
  const game = await page.evaluate(() => ({ canvas:document.querySelectorAll('canvas').length, started:Boolean(window.__darkSector?.player), enemyCount:window.__darkSector?.enemies?.length ?? -1 }));
  check('Desktop FPS game launches',game.canvas>0 && game.started,game);
  await page.keyboard.down('w'); await page.waitForTimeout(350); await page.keyboard.up('w');
  await page.keyboard.press(' ');
  await page.keyboard.press('r');
  check('Desktop input caused no JavaScript exceptions',errors.filter(x=>/TypeError|ReferenceError|Uncaught/.test(x)).length===0,errors.slice(0,4));
  await page.reload({waitUntil:'domcontentloaded',timeout:40000});
  const reg = await page.evaluate(async()=> {
    const ready=await Promise.race([navigator.serviceWorker.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('worker timeout')),30000))]);
    const keys=await caches.keys();
    const c=await caches.open(keys.find(x=>x.startsWith('dark-sector-')) ?? keys[0]);
    return {controller:Boolean(navigator.serviceWorker.controller),script:ready.active?.scriptURL,cacheKeys:keys,cached:(await c.keys()).length};
  });
  check('PWA worker installed and controlling page',reg.controller && reg.cacheKeys.some(x=>x.startsWith('dark-sector-')),reg);
  await context.setOffline(true);
  await page.reload({ waitUntil:'domcontentloaded',timeout:35000 });
  // Lazy game modules require time to mount after DOMContentLoaded when offline.
  await page.getByRole('button', {name:/deploy\s*[—-]/i}).waitFor({state:'visible',timeout:15000}).catch(()=>{});
  const offlineTitle = await page.getByRole('button', {name:/deploy\s*[—-]/i}).isVisible().catch(()=>false);
  check('Offline app shell launches',offlineTitle);
  if(offlineTitle) {
    await page.getByRole('button', {name:/deploy\s*[—-]/i}).click({timeout:12000});
    await page.waitForTimeout(1000);
    const play = await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length, started:Boolean(window.__darkSector?.player)}));
    check('Offline solo FPS playable',play.canvas>0 && play.started,play);
  }
  await context.setOffline(false);
  await context.close();
  const mobile=await browser.newContext({ viewport: { width:390,height:844 }, isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow' });
  const mp=await mobile.newPage();
  const mobileErrors=[];
  mp.on('pageerror',e=>mobileErrors.push(String(e)));
  await mp.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
  await mp.waitForTimeout(900);
  const mobileTitle=await mp.getByRole('button',{name:/deploy\s*[—-]/i}).isVisible().catch(()=>false);
  check('Mobile menu loads',mobileTitle);
  if(mobileTitle){
    await mp.getByRole('button',{name:/deploy\s*[—-]/i}).tap();
    await mp.waitForTimeout(900);
    const mobilePlay={canvas:await mp.locator('canvas').count(),fire:await mp.getByRole('button',{name:/fire/i}).count()};
    check('Mobile FPS game and controls',mobilePlay.canvas>0 && mobilePlay.fire>0,mobilePlay);
  }
  check('No mobile JS crashes',mobileErrors.length===0,mobileErrors);
  await mobile.close();
  const tablet=await browser.newContext({viewport:{width:820,height:1180},isMobile:true,hasTouch:true});
  const tp=await tablet.newPage();
  await tp.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
  await tp.waitForTimeout(600);
  check('Tablet game menu',await tp.getByRole('button',{name:/deploy\s*[—-]/i}).isVisible().catch(()=>false));
  await tablet.close();
} catch(e) {
  check('Test execution completed',false,String(e));
} finally {
  await browser.close();
  const failed=results.filter(r=>!r.pass);
  writeFileSync(out+'/pwa-qa-results.json',JSON.stringify({timestamp:new Date().toISOString(),base,checks:results,failed:failed.length},null,2));
  console.log('TOTAL '+results.length+'; FAIL '+failed.length);
  process.exitCode=failed.length?1:0;
}
