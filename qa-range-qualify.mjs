/**
 * Range qualification QA — challenge attempt isolation, result panel, badge persistence.
 * Usage: node qa-range-qualify.mjs  (dev server on :5173)
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
  try {
    localStorage.removeItem("bds-range-best-30s");
    localStorage.removeItem("bds-range-best-badge");
    localStorage.removeItem("bds-range-unlocked-badges");
  } catch {
    // ignore
  }
});

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /shooting range/i }).click();
  await page.waitForTimeout(1800);

  const boot = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      gameMode: s?.gameMode,
      hasRange: Boolean(s?.shootingRange),
    };
  });
  report.checks.push({ boot });
  if (boot.gameMode !== "range" || !boot.hasRange) {
    throw new Error(`Range boot failed: ${JSON.stringify(boot)}`);
  }

  // Free-fire pollution: register hits/misses before T so challenge must ignore them.
  const polluted = await page.evaluate(() => {
    const s = window.__darkSector;
    const range = s.shootingRange;
    range.registerMiss();
    range.registerMiss();
    range.registerMiss();
    // Direct score bump on session totals only (not challenge)
    range.stats.hits = 9;
    range.stats.shots = 12;
    range.stats.score = 999;
    range.stats.accuracy = (9 / 12) * 100;
    return {
      hits: range.stats.hits,
      shots: range.stats.shots,
      score: range.stats.score,
      challengeActive: range.stats.challengeActive,
    };
  });
  report.checks.push({ polluted });

  // Start challenge via T
  await page.keyboard.press("t");
  await page.waitForTimeout(200);

  const afterStart = await page.evaluate(() => {
    const st = window.__darkSector.shootingRange.stats;
    return {
      challengeActive: st.challengeActive,
      challengeScore: st.challengeScore,
      challengeHits: st.challengeHits,
      challengeShots: st.challengeShots,
      challengeAccuracy: st.challengeAccuracy,
      sessionHits: st.hits,
      sessionScore: st.score,
    };
  });
  report.checks.push({ afterStart });
  if (!afterStart.challengeActive) throw new Error("Challenge did not start on T");
  if (afterStart.challengeScore !== 0 || afterStart.challengeHits !== 0 || afterStart.challengeShots !== 0) {
    throw new Error(`Challenge stats polluted by free-fire: ${JSON.stringify(afterStart)}`);
  }
  if (afterStart.sessionHits < 9) {
    throw new Error("Session free-fire hits should remain after challenge start");
  }

  // Simulate a Sharpshooter-tier attempt (≥500 score, ≥65% acc) via challenge counters + hits API.
  const simulated = await page.evaluate(() => {
    const s = window.__darkSector;
    const range = s.shootingRange;
    // 10 hits @ 55 pts = 550, 3 misses → 10/13 ≈ 76.9% → Sharpshooter
    range.stats.challengeHits = 10;
    range.stats.challengeMisses = 3;
    range.stats.challengeShots = 13;
    range.stats.challengeScore = 550;
    range.stats.challengeAccuracy = (10 / 13) * 100;
    const result = range.endChallenge();
    return {
      result,
      storage: {
        best: localStorage.getItem("bds-range-best-30s"),
        badge: localStorage.getItem("bds-range-best-badge"),
        unlocked: localStorage.getItem("bds-range-unlocked-badges"),
      },
    };
  });
  report.checks.push({ simulated });

  if (!simulated.result.passed || simulated.result.badge !== "sharpshooter") {
    throw new Error(`Expected Sharpshooter PASS, got ${JSON.stringify(simulated.result)}`);
  }
  if (simulated.storage.best !== "550" || simulated.storage.badge !== "sharpshooter") {
    throw new Error(`Persistence mismatch: ${JSON.stringify(simulated.storage)}`);
  }
  const unlocked = JSON.parse(simulated.storage.unlocked || "[]");
  if (!unlocked.includes("marksman") || !unlocked.includes("sharpshooter")) {
    throw new Error(`Unlocked badges incomplete: ${simulated.storage.unlocked}`);
  }

  // Allow React HUD loop to pick up result
  await page.waitForTimeout(400);
  await page.waitForSelector("[data-testid='range-result-panel']", { timeout: 5000 });

  const panel = await page.evaluate(() => {
    const el = document.querySelector("[data-testid='range-result-panel']");
    return {
      present: Boolean(el),
      passed: el?.getAttribute("data-passed"),
      badge: el?.getAttribute("data-badge"),
      verdict: document.querySelector("[data-testid='range-result-verdict']")?.textContent?.trim(),
      badgeText: document.querySelector("[data-testid='range-result-badge']")?.textContent?.trim(),
      score: document.querySelector("[data-testid='range-result-score']")?.textContent?.trim(),
      accuracy: document.querySelector("[data-testid='range-result-accuracy']")?.textContent?.trim(),
      best: document.querySelector("[data-testid='range-result-best']")?.textContent?.trim(),
      marksmanEarned: document.querySelector("[data-testid='range-badge-marksman']")?.getAttribute("data-earned"),
      sharpEarned: document.querySelector("[data-testid='range-badge-sharpshooter']")?.getAttribute("data-earned"),
    };
  });
  report.checks.push({ panel });

  if (
    !panel.present ||
    panel.passed !== "true" ||
    panel.badge !== "sharpshooter" ||
    panel.verdict !== "PASS" ||
    panel.badgeText !== "Sharpshooter" ||
    panel.score !== "550" ||
    panel.best !== "550" ||
    panel.sharpEarned !== "true"
  ) {
    throw new Error(`Result panel assertion failed: ${JSON.stringify(panel)}`);
  }

  await page.locator("[data-testid='range-result-dismiss']").click();
  await page.waitForTimeout(300);
  const dismissed = await page.evaluate(() => !document.querySelector("[data-testid='range-result-panel']"));
  report.checks.push({ dismissed });
  if (!dismissed) throw new Error("Result panel did not dismiss");

  // Fail attempt should not wipe higher badge
  await page.keyboard.press("t");
  await page.waitForTimeout(150);
  const failRun = await page.evaluate(() => {
    const range = window.__darkSector.shootingRange;
    range.stats.challengeHits = 1;
    range.stats.challengeMisses = 5;
    range.stats.challengeShots = 6;
    range.stats.challengeScore = 50;
    range.stats.challengeAccuracy = (1 / 6) * 100;
    const result = range.endChallenge();
    return {
      result,
      badge: localStorage.getItem("bds-range-best-badge"),
      best: localStorage.getItem("bds-range-best-30s"),
    };
  });
  report.checks.push({ failRun });
  if (failRun.result.passed || failRun.result.badge !== "unqualified") {
    throw new Error(`Expected FAIL/Unqualified: ${JSON.stringify(failRun.result)}`);
  }
  if (failRun.badge !== "sharpshooter" || failRun.best !== "550") {
    throw new Error(`Best badge/score should persist after fail: ${JSON.stringify(failRun)}`);
  }

  await page.waitForTimeout(350);
  await page.waitForSelector("[data-testid='range-result-panel'][data-passed='false']", { timeout: 5000 });
  const failPanel = await page.evaluate(() => ({
    verdict: document.querySelector("[data-testid='range-result-verdict']")?.textContent?.trim(),
    badge: document.querySelector("[data-testid='range-result-badge']")?.textContent?.trim(),
  }));
  report.checks.push({ failPanel });
  if (failPanel.verdict !== "FAIL" || failPanel.badge !== "Unqualified") {
    throw new Error(`Fail panel wrong: ${JSON.stringify(failPanel)}`);
  }

  await page.screenshot({ path: path.join(OUT, "range-qualify.png"), fullPage: false });

  // Leave and confirm menu shows earned badges
  await page.locator("[data-testid='range-result-dismiss']").click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const menu = await page.evaluate(() => {
    const row = document.querySelector("[data-testid='menu-range-badges']");
    return {
      menuVisible: Boolean(document.body.innerText.match(/Shooting Range/i)),
      badgesBlock: Boolean(row),
      sharpEarned: document.querySelector("[data-testid='range-badge-sharpshooter']")?.getAttribute("data-earned"),
      storageBadge: localStorage.getItem("bds-range-best-badge"),
    };
  });
  report.checks.push({ menu });
  if (!menu.menuVisible || !menu.badgesBlock || menu.sharpEarned !== "true" || menu.storageBadge !== "sharpshooter") {
    throw new Error(`Menu badge persistence failed: ${JSON.stringify(menu)}`);
  }

  report.ok = report.errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  report.errors.push(String(err));
  try {
    await page.screenshot({ path: path.join(OUT, "range-qualify-fail.png") });
  } catch {
    // ignore
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
