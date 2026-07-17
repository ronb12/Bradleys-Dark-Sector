import * as THREE from "three";
import type { XRMenuAction } from "./types";

type MenuButton = {
  id: XRMenuAction;
  label: string;
  mesh: THREE.Mesh;
  baseColor: number;
};

function makeLabelTexture(text: string, width = 512, height = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for XR menu");
  ctx.fillStyle = "rgba(8, 14, 12, 0.92)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(125, 211, 252, 0.65)";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** World-space VR menu with controller-ray selection. */
export class XRMenu {
  readonly group = new THREE.Group();
  private buttons: MenuButton[] = [];
  private title: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private hovered: MenuButton | null = null;
  private onAction: (action: XRMenuAction) => void;
  private open = false;

  constructor(scene: THREE.Scene, onAction: (action: XRMenuAction) => void) {
    this.onAction = onAction;
    this.group.name = "XRMenu";
    this.group.visible = false;

    const titleTex = makeLabelTexture("DARK SECTOR · VR", 768, 160);
    this.title = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.23),
      new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, side: THREE.DoubleSide })
    );
    this.title.position.set(0, 0.55, 0);
    this.group.add(this.title);

    this.buildButtons("main");
    scene.add(this.group);
  }

  private clearButtons() {
    for (const btn of this.buttons) {
      this.group.remove(btn.mesh);
      btn.mesh.geometry.dispose();
      const mat = btn.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.buttons = [];
  }

  private buildButtons(mode: "main" | "pause") {
    this.clearButtons();
    const defs: Array<{ id: XRMenuAction; label: string; color: number }> =
      mode === "main"
        ? [
            { id: "solo", label: "ENTER COMPOUND", color: 0x0e7490 },
            { id: "range", label: "SHOOTING RANGE", color: 0x166534 },
            { id: "settings", label: "COMFORT / SETTINGS", color: 0x334155 },
            { id: "exitVr", label: "EXIT VR", color: 0x7f1d1d },
          ]
        : [
            { id: "resume", label: "RESUME", color: 0x166534 },
            { id: "settings", label: "COMFORT / SETTINGS", color: 0x334155 },
            { id: "solo", label: "RESTART SOLO", color: 0x0e7490 },
            { id: "range", label: "RANGE", color: 0x14532d },
            { id: "exitVr", label: "EXIT VR", color: 0x7f1d1d },
          ];

    defs.forEach((def, i) => {
      const tex = makeLabelTexture(def.label);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.18),
        new THREE.MeshBasicMaterial({
          map: tex,
          color: def.color,
          transparent: true,
          side: THREE.DoubleSide,
        })
      );
      mesh.position.set(0, 0.28 - i * 0.22, 0.02);
      mesh.userData.menuAction = def.id;
      this.group.add(mesh);
      this.buttons.push({ id: def.id, label: def.label, mesh, baseColor: def.color });
    });
  }

  isOpen() {
    return this.open;
  }

  setVisible(visible: boolean) {
    this.open = visible;
    this.group.visible = visible;
  }

  showMain() {
    this.buildButtons("main");
    this.setVisible(true);
  }

  showPause() {
    this.buildButtons("pause");
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
    this.hovered = null;
  }

  /** Place menu in front of player. */
  updatePose(playerPos: THREE.Vector3, yaw: number) {
    this.group.position.set(
      playerPos.x - Math.sin(yaw) * 1.6,
      playerPos.y + 1.45,
      playerPos.z - Math.cos(yaw) * 1.6
    );
    this.group.rotation.set(0, yaw, 0);
  }

  /**
   * Raycast from controller; returns true if a button was activated this frame.
   */
  updateInteraction(controller: THREE.Object3D | null, selectPressed: boolean, selectEdge: boolean) {
    if (!this.open || !controller) {
      this.clearHover();
      return false;
    }
    controller.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, -1);
    controller.getWorldPosition(origin);
    dir.applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())).normalize();
    this.raycaster.set(origin, dir);

    const hits = this.raycaster.intersectObjects(
      this.buttons.map((b) => b.mesh),
      false
    );
    const hit = hits[0];
    if (!hit) {
      this.clearHover();
      return false;
    }
    const btn = this.buttons.find((b) => b.mesh === hit.object) ?? null;
    if (btn !== this.hovered) {
      this.clearHover();
      this.hovered = btn;
      if (btn) {
        (btn.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x67e8f9);
      }
    }
    if (selectEdge && selectPressed && btn) {
      this.onAction(btn.id);
      return true;
    }
    return false;
  }

  private clearHover() {
    if (this.hovered) {
      (this.hovered.mesh.material as THREE.MeshBasicMaterial).color.setHex(this.hovered.baseColor);
    }
    this.hovered = null;
  }

  dispose(scene: THREE.Scene) {
    this.clearButtons();
    scene.remove(this.group);
    this.title.geometry.dispose();
    const mat = this.title.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
