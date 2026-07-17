import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
});

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("button", { name: /Enter compound/i }).click();
await page.waitForFunction(
  () => window.__darkSector?.running && window.__darkSector.enemies?.length,
  null,
  { timeout: 20_000 },
);

const setup = await page.evaluate(() => {
  const game = window.__darkSector;
  const enemy = game.enemies.find((candidate) => candidate.userData.alive);
  for (const candidate of game.enemies) {
    candidate.userData.cooldown = 999;
    candidate.userData.damage = 0;
  }
  enemy.position.set(game.player.position.x, enemy.userData.groundOffset || 0, game.player.position.z - 12);
  enemy.userData.range = 20;
  enemy.userData.damage = 11;
  enemy.userData.cooldown = 0;
  enemy.userData.magazine = 24;
  enemy.userData.lastSeenAt = performance.now();
  enemy.userData.burstShotsRemaining = 1;
  enemy.userData.burstShotTimer = 0;
  game.enemyVolleyCooldown = 0;
  return { health: game.health, enemyId: enemy.uuid };
});

await page.waitForFunction(
  () => window.__darkSector.bullets.some((bullet) => bullet.userData.enemyProjectile),
  null,
  { timeout: 8_000 },
);

await page.evaluate(() => {
  const game = window.__darkSector;
  const bullet = game.bullets.find((candidate) => candidate.userData.enemyProjectile);
  const Box3 = game.colliders[0].constructor;
  const Vector3 = game.player.position.constructor;
  const midpoint = bullet.position.clone().lerp(game.player.position.clone().add(new Vector3(0, 1.4, 0)), 0.5);
  game.colliders.push(new Box3(
    new Vector3(midpoint.x - 2, 0, midpoint.z - 0.35),
    new Vector3(midpoint.x + 2, 3, midpoint.z + 0.35),
  ));
});

await page.waitForTimeout(900);
const result = await page.evaluate((initialHealth) => {
  const game = window.__darkSector;
  return {
    initialHealth,
    finalHealth: game.health,
    enemyProjectilesRemaining: game.bullets.filter((bullet) => bullet.userData.enemyProjectile).length,
    impactParticles: game.combatFx.particles.length,
  };
}, setup.health);

result.pageErrors = pageErrors;
result.pass =
  result.finalHealth === result.initialHealth
  && result.enemyProjectilesRemaining === 0
  && result.impactParticles > 0
  && pageErrors.length === 0;

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.pass) process.exitCode = 1;
