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
await page.waitForFunction(() => window.__darkSector?.running, null, { timeout: 20_000 });

await page.evaluate(() => {
  const game = window.__darkSector;
  for (const enemy of game.enemies) enemy.userData.alive = false;
});
await page.waitForFunction(
  () => window.__darkSector.wave === 2 && window.__darkSector.activeMission?.type === "breach_secure",
  null,
  { timeout: 12_000 },
);

const setup = await page.evaluate(() => {
  const game = window.__darkSector;
  const destructibleKinds = [...new Set(game.destruction.props.map((prop) => prop.kind))];
  const windowProp = game.destruction.props.find((prop) => prop.kind === "window");
  const colliderCountBefore = game.colliders.length;
  game.destruction.damageAt(windowProp.mesh.position.clone(), 100);

  game.player.position.set(48, 0, -18);
  return {
    destructibleKinds,
    destructibleCount: game.destruction.props.length,
    windowDestroyed: windowProp.destroyed && !windowProp.mesh.visible,
    colliderRemoved: game.colliders.length === colliderCountBefore - 1,
    indoorCoverPoints: game.coverPoints.filter((point) => point.x > 41 && point.x < 55 && point.z > -23 && point.z < 0).length,
  };
});
await page.waitForFunction(() => window.__darkSector.activeMission?.objectives[0]?.done);

await page.evaluate(() => {
  const game = window.__darkSector;
  game.player.position.set(48, 0, -7);
  game.interactPulse = true;
});
await page.waitForFunction(() => window.__darkSector.activeMission?.objectives[1]?.done);
await page.evaluate(() => {
  const game = window.__darkSector;
  for (const enemy of game.enemies) enemy.userData.alive = false;
});
await page.waitForFunction(
  () => window.__darkSector.wave >= 3,
  null,
  { timeout: 8_000 },
);
const result = await page.evaluate((values) => {
  const game = window.__darkSector;
  return {
    missionType: game.activeMission.type,
    wave: game.wave,
    enemiesAlive: game.enemies.filter((enemy) => enemy.userData.alive).length,
    objectives: game.activeMission.objectives.map((objective) => ({ ...objective })),
    entered: true,
    breached: true,
    completed: game.wave >= 3,
    ...values,
  };
}, setup);

result.pageErrors = pageErrors;
result.pass =
  result.wave >= 3
  && result.entered
  && result.breached
  && result.completed
  && result.destructibleKinds.includes("window")
  && result.destructibleKinds.includes("light")
  && result.destructibleKinds.includes("crate")
  && result.windowDestroyed
  && result.colliderRemoved
  && result.indoorCoverPoints > 0
  && pageErrors.length === 0;

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.pass) process.exitCode = 1;
