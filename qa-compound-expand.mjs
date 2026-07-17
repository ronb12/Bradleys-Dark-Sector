/**
 * Quick Solo compound size + cover sanity check.
 * Expects vite on 127.0.0.1:4174 (or COMPOUND_QA_URL).
 */
import { chromium } from "playwright";

const URL = process.env.COMPOUND_QA_URL || "http://127.0.0.1:4174/";
const BEFORE = { wall: 42, enclosed: 84, spawnHalf: 34 };
const AFTER = { wall: 60, enclosed: 120, spawnHalf: 50 };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (err) => console.error("PAGEERROR", err));
await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
});
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
await page.getByRole("button", { name: /enter compound/i }).click({ force: true });
await page.waitForFunction(() => window.__darkSector?.running, null, { timeout: 20000 });
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  const s = window.__darkSector;
  if (!s) return { error: "no __darkSector" };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const box of s.colliders || []) {
    minX = Math.min(minX, box.min.x);
    maxX = Math.max(maxX, box.max.x);
    minZ = Math.min(minZ, box.min.z);
    maxZ = Math.max(maxZ, box.max.z);
  }
  const halfX = Math.max(Math.abs(minX), Math.abs(maxX));
  const halfZ = Math.max(Math.abs(minZ), Math.abs(maxZ));
  return {
    colliderHalfX: Number(halfX.toFixed(1)),
    colliderHalfZ: Number(halfZ.toFixed(1)),
    colliderCount: s.colliders?.length ?? 0,
    coverPoints: s.coverPoints?.length ?? 0,
    enemies: (s.enemies || []).filter((e) => e.userData?.alive).length,
    playerStart: { x: s.player.position.x, z: s.player.position.z },
  };
});

const okWall =
  report.colliderHalfX >= AFTER.wall - 2 && report.colliderHalfZ >= AFTER.wall - 2;
const okLarger =
  report.colliderHalfX > BEFORE.wall && report.colliderHalfZ > BEFORE.wall;
const okCover = report.coverPoints > 48;

console.log(
  JSON.stringify(
    {
      before: BEFORE,
      afterTarget: AFTER,
      report,
      checks: {
        largerThanBefore: okLarger,
        nearWall60: okWall,
        coverAboveLegacyCap: okCover,
      },
      pass: Boolean(okLarger && okWall && okCover && !report.error),
    },
    null,
    2
  )
);

await browser.close();
process.exit(okLarger && okWall && okCover && !report.error ? 0 : 1);
