import * as THREE from "three";
import type { XRHudSnapshot } from "./types";

function makePanelTexture(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for XR HUD");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return { canvas, ctx, texture };
}

/** Wrist / body-locked tactical HUD for immersive VR. */
export class XRHud {
  readonly group = new THREE.Group();
  private panel: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private lastKey = "";

  constructor(scene: THREE.Scene) {
    this.group.name = "XRHud";
    const made = makePanelTexture(768, 384);
    this.canvas = made.canvas;
    this.ctx = made.ctx;
    this.texture = made.texture;

    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), mat);
    // Slight local tilt for readability; group itself stays yaw-only / world-upright.
    this.panel.position.set(0, 0, 0);
    this.panel.rotation.set(-0.2, 0.15, 0);
    this.group.add(this.panel);
    this.group.visible = false;
    scene.add(this.group);
    this.draw({
      health: 100,
      maxHealth: 100,
      ammo: 30,
      weapon: "M4A1",
      score: 0,
      wave: 1,
      objective: "Stand by",
      contact: "",
      mode: "solo",
      missionTitle: "",
      rangeHits: 0,
      rangeAccuracy: 0,
      rangeChallengeActive: false,
      rangeChallengeTime: 0,
      subtitle: "",
      medkits: 2,
      grenades: 3,
    });
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  /** Place HUD comfortably left-front; avoid near-eye stereo divergence. */
  updatePose(playerPos: THREE.Vector3, yaw: number) {
    const forward = 0.95;
    const left = 0.55;
    this.group.position.set(
      playerPos.x - Math.sin(yaw) * forward + Math.sin(yaw - Math.PI / 2) * left,
      playerPos.y + 1.35,
      playerPos.z - Math.cos(yaw) * forward + Math.cos(yaw - Math.PI / 2) * left
    );
    this.group.rotation.set(0, yaw, 0);
  }

  update(snapshot: XRHudSnapshot) {
    const key = JSON.stringify(snapshot);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(snapshot);
  }

  private draw(s: XRHudSnapshot) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(6, 12, 10, 0.88)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.55)";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 22px monospace";
    ctx.fillText("BRADLEY · DARK SECTOR · VR", 28, 42);

    const hpPct = Math.round((Math.max(0, s.health) / Math.max(1, s.maxHealth)) * 100);
    const hpColor = hpPct <= 30 ? "#f87171" : hpPct <= 55 ? "#fbbf24" : "#86efac";
    ctx.fillStyle = hpColor;
    ctx.font = "bold 48px monospace";
    ctx.fillText(`HP ${hpPct}`, 28, 110);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 40px monospace";
    ctx.fillText(`${s.weapon}  ${s.ammo}`, 28, 170);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 22px monospace";
    ctx.fillText(`MED ×${s.medkits}  FRAG ×${s.grenades}`, 28, 205);

    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 26px monospace";
    if (s.mode === "range") {
      ctx.fillText(
        s.rangeChallengeActive
          ? `QUAL ${s.rangeChallengeTime.toFixed(1)}s · ACC ${s.rangeAccuracy}%`
          : `RANGE · HITS ${s.rangeHits} · ACC ${s.rangeAccuracy}%`,
        28,
        245
      );
    } else {
      ctx.fillText(`WAVE ${s.wave} · SCORE ${s.score}`, 28, 245);
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "22px sans-serif";
    const obj = (s.missionTitle ? `${s.missionTitle}: ` : "") + (s.objective || "");
    ctx.fillText(obj.slice(0, 54), 28, 290);

    if (s.contact) {
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`CONTACT ${s.contact}`, 28, 335);
    } else if (s.subtitle) {
      ctx.fillStyle = "#fde68a";
      ctx.font = "22px sans-serif";
      ctx.fillText(s.subtitle.slice(0, 60), 28, 335);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "18px monospace";
    ctx.fillText("LT move · RT snap · R fire · X reload · L medkit · Y menu", 28, 360);

    this.texture.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.texture.dispose();
    (this.panel.material as THREE.Material).dispose();
    this.panel.geometry.dispose();
  }
}
