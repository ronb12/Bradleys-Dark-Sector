import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "qa-artifacts/enemy-tactics";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
});

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("button", { name: /Enter compound/i }).click();
await page.waitForFunction(
  () => window.__darkSector?.running && window.__darkSector.enemies?.some((enemy) => enemy.userData.alive),
  null,
  { timeout: 20_000 }
);

const setup = await page.evaluate(() => {
  const game = window.__darkSector;
  const target = game.enemies.find(
    (enemy) => enemy.userData.alive && enemy.userData.enemyType !== "Scout"
  );
  if (!target) throw new Error("No ranged enemy available");

  for (const enemy of game.enemies) enemy.userData.damage = 0.0001;

  const yaw = game.yaw;
  target.position.set(
    game.player.position.x + Math.sin(yaw) * 9,
    target.userData.groundOffset || 0,
    game.player.position.z - Math.cos(yaw) * 9
  );
  target.userData.cooldown = 0;
  target.userData.lastSeenAt = performance.now();
  game.enemyVolleyCooldown = 0;
  game.pitch = -0.06;
  return {
    type: target.userData.enemyType,
    uuid: target.uuid,
    preferredDistance: target.userData.preferredDistance,
    minimumDistance: target.userData.minimumDistance,
  };
});

const samples = [];
let shotCount = 0;
let previousFlash = 0;
let misalignedShots = 0;
for (let index = 0; index < 120; index += 1) {
  await page.waitForTimeout(60);
  const sample = await page.evaluate((uuid) => {
    const game = window.__darkSector;
    game.health = 100;
    const enemy = game.enemies.find((candidate) => candidate.uuid === uuid);
    const muzzle = enemy.userData.muzzleObject;
    muzzle?.updateWorldMatrix(true, false);
    const matrix = muzzle?.matrixWorld?.elements;
    const distance = Math.hypot(
      enemy.position.x - game.player.position.x,
      enemy.position.z - game.player.position.z
    );
    return {
      distance,
      flash: enemy.userData.muzzleFlashUntil || 0,
      x: enemy.position.x,
      z: enemy.position.z,
      intent: enemy.userData.aiIntent,
      turnError: enemy.userData.turnError || 0,
      motionSpeed: enemy.userData.motionSpeed || 0,
      muzzleOffset: matrix
        ? Math.hypot(matrix[12] - enemy.position.x, matrix[13] - enemy.position.y, matrix[14] - enemy.position.z)
        : 0,
    };
  }, setup.uuid);
  if (sample.flash > previousFlash) {
    shotCount += 1;
    if (sample.turnError > 0.22 || sample.motionSpeed > 1.1) misalignedShots += 1;
  }
  previousFlash = sample.flash;
  samples.push(sample);
}

await page.evaluate((uuid) => {
  const game = window.__darkSector;
  const enemy = game.enemies.find((candidate) => candidate.uuid === uuid);
  const yaw = game.yaw;
  enemy.position.set(
    game.player.position.x + Math.sin(yaw) * 2.5,
    enemy.userData.groundOffset || 0,
    game.player.position.z - Math.cos(yaw) * 2.5
  );
}, setup.uuid);
await page.waitForTimeout(3_600);
const closeRecoveryDistance = await page.evaluate((uuid) => {
  const game = window.__darkSector;
  const enemy = game.enemies.find((candidate) => candidate.uuid === uuid);
  return Math.hypot(
    enemy.position.x - game.player.position.x,
    enemy.position.z - game.player.position.z
  );
}, setup.uuid);

const visuals = await page.evaluate(() => {
  const game = window.__darkSector;
  let irMarkers = 0;
  let emissiveMaterials = 0;
  let standardMaterials = 0;
  for (const enemy of game.enemies) {
    enemy.traverse((child) => {
      if (child.userData?.irMarker || child.userData?.irBeacon) irMarkers += 1;
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial) {
          standardMaterials += 1;
          if ((material.emissiveIntensity || 0) > 0.01) emissiveMaterials += 1;
        }
      }
    });
  }
  return { irMarkers, emissiveMaterials, standardMaterials };
});

await page.screenshot({ path: `${outDir}/matte-standoff.png`, fullPage: true });

const distances = samples.map((sample) => sample.distance);
const pathLength = samples.slice(1).reduce((sum, sample, index) => {
  const previous = samples[index];
  return sum + Math.hypot(sample.x - previous.x, sample.z - previous.z);
}, 0);
const maxSampleStep = Math.max(
  ...samples.slice(1).map((sample, index) =>
    Math.hypot(sample.x - samples[index].x, sample.z - samples[index].z)
  )
);
const observedIntents = [...new Set(samples.map((sample) => sample.intent).filter(Boolean))];
const result = {
  setup,
  minimumObservedDistance: Math.min(...distances),
  maximumObservedDistance: Math.max(...distances),
  finalDistance: distances.at(-1),
  pathLength,
  maxSampleStep,
  observedIntents,
  shotCount,
  misalignedShots,
  minimumTurnError: Math.min(...samples.map((sample) => sample.turnError)),
  minimumMotionSpeed: Math.min(...samples.map((sample) => sample.motionSpeed)),
  maxMuzzleOffset: Math.max(...samples.map((sample) => sample.muzzleOffset)),
  closeRecoveryDistance,
  visuals,
  pageErrors,
  pass:
    Math.min(...distances) > 4
    && shotCount > 0
    && misalignedShots === 0
    && maxSampleStep < 0.75
    && Math.max(...samples.map((sample) => sample.muzzleOffset)) > 0.15
    && closeRecoveryDistance > 4
    && visuals.irMarkers === 0
    && visuals.emissiveMaterials === 0
    && pageErrors.length === 0,
};

writeFileSync(`${outDir}/report.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.pass) process.exitCode = 1;
