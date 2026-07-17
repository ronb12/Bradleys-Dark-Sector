/**
 * Range audio mode-scoping QA.
 * Asserts range ambience/radio flags are false in Solo, true on Range, false after leave.
 * Usage: node qa-range-audio.mjs  (dev server on :5173)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173/";
const OUT = path.resolve("qa-artifacts");
fs.mkdirSync(OUT, { recursive: true });

const report = { ok: false, checks: [], errors: [] };
const check = (name, pass, detail = "") => {
  report.checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (err) => report.errors.push(String(err)));

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve();
});

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  // --- Solo: no range audio ---
  await page.getByRole("button", { name: /ENTER THE DARK SECTOR|ENTER/i }).click();
  await page.waitForTimeout(1200);

  const solo = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      mode: s?.gameMode ?? null,
      rangeAudioActive: s?.audio?.rangeAudioActive ?? null,
      rangeAmbiencePlaying: s?.audio?.rangeAmbiencePlaying ?? null,
      hasRange: Boolean(s?.shootingRange),
      x: s?.player?.position?.x ?? null,
      z: s?.player?.position?.z ?? null,
    };
  });
  check("solo mode", solo.mode === "solo", JSON.stringify(solo));
  check("solo: no range session", !solo.hasRange);
  check("solo: rangeAudioActive false", solo.rangeAudioActive === false, String(solo.rangeAudioActive));
  check("solo: rangeAmbiencePlaying false", solo.rangeAmbiencePlaying === false, String(solo.rangeAmbiencePlaying));
  check("solo: compound spawn", Math.abs(solo.x) < 5 && Math.abs(solo.z - 10) < 5, `x=${solo.x} z=${solo.z}`);

  // Back to menu via Escape isn't wired for solo — reload and open range from menu.
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);

  // --- Range: ambience allowed ---
  await page.getByRole("button", { name: /Shooting Range/i }).click();
  await page.waitForTimeout(1000);

  const range = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      mode: s?.gameMode ?? null,
      rangeAudioActive: s?.audio?.rangeAudioActive ?? null,
      rangeAmbiencePlaying: s?.audio?.rangeAmbiencePlaying ?? null,
      hasRange: Boolean(s?.shootingRange),
      x: s?.player?.position?.x ?? null,
    };
  });
  check("range mode", range.mode === "range", JSON.stringify(range));
  check("range: session present", range.hasRange);
  check("range: ambience playing", range.rangeAmbiencePlaying === true, String(range.rangeAmbiencePlaying));
  check("range: rangeAudioActive true", range.rangeAudioActive === true, String(range.rangeAudioActive));
  check("range: at bay (~x=200)", range.x != null && range.x > 150, `x=${range.x}`);

  // --- Leave range: audio stopped ---
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  const left = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      mode: s?.gameMode ?? null,
      running: s?.running ?? null,
      rangeAudioActive: s?.audio?.rangeAudioActive ?? null,
      rangeAmbiencePlaying: s?.audio?.rangeAmbiencePlaying ?? null,
      hasRange: Boolean(s?.shootingRange),
    };
  });
  check("leave: mode solo", left.mode === "solo", JSON.stringify(left));
  check("leave: range disposed", !left.hasRange);
  check("leave: rangeAudioActive false", left.rangeAudioActive === false, String(left.rangeAudioActive));
  check("leave: ambience stopped", left.rangeAmbiencePlaying === false, String(left.rangeAmbiencePlaying));

  // --- Solo again after range: still no range audio ---
  await page.getByRole("button", { name: /ENTER THE DARK SECTOR|ENTER/i }).click();
  await page.waitForTimeout(1000);
  const soloAfter = await page.evaluate(() => {
    const s = window.__darkSector;
    return {
      mode: s?.gameMode ?? null,
      rangeAudioActive: s?.audio?.rangeAudioActive ?? null,
      rangeAmbiencePlaying: s?.audio?.rangeAmbiencePlaying ?? null,
    };
  });
  check("solo after range: mode solo", soloAfter.mode === "solo", JSON.stringify(soloAfter));
  check(
    "solo after range: no range audio",
    soloAfter.rangeAudioActive === false && soloAfter.rangeAmbiencePlaying === false,
    JSON.stringify(soloAfter)
  );

  report.ok = report.checks.every((c) => c.pass) && report.errors.length === 0;
} catch (err) {
  report.errors.push(String(err));
  report.ok = false;
  console.error(err);
} finally {
  await browser.close();
  const outPath = path.join(OUT, "range-audio-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(report.ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(report.ok ? 0 : 1);
}
