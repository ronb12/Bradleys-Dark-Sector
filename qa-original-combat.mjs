import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const out = "/Volumes/YOTUO/DarkSector-PWA-QA";
mkdirSync(out,{recursive:true});
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173/";
const chrome = "/Users/ronellbradley/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:["--enable-webgl","--use-gl=angle","--use-angle=metal","--enable-unsafe-swiftshader"]});
const findings=[];
const test=(name,pass,detail)=>{findings.push({name,pass:!!pass,detail});console.log((pass?"PASS ":"FAIL ")+name+" "+JSON.stringify(detail).slice(0,300));};
try {
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.addInitScript(()=>{HTMLElement.prototype.requestPointerLock=()=>Promise.resolve();});
  await page.goto(base,{waitUntil:"domcontentloaded",timeout:40000});
  await page.getByRole("button",{name:/deploy\s*[—-]/i}).click({timeout:20000});
  await page.waitForFunction(()=>window.__darkSector?.running&&window.__darkSector?.enemies?.length>0,
    null,{timeout:20000});
  const start=await page.evaluate(()=>{
    const g=window.__darkSector;
    const alive=g.enemies.filter(e=>e.userData.alive);
    const scenic=[];
    g.scene.traverse(o=>{if(o.userData?.darkSectorOriginal)scenic.push(o.name);});
    return {
      wave:g.wave,
      enemies:alive.length,
      originals:alive.filter(e=>e.userData.modelType==="original-soldier"&&e.userData.darkSectorOriginal).length,
      weaponOriginals:alive.filter(e=>e.getObjectByName("EnemyWeaponVisual")?.userData?.darkSectorOriginal).length,
      classes:[...new Set(alive.map(e=>e.userData.soldierClass))],
      limbRigs:alive.filter(e=>e.userData.limbs?.lArm&&e.userData.limbs?.rLeg&&e.userData.limbs?.head).length,
      positions:alive.map(e=>({uuid:e.uuid,x:e.position.x,z:e.position.z})),
      environment:scenic.filter(n=>/DarkSector\//.test(n)).sort(),
      ammo:g.ammo,
    };
  });
  test("Five distinct original enemy classes in wave",start.classes.length===5,start.classes);
  test("Every combat enemy uses an original soldier",start.enemies>0&&start.originals===start.enemies,{enemies:start.enemies,originals:start.originals});
  test("Every original enemy has an original weapon",start.weaponOriginals===start.enemies,start.weaponOriginals);
  test("Every enemy has animated joints",start.limbRigs===start.enemies,start.limbRigs);
  test("Original checkpoint, equipment and floodlights in scene",
    start.environment.some(n=>n.includes("SecurityGateSign"))&&
    start.environment.some(n=>n.includes("TacticalFloodlight"))&&
    start.environment.some(n=>n.includes("FieldGenerator")),
    start.environment);
  await page.waitForTimeout(1500);
  const moved=await page.evaluate(previous=>{
    const g=window.__darkSector;
    return {
      progressed:g.enemies.some(e=>{
        const p=previous.find(x=>x.uuid===e.uuid);
        return p&&Math.hypot(p.x-e.position.x,p.z-e.position.z)>0.08;
      }),
      muzzleFinite:g.enemies.every(e=>{
        const pos=e.userData.muzzleObject?.getWorldPosition?.(e.position.clone());
        return !pos||[pos.x,pos.y,pos.z].every(Number.isFinite);
      }),
      animationState:g.enemies.some(e=>Math.abs(e.userData?.limbs?.lLeg?.rotation?.x||0)>0.03),
      errors:[],
    };
  },start.positions);
  test("Enemy squads change position during live combat",moved.progressed,moved);
  test("Enemy muzzle positions remain finite",moved.muzzleFinite,moved.muzzleFinite);
  test("Original soldier leg animations update",moved.animationState,moved.animationState);
  const mounts=await page.evaluate(()=>{
    const alive=window.__darkSector.enemies.filter(e=>e.userData.alive);
    return {
      total:alive.length,
      animated:alive.filter(e=>
        e.userData.weaponAttachmentMode==="animated-rifle-joint" &&
        e.getObjectByName("EnemyWeaponKit")?.parent===e.userData.limbs?.rifle &&
        e.userData.limbs.rifle.visible &&
        e.userData.muzzleObject?.parent?.name==="EnemyPrimaryWeapon"
      ).length,
      raisedArms:alive.filter(e=>e.userData.limbs?.lArm.rotation.x>0.2 &&
        e.userData.limbs?.rArm.rotation.x>0.2).length,
      originalSidearms:alive.filter(e=>{
        const h=e.getObjectByName("EnemySidearm");
        return !h || h.userData.darkSectorOriginal===true;
      }).length,
    };
  });
  test("Every enemy rifle follows its animated weapon joint",
    mounts.total>0 && mounts.animated===mounts.total,mounts);
  test("Enemy arms support first-person-visible rifle positions",
    mounts.raisedArms>=Math.floor(mounts.total/2),mounts.raisedArms);
  test("Holstered enemy sidearms use original assets",
    mounts.originalSidearms===mounts.total,mounts.originalSidearms);
  const initialAmmo=await page.evaluate(()=>window.__darkSector?.ammo??-1);
  await page.keyboard.press(" ");
  await page.waitForTimeout(150);
  const finalAmmo=await page.evaluate(()=>window.__darkSector?.ammo??-1);
  test("Player firing consumes ammunition",finalAmmo<initialAmmo,{initialAmmo,finalAmmo});
  test("No browser JavaScript exceptions",errors.length===0,errors);
  await page.close();
}catch(e){test("QA completed without errors",false,String(e));}
finally {
  await browser.close();
  writeFileSync(out+"/original-combat-qa.json",JSON.stringify({base,when:new Date().toISOString(),findings},null,2));
  console.log("TOTAL "+findings.length+" FAIL "+findings.filter(f=>!f.pass).length);
  if(findings.some(f=>!f.pass))process.exitCode=1;
}
