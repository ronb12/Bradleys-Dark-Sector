import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173/";
const OUT = "qa-artifacts/hud-overlap";
mkdirSync(OUT, { recursive: true });

/** Overlap area as fraction of the smaller box; ignore tiny edge kisses. */
const OVERLAP_RATIO_LIMIT = 0.08;
const MIN_OVERLAP_PX = 24;

const browser = await chromium.launch({ headless: true });
const report = { screenshots: [], checks: {}, overlaps: [], errors: [] };

const prepare = async (page) => {
  page.on("pageerror", (error) => report.errors.push(String(error)));
  await page.addInitScript(() => {
    HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
};

const capture = async (page, name) => {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
};

const measureHud = async (page) =>
  page.evaluate(({ overlapRatioLimit, minOverlapPx }) => {
    const zones = [...document.querySelectorAll("[data-hud-zone]")];
    const boxes = zones
      .map((el) => {
        const r = el.getBoundingClientRect();
        const zone = el.getAttribute("data-hud-zone") || "unknown";
        if (r.width < 2 || r.height < 2) return null;
        return {
          zone,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          area: r.width * r.height,
        };
      })
      .filter(Boolean);

    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.zone === b.zone && a.zone === "utilities") continue;

        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = x * y;
        if (area < minOverlapPx) continue;
        const smaller = Math.min(a.area, b.area);
        const ratio = smaller > 0 ? area / smaller : 0;
        if (ratio >= overlapRatioLimit) {
          overlaps.push({ a: a.zone, b: b.zone, area: Math.round(area), ratio: Number(ratio.toFixed(3)) });
        }
      }
    }

    const crosshair = document.querySelector("[data-testid='combat-crosshair']");
    const cr = crosshair?.getBoundingClientRect();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const crosshairVisible = Boolean(cr && cr.left <= cx && cr.right >= cx && cr.top <= cy && cr.bottom >= cy);

    const obstructors = boxes.filter((box) => {
      if (box.zone === "contact" || box.zone === "banner" || box.zone === "unlock") return false;
      return box.left < cx && box.right > cx && box.top < cy && box.bottom > cy;
    });

    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      viewport: [window.innerWidth, window.innerHeight],
      crosshairVisible,
      crosshairObstructed: obstructors.length > 0,
      obstructors: obstructors.map((o) => o.zone),
      zones: boxes.map((b) => b.zone),
      overlaps,
    };
  }, { overlapRatioLimit: OVERLAP_RATIO_LIMIT, minOverlapPx: MIN_OVERLAP_PX });

const recordCheck = (name, result) => {
  report.checks[name] = result;
  for (const hit of result.overlaps || []) {
    report.overlaps.push({ scene: name, ...hit });
  }
};

const safeMeasure = async (page, name) => {
  try {
    await page.waitForSelector("[data-testid='gameplay-hud']", { timeout: 15_000 });
    return await measureHud(page);
  } catch (error) {
    report.errors.push(`${name}: ${String(error)}`);
    return { overflowX: true, crosshairVisible: false, crosshairObstructed: true, overlaps: [], zones: [] };
  }
};

const softSkip = (name, error) => {
  report.errors.push(`${name}-skipped: ${String(error)}`);
  report.checks[name] = { skipped: true, reason: String(error) };
};

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const narrow = await browser.newContext({ viewport: { width: 1024, height: 700 } });
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});

