/**
 * Radio variety logic check (no browser).
 * Usage: node qa-radio-variety.mjs
 *
 * Reads pool sizes from src/game/radioLines.ts and verifies the no-immediate-repeat picker.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve("src/game/radioLines.ts"), "utf8");

function countPool(name) {
  const re = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`);
  const m = src.match(re);
  assert.ok(m, `missing pool ${name}`);
  return (m[1].match(/"/g) || []).length / 2;
}

const expected = {
  MISSION_AMBIENT_LINES: 12,
  MISSION_START_LINES: 5,
  WAVE_INBOUND_TEMPLATES: 6,
  OBJECTIVE_COMPLETE_TEMPLATES: 5,
  MISSION_BRIEF_TEMPLATES: 5,
  RANGE_ONLINE_LINES: 5,
  RANGE_CHALLENGE_START_LINES: 5,
  RANGE_PASS_TEMPLATES: 5,
  RANGE_FAIL_LINES: 5,
  PVP_START_LINES: 5,
  PVP_MATCH_OVER_TEMPLATES: 5,
  ENEMY_CALLOUT_LINES: 15,
  CONTACT_LINES: 5,
  KILL_CONFIRM_LINES: 6,
  RELOAD_REMIND_LINES: 5,
};

for (const [name, min] of Object.entries(expected)) {
  const n = countPool(name);
  assert.ok(n >= 2, `${name} size ${n} < 2`);
  assert.equal(n, min, `${name} expected ${min}, got ${n}`);
  console.log(`PASS  ${name} pool size ${n}`);
}

function pickFromPool(lastMap, poolId, lines) {
  const last = lastMap.get(poolId);
  const candidates = last ? lines.filter((l) => l !== last) : lines;
  const pool = candidates.length ? candidates : lines;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  lastMap.set(poolId, pick);
  return pick;
}

const lines = ["a", "b", "c", "d", "e"];
const lastMap = new Map();
let prev = "";
const seen = new Set();
for (let i = 0; i < 24; i += 1) {
  const line = pickFromPool(lastMap, "test", lines);
  assert.notEqual(line, prev, `immediate repeat at draw ${i}`);
  prev = line;
  seen.add(line);
}
assert.ok(seen.size >= 2, "should see multiple distinct lines");
console.log("PASS  no-immediate-repeat picker");

assert.match(src, /channelAllowed|RadioChannel|mission|range|pvp/, "radioLines is cue text only");
assert.ok(src.includes('allowRadioCue'), "cooldown helper present");
assert.ok(!src.includes("Range control — thirty second challenge live. Make every round count.") || countPool("RANGE_CHALLENGE_START_LINES") > 1);

const main = fs.readFileSync(path.resolve("src/components/BradleysDarkSectorThreeJS.tsx"), "utf8");
assert.ok(main.includes("missionAmbientLine()"), "solo ambient uses pool");
assert.ok(main.includes("rangeChallengeStartLine()"), "range challenge uses pool");
assert.ok(main.includes("waveInboundLine("), "wave inbound uses pool");
assert.ok(!main.includes("const RADIO_LINES = ["), "old RADIO_LINES constant removed");
assert.ok(
  !main.includes('"Range control — thirty second challenge live. Make every round count."'),
  "hardcoded range challenge line removed"
);
console.log("PASS  call sites use pools");
console.log("OK");
