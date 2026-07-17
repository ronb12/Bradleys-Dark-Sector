import * as THREE from "three";

export class DynamicQualityGovernor {
  private elapsed = 0;
  private frames = 0;
  private currentCap: number;
  private renderer: THREE.WebGLRenderer;
  private enabled: boolean;

  constructor(renderer: THREE.WebGLRenderer, initialCap: number, enabled: boolean) {
    this.renderer = renderer;
    this.enabled = enabled;
    this.currentCap = initialCap;
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.frames += 1;
    if (this.elapsed < 2) return;
    const averageMs = (this.elapsed / Math.max(1, this.frames)) * 1000;
    if (averageMs > 19 && this.currentCap > 0.85) this.currentCap = Math.max(0.85, this.currentCap - 0.1);
    else if (averageMs < 15 && this.currentCap < 1.6) this.currentCap = Math.min(1.6, this.currentCap + 0.05);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.currentCap));
    this.elapsed = 0;
    this.frames = 0;
  }
}