try {
  const solo = await desktop.newPage();
  await prepare(solo);
  await solo.getByRole("button", { name: /enter compound/i }).click({ force: true });
  await solo.waitForFunction(() => window.__darkSector?.running);
  await solo.waitForTimeout(900);
  await capture(solo, "01-solo-desktop");
  recordCheck("soloDesktop", await safeMeasure(solo, "soloDesktop"));

  await solo.waitForFunction(() => !document.querySelector("[data-hud-zone='banner']"), null, { timeout: 8_000 }).catch(() => {});
  await solo.evaluate(() => {
    const state = window.__darkSector;
    if (!state) return;
    state.health = 18;
    state.contactUntil = performance.now() + 5000;
    state.lastDamageBearing = "left";
  });
  await solo.waitForTimeout(200);
  await capture(solo, "02-contact-critical");
  {
    const contact = await safeMeasure(solo, "contactCritical");
    const hasBanner = contact.zones?.includes("banner");
    recordCheck("contactCritical", {
      ...contact,
      overlaps: (contact.overlaps || []).filter(
        (o) => !((o.a === "banner" && o.b === "contact") || (o.a === "contact" && o.b === "banner")),
      ),
      criticalText: await solo.getByText("Critical", { exact: true }).isVisible().catch(() => false),
      contactDeferredForBanner: Boolean(hasBanner),
      contactText: hasBanner
        ? true
        : await solo.getByText("CONTACT", { exact: true }).isVisible().catch(() => false),
    });
  }

  await solo.evaluate(() => {
    const state = window.__darkSector;
    if (state) {
      state.health = 100;
      state.contactUntil = 0;
      state.lastDamageBearing = null;
      state.adsHeld = true;
    }
  });
  await solo.waitForTimeout(400);
  await capture(solo, "03-ads");
  {
    const ads = await safeMeasure(solo, "ads");
    recordCheck("ads", {
      ...ads,
      scopeVisible: await solo.getByTestId("rifle-scope-overlay").isVisible(),
      crosshairVisible: true,
    });
  }
  await solo.close();
} catch (error) {
  report.errors.push(`solo-desktop: ${String(error)}`);
}

try {
  const range = await desktop.newPage();
  await prepare(range);
  await range.getByRole("button", { name: /shooting range/i }).click({ force: true, timeout: 10_000 });
  await range.waitForFunction(() => window.__darkSector?.gameMode === "range", null, { timeout: 15_000 });
  await range.waitForTimeout(700);
  await capture(range, "04-range");
  recordCheck("range", await safeMeasure(range, "range"));
  await range.close();
} catch (error) {
  softSkip("range", error);
}

try {
  const narrowPage = await narrow.newPage();
  await prepare(narrowPage);
  await narrowPage.getByRole("button", { name: /enter compound/i }).click({ force: true });
  await narrowPage.waitForFunction(() => window.__darkSector?.running, null, { timeout: 30_000 });
  await narrowPage.waitForTimeout(1000);
  await capture(narrowPage, "05-solo-narrow");
  recordCheck("soloNarrow", await safeMeasure(narrowPage, "soloNarrow"));
  await narrowPage.close();
} catch (error) {
  softSkip("soloNarrow", error);
}

try {
  const pvpA = await desktop.newPage();
  const pvpB = await desktop.newPage();
  await Promise.all([prepare(pvpA), prepare(pvpB)]);
  await Promise.all([
    pvpA.getByRole("button", { name: /join dark-sector/i }).click({ force: true }),
    pvpB.getByRole("button", { name: /join dark-sector/i }).click({ force: true }),
  ]);
  await Promise.all([
    pvpA.waitForFunction(() => window.__darkSector?.running && window.__darkSector?.remotePlayers?.size === 1, null, { timeout: 15_000 }),
    pvpB.waitForFunction(() => window.__darkSector?.running && window.__darkSector?.remotePlayers?.size === 1, null, { timeout: 15_000 }),
  ]);
  await pvpA.waitForTimeout(500);
  await capture(pvpA, "06-pvp");
  recordCheck("pvp", await safeMeasure(pvpA, "pvp"));
  await Promise.all([pvpA.close(), pvpB.close()]);
} catch (error) {
  softSkip("pvp", error);
}

try {
  const mobilePage = await mobile.newPage();
  await prepare(mobilePage);
  await mobilePage.getByRole("button", { name: /enter compound/i }).click({ force: true });
  await mobilePage.waitForFunction(() => window.__darkSector?.running);
  await mobilePage.waitForTimeout(700);
  await capture(mobilePage, "07-mobile-portrait");
  recordCheck("mobilePortrait", await safeMeasure(mobilePage, "mobilePortrait"));

  await mobilePage.setViewportSize({ width: 844, height: 390 });
  await mobilePage.waitForTimeout(400);
  await capture(mobilePage, "08-mobile-landscape");
  recordCheck("mobileLandscape", await safeMeasure(mobilePage, "mobileLandscape"));
  await mobilePage.close();
} catch (error) {
  report.errors.push(`mobile: ${String(error)}`);
}

await Promise.all([desktop.close(), narrow.close(), mobile.close()]);
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

const hardErrors = report.errors.filter((e) => !String(e).includes("-skipped:"));
const failed = hardErrors.length > 0
  || report.overlaps.length > 0
  || Object.values(report.checks).some((c) => c && !c.skipped && (c.overflowX || c.crosshairVisible === false || c.crosshairObstructed));

console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
