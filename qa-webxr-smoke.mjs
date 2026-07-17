/**
 * Smoke checks for WebXR wiring without a headset.
 * Requires: npm run build (or typecheck) already green; this validates module surface.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname || process.cwd());
const checks = [
  "src/xr/index.ts",
  "src/xr/XRSessionManager.ts",
  "src/xr/XRRig.ts",
  "src/xr/XRInput.ts",
  "src/xr/XRHud.ts",
  "src/xr/XRMenu.ts",
  "docs/QUEST_VR.md",
];

let failed = 0;
for (const rel of checks) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    console.error("MISSING", rel);
    failed += 1;
  } else {
    console.log("ok", rel);
  }
}

const main = readFileSync(resolve(root, "src/components/BradleysDarkSectorThreeJS.tsx"), "utf8");
for (const needle of [
  "createXRRuntime",
  "setAnimationLoop",
  "attachWeaponsToGrip",
  "xrPresenting",
  "data-testid=\"enter-vr\"",
]) {
  if (!main.includes(needle) && needle !== 'data-testid="enter-vr"') {
    // enter-vr is set on the VRButton element in XRSessionManager
  }
  if (needle === 'data-testid="enter-vr"') {
    const session = readFileSync(resolve(root, "src/xr/XRSessionManager.ts"), "utf8");
    if (!session.includes("enter-vr")) {
      console.error("MISSING enter-vr test id");
      failed += 1;
    } else console.log("ok enter-vr test id");
    continue;
  }
  if (!main.includes(needle)) {
    console.error("MISSING in main component:", needle);
    failed += 1;
  } else console.log("ok", needle);
}

const settings = readFileSync(resolve(root, "src/game/settings.ts"), "utf8");
if (!settings.includes("snapTurnDegrees") || !settings.includes("xrMoveSpeed")) {
  console.error("MISSING XR comfort settings");
  failed += 1;
} else console.log("ok XR comfort settings");

if (failed) {
  console.error(`\nqa-webxr-smoke FAILED (${failed})`);
  process.exit(1);
}
console.log("\nqa-webxr-smoke passed");
