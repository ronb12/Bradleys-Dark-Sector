/**
 * Immersion polish smoke — facing, animations, compound, mission E, enemy weapons.
 * Usage: node qa-immersion-smoke.mjs  (dev server on :5173)
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173/";
const OUT = "qa-artifacts";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const report = { ok: false, checks: [], errors: [] };

page.on("pageerror", (err) => report.errors.push(String(err)));

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  const enter = page.getByRole("button", { name: /enter compound/i });
  await enter.click();
  await page.waitForFunction(
    () => (window.__darkSector?.enemies?.length || 0) >= 3,
    undefined,
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);

  const probe = await page.evaluate(() => {
    const s = window.__darkSector;
    if (!s) return { missing: true };
    const enemies = s.enemies || [];
    const animNames = (s.enemyAnimations || []).map((c) => c.name);
    const clipStates = {
      hasIdle: animNames.some((n) => /idle/i.test(n)),
      hasWalk: animNames.some((n) => /walk/i.test(n)),
      hasRun: animNames.some((n) => /run/i.test(n)),
      hasShoot: animNames.some((n) => /shoot|fire/i.test(n)),
      hasDeath: animNames.some((n) => /death|die/i.test(n)),
      hasHit: animNames.some((n) => /hit|react/i.test(n)),
      hasReload: animNames.some((n) => /reload/i.test(n)),
      hasAim: animNames.some((n) => /aim/i.test(n)),
      hasCrouch: animNames.some((n) => /crouch/i.test(n)),
    };
    const facingSample = enemies.slice(0, 5).map((e) => {
      const dx = s.player.position.x - e.position.x;
      const dz = s.player.position.z - e.position.z;
      const len = Math.hypot(dx, dz) || 1;
      // Local -Z after lookAt+PI (visual chest)
      const fz = { x: -Math.sin(e.rotation.y), z: -Math.cos(e.rotation.y) };
      // Local +Z
      const fp = { x: Math.sin(e.rotation.y), z: Math.cos(e.rotation.y) };
      const dotNegZ = (fz.x * dx + fz.z * dz) / len;
      const dotPosZ = (fp.x * dx + fp.z * dz) / len;
      return { dotNegZ, dotPosZ, best: Math.max(dotNegZ, dotPosZ) };
    });
    const facingOk =
      facingSample.length === 0 ||
      facingSample.filter((f) => f.best > 0.25).length >= Math.ceil(facingSample.length * 0.5);
    const scouts = enemies.filter((e) => e.userData?.enemyType === "Scout");
    return {
      missing: false,
      hasCombatFx: Boolean(s.combatFx),
      hasAtmosphere: Boolean(s.atmosphere),
      hasMission: Boolean(s.activeMission),
      enemyCount: enemies.length,
      enemiesWithWeapons: enemies.filter((e) => e.userData?.hasVisibleWeapon).length,
      scoutsWithPistol: scouts.filter((e) => e.userData?.enemyWeapon === "pistol").length,
      scoutCount: scouts.length,
      boneAttached: enemies.filter((e) => e.userData?.weaponBoneAttached).length,
      muzzleObjects: enemies.filter((e) => Boolean(e.userData?.muzzleObject)).length,
      coverPoints: s.coverPoints?.length || 0,
      squads: s.squads?.length || 0,
      audioHasFootstep: typeof s.audio?.playFootstep === "function",
      animCount: animNames.length,
      animNames,
      clipStates,
      facingSample,
      facingOk,
      fov: s.camera?.fov,
      settingsFov: s.settings?.fov,
    };
  });

  report.checks.push({ stage: "spawn", ...probe });

  await page.screenshot({ path: `${OUT}/immersion-compound.png`, fullPage: false });

  // Crouch + fire
  await page.keyboard.down("c");
  await page.waitForTimeout(200);
  await page.keyboard.up("c");
  await page.mouse.click(640, 360);
  await page.keyboard.press(" ");
  await page.waitForTimeout(500);

  // Force a structured mission for E-interact smoke (wave 2 template)
  const missionProbe = await page.evaluate(() => {
    const s = window.__darkSector;
    if (!s) return { missing: true };
    // Teleport near intel marker if present, else plant a secure_intel mission
    if (!s.activeMission || s.activeMission.type === "waves") {
      s.activeMission = {
        type: "secure_intel",
        title: "Secure Intel Cache",
        briefing: "Locate the uplink crate.",
        objectives: [
          { id: "reach", label: "Reach the intel cache", done: false },
          { id: "upload", label: "Upload intel", done: false },
          { id: "survive", label: "Survive", done: false },
        ],
        markers: [
          { id: "intel", x: s.player.position.x, z: s.player.position.z, radius: 3.2, kind: "interact" },
          { id: "upload", x: 0, z: 10, radius: 4, kind: "hold" },
        ],
        phase: 0,
        timerSec: 0,
        targetTimerSec: null,
        progress: 0,
        complete: false,
        failed: false,
        scoreBonus: 0,
      };
    } else {
      const m = s.activeMission.markers.find((x) => x.kind === "interact" || x.kind === "plant");
      if (m) {
        s.player.position.x = m.x;
        s.player.position.z = m.z;
      }
    }
    return {
      missionType: s.activeMission?.type,
      markerKinds: (s.activeMission?.markers || []).map((m) => m.kind),
    };
  });
  report.checks.push({ stage: "mission-setup", ...missionProbe });

  await page.waitForTimeout(400);
  await page.keyboard.down("e");
  await page.waitForTimeout(250);
  await page.keyboard.up("e");
  await page.waitForTimeout(500);

  const afterInteract = await page.evaluate(() => {
    const s = window.__darkSector;
    const obj0 = s?.activeMission?.objectives?.[0];
    return {
      interactPulseHandled: obj0 ? obj0.done === true || obj0.id === "reach" : false,
      objective0Done: obj0?.done ?? null,
      objectiveLabel: obj0?.label ?? null,
      fxParticles: s?.combatFx?.particles?.length ?? -1,
      crouching: s?.crouching ?? null,
      animPlaying: (s?.enemies || []).slice(0, 2).map((e) => e.userData?.currentClipName || e.userData?.animState || null),
    };
  });
  report.checks.push({ stage: "after-interact", ...afterInteract });

  // Screenshot again after mission UI
  await page.screenshot({ path: `${OUT}/immersion-mission.png`, fullPage: false });

  const facingOk = Boolean(probe.facingOk);

  const weaponsOk =
    probe.enemiesWithWeapons > 0 &&
    probe.muzzleObjects > 0 &&
    (probe.scoutCount === 0 || probe.scoutsWithPistol === probe.scoutCount);

  const animOk =
    probe.clipStates?.hasIdle &&
    probe.clipStates?.hasWalk &&
    probe.clipStates?.hasShoot &&
    probe.clipStates?.hasDeath;

  report.ok =
    !probe.missing &&
    probe.hasCombatFx &&
    probe.hasAtmosphere &&
    probe.enemyCount > 0 &&
    probe.audioHasFootstep &&
    weaponsOk &&
    animOk &&
    facingOk &&
    probe.fov === probe.settingsFov &&
    afterInteract.objective0Done === true &&
    report.errors.length === 0;

  report.summary = {
    facingOk,
    weaponsOk,
    animOk,
    animCount: probe.animCount,
    boneAttached: probe.boneAttached,
    interactDone: afterInteract.objective0Done,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  report.errors.push(String(err));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
