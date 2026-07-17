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
    this.panel.position.set(0.18, 0.08, -0.05);
    this.panel.rotation.set(-0.55, 0.35, 0.1);
    this.group.add(this.panel);
    this.group.visible = false;
    scene.add(this.group);
    this.draw({
      health: 100,
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
    });
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  /** Place HUD near left wrist / body-left of player. */
  updatePose(playerPos: THREE.Vector3, yaw: number) {
    this.group.position.set(
      playerPos.x + Math.sin(yaw - 0.85) * 0.45,
      playerPos.y + 1.15,
      playerPos.z - Math.cos(yaw - 0.85) * 0.45
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

    const hpColor = s.health <= 30 ? "#f87171" : s.health <= 55 ? "#fbbf24" : "#86efac";
    ctx.fillStyle = hpColor;
    ctx.font = "bold 48px monospace";
    ctx.fillText(`HP ${Math.max(0, Math.round(s.health))}`, 28, 110);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 40px monospace";
    ctx.fillText(`${s.weapon}  ${s.ammo}`, 28, 170);

    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 26px monospace";
    if (s.mode === "range") {
      ctx.fillText(
        s.rangeChallengeActive
          ? `QUAL ${s.rangeChallengeTime.toFixed(1)}s · ACC ${s.rangeAccuracy}%`
          : `RANGE · HITS ${s.rangeHits} · ACC ${s.rangeAccuracy}%`,
        28,
        220
      );
    } else {
      ctx.fillText(`WAVE ${s.wave} · SCORE ${s.score}`, 28, 220);
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "22px sans-serif";
    const obj = (s.missionTitle ? `${s.missionTitle}: ` : "") + (s.objective || "");
    ctx.fillText(obj.slice(0, 54), 28, 265);

    if (s.contact) {
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`CONTACT ${s.contact}`, 28, 315);
    } else if (s.subtitle) {
      ctx.fillStyle = "#fde68a";
      ctx.font = "22px sans-serif";
      ctx.fillText(s.subtitle.slice(0, 60), 28, 315);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "18px monospace";
    ctx.fillText("LT stick move · RT snap · R trigger fire · Y menu", 28, 360);

    this.texture.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.texture.dispose();
    (this.panel.material as THREE.Material).dispose();
    this.panel.geometry.dispose();
  }
}
