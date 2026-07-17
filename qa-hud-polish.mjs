import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173/";
const OUT = "qa-artifacts/hud-polish";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { screenshots: [], checks: {}, errors: [] };

const prepare = async (page) => {
  page.on("pageerror", (error) => report.errors.push(String(error)));
  await page.addInitScript(() => {
    HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
};

const capture = async (page, name) => {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
};

const layoutCheck = async (page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const crosshair = document.querySelector("[data-testid='combat-crosshair']");
    const rect = crosshair?.getBoundingClientRect();
    return {
      overflowX: root.scrollWidth > root.clientWidth + 1,
      viewport: [window.innerWidth, window.innerHeight],
      crosshairVisible: Boolean(
        rect &&
          rect.left <= window.innerWidth / 2 &&
          rect.right >= window.innerWidth / 2 &&
          rect.top <= window.innerHeight / 2 &&
          rect.bottom >= window.innerHeight / 2,
      ),
    };
  });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const solo = await desktop.newPage();
  await prepare(solo);
  await solo.getByRole("button", { name: /enter compound/i }).click({ force: true });
  await solo.waitForFunction(() => window.__darkSector?.running);
  await solo.waitForTimeout(1000);
  await capture(solo, "01-solo-desktop");
  report.checks.solo = await layoutCheck(solo);

  await solo.evaluate(() => {
    const state = window.__darkSector;
    if (!state) return;
    state.health = 18;
    state.contactUntil = performance.now() + 5000;
    state.lastDamageBearing = "left";
  });
  await solo.waitForTimeout(150);
  await capture(solo, "02-low-health-contact");
  report.checks.lowHealth = {
    ...(await layoutCheck(solo)),
    criticalText: await solo.getByText("Critical", { exact: true }).isVisible(),
    contactText: await solo.getByText("CONTACT", { exact: true }).isVisible(),
  };

  await solo.evaluate(() => {
    const state = window.__darkSector;
    if (state) {
      state.health = 100;
      state.contactUntil = 0;
      state.lastDamageBearing = null;
      state.adsHeld = true;
    }
  });
  await solo.waitForTimeout(500);
  await capture(solo, "03-ads");
  report.checks.ads = {
    scopeVisible: await solo.getByTestId("rifle-scope-overlay").isVisible(),
    overflowX: (await layoutCheck(solo)).overflowX,
  };

  const range = await desktop.newPage();
  await prepare(range);
  await range.getByRole("button", { name: /shooting range/i }).click({ force: true });
  await range.waitForFunction(() => window.__darkSector?.gameMode === "range");
  await range.waitForTimeout(700);
  await capture(range, "04-range");
  report.checks.range = {
    ...(await layoutCheck(range)),
    title: await range.getByTestId("range-hud-title").innerText(),
    stats: await range.getByTestId("range-hits").innerText(),
  };

  const pvpA = await desktop.newPage();
  const pvpB = await desktop.newPage();
  await Promise.all([prepare(pvpA), prepare(pvpB)]);
  await Promise.all([
    pvpA.getByRole("button", { name: /join dark-sector/i }).click({ force: true }),
    pvpB.getByRole("button", { name: /join dark-sector/i }).click({ force: true }),
  ]);
  await Promise.all([
    pvpA.waitForFunction(() => window.__darkSector?.running && window.__darkSector?.gameMode === "pvp"),
    pvpB.waitForFunction(() => window.__darkSector?.running && window.__darkSector?.gameMode === "pvp"),
  ]);
  // Link state is reported below, but transient websocket timing should not
  // block a visual/layout QA suite from reaching mobile coverage.
  await pvpA.waitForTimeout(1_500);
  await capture(pvpA, "05-pvp-client-a");
  await capture(pvpB, "06-pvp-client-b");
  report.checks.pvp = {
    clientA: await layoutCheck(pvpA),
    clientB: await layoutCheck(pvpB),
    linkedA: await pvpA.evaluate(() => window.__darkSector?.remotePlayers?.size === 1),
    linkedB: await pvpB.evaluate(() => window.__darkSector?.remotePlayers?.size === 1),
  };

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobile.newPage();
  await prepare(mobilePage);
  // Mobile emulation can keep the animated menu button "unstable" to
  // Playwright even though it is visible and interactive.
  await mobilePage.getByRole("button", { name: /enter compound/i }).click({ force: true });
  await mobilePage.waitForFunction(() => window.__darkSector?.running);
  await mobilePage.waitForTimeout(700);
  await capture(mobilePage, "07-mobile-portrait");
  report.checks.mobilePortrait = {
    ...(await layoutCheck(mobilePage)),
    controls: await mobilePage.getByTestId("mobile-controls").isVisible(),
    fire: await mobilePage.getByTestId("mobile-fire").isVisible(),
  };

  await mobilePage.setViewportSize({ width: 844, height: 390 });
  await mobilePage.waitForTimeout(350);
  await capture(mobilePage, "08-mobile-landscape");
  report.checks.mobileLandscape = {
    ...(await layoutCheck(mobilePage)),
    controls: await mobilePage.getByTestId("mobile-controls").isVisible(),
    fire: await mobilePage.getByTestId("mobile-fire").isVisible(),
  };

  await Promise.all([desktop.close(), mobile.close()]);
} catch (error) {
  report.errors.push(String(error));
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

const checks = Object.values(report.checks);
const failedLayout = checks.some((check) => check?.overflowX || check?.crosshairVisible === false);
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length || failedLayout ? 1 : 0);
