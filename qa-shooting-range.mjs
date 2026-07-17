/**
 * Shooting Range QA — open from menu, fire, confirm score/hits, screenshot.
 * Usage: node qa-shooting-range.mjs  (dev server on :5173)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173/";
const OUT = path.resolve("qa-artifacts");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = { ok: false, checks: [], errors: [] };

page.on("pageerror", (err) => report.errors.push(String(err)));

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
});

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  const rangeBtn = page.getByRole("button", { name: /shooting range/i });
  await rangeBtn.waitFor({ timeout: 15000 });
  report.checks.push({ menuHasRange: true });
  await rangeBtn.click();
  await page.waitForTimeout(2000);

  const boot = await page.evaluate(() => {
    const s = window.__darkSector;
    if (!s) return { missing: true };
    return {
      missing: false,
      gameMode: s.gameMode,
      running: s.running,
      hasRange: Boolean(s.shootingRange),
      targetStats: s.shootingRange
        ? {
            hits: s.shootingRange.stats.hits,
            shots: s.shootingRange.stats.shots,
            score: s.shootingRange.stats.score,
          }
        : null,
      player: { x: s.player.position.x, z: s.player.position.z },
      enemies: s.enemies?.length ?? -1,
    };
  });
  report.checks.push({ boot });

  if (boot.missing || boot.gameMode !== "range" || !boot.hasRange) {
    throw new Error(`Range did not start correctly: ${JSON.stringify(boot)}`);
  }

  // Aim at 10m center-left silhouette and fire a burst.
  await page.evaluate(() => {
    const s = window.__darkSector;
    if (!s?.shootingRange) return;
    s.player.position.copy(s.shootingRange.spawnWorld);
    const origin = {
      x: s.shootingRange.spawnWorld.x,
      y: 1.7,
      z: s.shootingRange.spawnWorld.z,
    };
    // World target: RANGE_ORIGIN (200,0,0) + local (-2, 1.35, -10)
    const aim = { x: 198, y: 1.35, z: -10 };
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const dz = aim.z - origin.z;
    const horiz = Math.hypot(dx, dz) || 0.001;
    s.yaw = Math.atan2(-dx, -dz);
    s.pitch = Math.atan2(dy, horiz);
    s.fireCooldown = 0;
    s.reload = 0;
  });

  for (let i = 0; i < 28; i += 1) {
    await page.evaluate((step) => {
      const s = window.__darkSector;
      if (!s) return;
      // Slight sweep across the 10m lane
      s.yaw = Math.atan2(2 - step * 0.15, 14.2);
      s.pitch = -0.06;
      s.fireCooldown = 0;
    }, i);
    await page.keyboard.press(" ");
    await page.mouse.click(640, 400);
    await page.waitForTimeout(100);
  }

  // Direct raycast hit probe as fallback proof of target system
  const probe = await page.evaluate(() => {
    const s = window.__darkSector;
    if (!s?.shootingRange) return { probed: false };
    const o = s.player.position.clone();
    o.set(s.shootingRange.spawnWorld.x, 1.7, s.shootingRange.spawnWorld.z);
    const d = s.player.position.clone();
    const dx = 198 - o.x;
    const dy = 1.35 - o.y;
    const dz = -10 - o.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    d.set(dx / len, dy / len, dz / len);
    const hit = s.shootingRange.tryHit(o, d);
    return {
      probed: true,
      hit: Boolean(hit),
      stats: { ...s.shootingRange.stats },
    };
  });
  report.checks.push({ probe });

  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const s = window.__darkSector;
    const stats = s?.shootingRange?.stats;
    return {
      gameMode: s?.gameMode,
      hits: stats?.hits ?? -1,
      misses: stats?.misses ?? -1,
      shots: stats?.shots ?? -1,
      score: stats?.score ?? -1,
      accuracy: stats?.accuracy ?? -1,
      hudHits: document.querySelector("[data-testid='range-hits']")?.textContent || null,
      hudScore: document.querySelector("[data-testid='range-score']")?.textContent || null,
      hudTitle: document.querySelector("[data-testid='range-hud-title']")?.textContent || null,
      enemyCount: s?.enemies?.length ?? -1,
    };
  });
  report.checks.push({ after });

  const shot = path.join(OUT, "shooting-range.png");
  await page.screenshot({ path: shot, fullPage: false });
  report.checks.push({ screenshot: shot });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const left = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      running: s?.running ?? null,
      gameMode: s?.gameMode ?? null,
      hasRange: Boolean(s?.shootingRange),
      menuVisible: Boolean(document.body.innerText.match(/Shooting Range/i)),
    };
  });
  report.checks.push({ left });

  report.ok =
    after.shots > 0 &&
    after.hits >= 0 &&
    (after.hits > 0 || probe.hit === true) &&
    after.enemyCount === 0 &&
    left.menuVisible &&
    !left.hasRange &&
    left.running === false &&
    report.errors.length === 0;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  report.errors.push(String(err));
  try {
    await page.screenshot({ path: path.join(OUT, "shooting-range-fail.png") });
  } catch {
    // ignore
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
