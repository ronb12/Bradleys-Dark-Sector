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

await page.keyboard.press("2");
await page.waitForFunction(() => window.__darkSector.activeWeapon === "smg");
await page.waitForTimeout(180);
const ammoBefore = await page.evaluate(() => window.__darkSector.ammo);
await page.mouse.move(640, 400);
await page.mouse.down();
await page.waitForTimeout(220);
await page.mouse.up();
const fired = await page.evaluate((before) => window.__darkSector.ammo < before, ammoBefore);

await page.keyboard.press("g");
await page.waitForFunction(() => window.__darkSector.grenadesRemaining === 2);
const result = await page.evaluate(() => ({
  activeWeapon: window.__darkSector.activeWeapon,
  ammo: window.__darkSector.ammo,
  grenadesRemaining: window.__darkSector.grenadesRemaining,
  grenadeProjectiles: window.__darkSector.grenades.length,
  viewVisible: window.__darkSector.weaponViews.smg.visible,
}));

result.fired = fired;
result.pageErrors = pageErrors;
result.pass =
  result.activeWeapon === "smg"
  && result.fired
  && result.grenadesRemaining === 2
  && result.grenadeProjectiles > 0
  && result.viewVisible
  && pageErrors.length === 0;

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.pass) process.exitCode = 1;
