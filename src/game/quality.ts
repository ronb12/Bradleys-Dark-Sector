import * as THREE from "three";

export type QualityTier = "desktop" | "mobile" | "xr";

export class DynamicQualityGovernor {
  private elapsed = 0;
  private frames = 0;
  private currentCap: number;
  private minCap: number;
  private maxCap: number;
  private renderer: THREE.WebGLRenderer;
  private enabled: boolean;
  private tier: QualityTier;
  /** 0–1 scale for particle / tracer budgets (reacts to measured frame time). */
  private fxScale = 1;
  private lastAverageMs = 16.6;
  private shadowsPreferred: boolean;
  private shadowHoldFrames = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    initialCap: number,
    enabled: boolean,
    tier: QualityTier = "desktop",
  ) {
    this.renderer = renderer;
    this.enabled = enabled;
    this.tier = tier;
    this.currentCap = initialCap;
    this.shadowsPreferred = renderer.shadowMap.enabled;
    if (tier === "xr") {
      // XR: lock DPR — resizing the drawing buffer mid-session causes flicker / black frames.
      this.minCap = initialCap;
      this.maxCap = initialCap;
    } else if (tier === "mobile") {
      this.minCap = 0.75;
      this.maxCap = Math.min(1.35, initialCap);
    } else {
      this.minCap = 0.85;
      this.maxCap = Math.min(1.5, Math.max(initialCap, 1.35));
    }
    this.fxScale = tier === "desktop" ? 1 : tier === "mobile" ? 0.55 : 0.35;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setTier(tier: QualityTier, initialCap?: number) {
    this.tier = tier;
    if (tier === "xr") {
      const cap = initialCap ?? 1;
      this.minCap = cap;
      this.maxCap = cap;
      this.currentCap = cap;
      this.fxScale = Math.min(this.fxScale, 0.35);
      this.renderer.shadowMap.enabled = false;
      // Never touch pixel ratio while immersive — WebXRManager owns the drawing buffer.
      // setPixelRatio still mutates internal `_pixelRatio` even when setSize no-ops.
    } else if (tier === "mobile") {
      this.minCap = 0.75;
      this.maxCap = initialCap ?? 1.25;
      this.fxScale = Math.min(this.fxScale, 0.55);
    } else {
      this.minCap = 0.85;
      this.maxCap = initialCap ?? 1.6;
    }
    this.currentCap = THREE.MathUtils.clamp(this.currentCap, this.minCap, this.maxCap);
  }

  /** Call when user toggles graphics preset so recovery can re-enable shadows. */
  setShadowsPreferred(preferred: boolean) {
    this.shadowsPreferred = preferred;
    if (!preferred) this.renderer.shadowMap.enabled = false;
  }

  getFxScale() {
    return this.fxScale;
  }

  getAverageFrameMs() {
    return this.lastAverageMs;
  }

  getPixelRatioCap() {
    return this.currentCap;
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.frames += 1;
    if (this.elapsed < 1.5) return;
    const averageMs = (this.elapsed / Math.max(1, this.frames)) * 1000;
    this.lastAverageMs = averageMs;

    // Target ~55–60fps desktop, ~45fps mobile/XR (Quest Browser is harsh).
    const softLimit = this.tier === "desktop" ? 19 : 22;
    const hardLimit = this.tier === "desktop" ? 24 : 28;
    const recover = this.tier === "desktop" ? 15 : 17;

    if (averageMs > hardLimit) {
      if (this.tier !== "xr") {
        this.currentCap = Math.max(this.minCap, this.currentCap - 0.15);
      }
      this.fxScale = Math.max(0.2, this.fxScale - 0.12);
      this.shadowHoldFrames = 0;
      if (this.tier !== "xr") this.renderer.shadowMap.enabled = false;
    } else if (averageMs > softLimit) {
      if (this.tier !== "xr") {
        this.currentCap = Math.max(this.minCap, this.currentCap - 0.08);
      }
      this.fxScale = Math.max(0.25, this.fxScale - 0.06);
      this.shadowHoldFrames = 0;
    } else if (averageMs < recover) {
      if (this.tier !== "xr") {
        this.currentCap = Math.min(this.maxCap, this.currentCap + 0.04);
      }
      this.fxScale = Math.min(1, this.fxScale + 0.04);
      this.shadowHoldFrames += 1;
      // Only restore shadows after a few healthy samples, and never in XR.
      if (
        this.tier === "desktop"
        && this.shadowsPreferred
        && this.shadowHoldFrames >= 3
        && this.currentCap >= 1.2
      ) {
        this.renderer.shadowMap.enabled = true;
      }
    } else {
      this.shadowHoldFrames = 0;
    }

    // Never resize the drawing buffer during an immersive XR session.
    if (this.tier !== "xr") {
      const next = Math.min(window.devicePixelRatio || 1, this.currentCap);
      // Avoid thrashing WebGL when the governor re-samples every 1.5s with the same cap.
      if (Math.abs(this.renderer.getPixelRatio() - next) > 0.01) {
        this.renderer.setPixelRatio(next);
      }
    }
    this.elapsed = 0;
    this.frames = 0;
  }
}
