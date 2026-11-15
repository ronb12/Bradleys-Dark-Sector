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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function streakMeta(streak: number) {
  if (streak >= 8) return { label: "UNSTOPPABLE", color: "#fda4af", bar: "#f43f5e" };
  if (streak >= 5) return { label: "ON FIRE", color: "#fdba74", bar: "#fb923c" };
  if (streak >= 3) return { label: "HOT STREAK", color: "#fde68a", bar: "#fbbf24" };
  if (streak > 0) return { label: "STREAK", color: "#d7dfc5", bar: "#a3b18a" };
  return { label: "READY", color: "#94a3b8", bar: "#475569" };
}

/** Wrist / body-locked tactical HUD for immersive VR — scoreboard-forward layout. */
export class XRHud {
  readonly group = new THREE.Group();
  private panel: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private lastKey = "";

  constructor(scene: THREE.Scene) {
    this.group.name = "XRHud";
    const made = makePanelTexture(1120, 560);
    this.canvas = made.canvas;
    this.ctx = made.ctx;
    this.texture = made.texture;

    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    // Slightly larger panel — score digits stay readable at arm's length on Quest.
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.29), mat);
    this.panel.position.set(0, 0, 0);
    this.panel.rotation.set(-0.18, 0.12, 0);
    this.panel.renderOrder = 990;
    this.group.add(this.panel);
    this.group.visible = false;
    scene.add(this.group);
    this.draw({
      health: 100,
      maxHealth: 100,
      ammo: 30,
      weapon: "M4A1",
      score: 0,
      streak: 0,
      bestStreak: 0,
      sessionKills: 0,
      hostiles: 0,
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
    const forward = 1.05;
    const left = 0.58;
    this.group.position.set(
      playerPos.x - Math.sin(yaw) * forward + Math.sin(yaw - Math.PI / 2) * left,
      playerPos.y + 1.32,
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
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    roundRect(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.fillStyle = "rgba(4, 9, 8, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(183, 196, 154, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "rgba(183, 196, 154, 0.9)";
    ctx.fillRect(10, 10, 12, h - 20);

    ctx.fillStyle = "#6b7280";
    ctx.font = "bold 18px monospace";
    ctx.fillText("DARK SECTOR · SCOREBOARD", 40, 44);

    const streak = streakMeta(s.streak);

    // Primary score block
    roundRect(ctx, 32, 58, 460, 188, 16);
    ctx.fillStyle = "rgba(12, 18, 16, 0.96)";
    ctx.fill();
    ctx.strokeStyle = s.streak >= 5 ? "rgba(251, 146, 60, 0.55)" : "rgba(103, 232, 249, 0.35)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 20px monospace";
    ctx.fillText("SCORE", 52, 90);
    ctx.fillStyle = streak.color;
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "right";
    ctx.fillText(streak.label, 470, 90);
    ctx.textAlign = "left";

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 84px monospace";
    ctx.fillText(s.score.toLocaleString(), 52, 172);

    // Streak heat bar
    ctx.fillStyle = "rgba(30, 41, 39, 1)";
    ctx.fillRect(52, 196, 400, 14);
    ctx.fillStyle = streak.bar;
    ctx.fillRect(52, 196, Math.max(4, Math.min(400, s.streak * 50)), 14);

    ctx.fillStyle = streak.color;
    ctx.font = "bold 26px monospace";
    ctx.fillText(`×${s.streak}`, 52, 236);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`BEST ${s.bestStreak}`, 150, 236);
    ctx.fillStyle = "#fda4af";
    ctx.fillText(`${s.sessionKills} KILLS`, 300, 236);

    // Right column — wave / hostiles / range
    roundRect(ctx, 512, 58, 560, 188, 16);
    ctx.fillStyle = "rgba(12, 18, 16, 0.96)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (s.mode === "range") {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 28px monospace";
      ctx.fillText(
        s.rangeChallengeActive
          ? `QUAL ${s.rangeChallengeTime.toFixed(1)}s`
          : "RANGE LIVE",
        536,
        108,
      );
      ctx.fillStyle = "#67e8f9";
      ctx.font = "bold 44px monospace";
      ctx.fillText(`HITS ${s.rangeHits}`, 536, 168);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`ACC ${s.rangeAccuracy}%`, 536, 214);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 22px monospace";
      ctx.fillText(`WAVE ${String(s.wave).padStart(2, "0")}`, 536, 100);
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 72px monospace";
      ctx.fillText(`${s.hostiles}`, 536, 178);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 26px monospace";
      ctx.fillText("HOSTILES LIVE", 536, 220);
    }

    // HP + ammo row
    const hpPct = Math.round((Math.max(0, s.health) / Math.max(1, s.maxHealth)) * 100);
    const hpColor = hpPct <= 30 ? "#f87171" : hpPct <= 55 ? "#fbbf24" : "#86efac";
    roundRect(ctx, 32, 266, 320, 100, 14);
    ctx.fillStyle = "rgba(12, 18, 16, 0.96)";
    ctx.fill();
    ctx.fillStyle = hpColor;
    ctx.font = "bold 44px monospace";
    ctx.fillText(`HP ${hpPct}`, 52, 324);
    ctx.fillStyle = "rgba(30, 41, 39, 1)";
    ctx.fillRect(52, 338, 260, 12);
    ctx.fillStyle = hpColor;
    ctx.fillRect(52, 338, Math.max(4, (260 * hpPct) / 100), 12);

    roundRect(ctx, 372, 266, 700, 100, 14);
    ctx.fillStyle = "rgba(12, 18, 16, 0.96)";
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 30px monospace";
    ctx.fillText(`${s.weapon}`, 396, 310);
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 44px monospace";
    ctx.fillText(`${s.ammo}`, 396, 354);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 22px monospace";
    ctx.fillText(`MED ×${s.medkits}   FRAG ×${s.grenades}`, 560, 354);

    // Objective / contact
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "22px sans-serif";
    const obj = (s.missionTitle ? `${s.missionTitle}: ` : "") + (s.objective || "");
    ctx.fillText(obj.slice(0, 78), 40, 412);

    if (s.contact) {
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`CONTACT ${s.contact}`, 40, 456);
    } else if (s.subtitle) {
      ctx.fillStyle = "#fde68a";
      ctx.font = "22px sans-serif";
      ctx.fillText(s.subtitle.slice(0, 74), 40, 456);
    }

    ctx.fillStyle = "#475569";
    ctx.font = "18px monospace";
    ctx.fillText("L-stick move · push sprint · R-stick turn · triggers fire · X reload · Y menu", 40, 510);

    this.texture.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.texture.dispose();
    (this.panel.material as THREE.Material).dispose();
    this.panel.geometry.dispose();
  }
}
