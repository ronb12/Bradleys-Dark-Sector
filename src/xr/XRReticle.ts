import * as THREE from "three";
import type { ShotPose } from "./types";

const NORMAL_COLOR = 0xe7eadf;
const HIT_COLOR = 0xfda4af;
const ARMOR_COLOR = 0xfcd34d;
const KILL_COLOR = 0xffffff;
const RETICLE_DISTANCE = 7.5;

/** Weapon-aimed VR crosshair matching the desktop four-post + diamond reticle. */
export class XRReticle {
  readonly group = new THREE.Group();
  private materials: THREE.MeshBasicMaterial[] = [];
  private hitUntil = 0;
  private hitKind: "hit" | "armor" | "kill" = "hit";

  constructor(scene: THREE.Scene) {
    this.group.name = "XRCombatCrosshair";
    this.group.visible = false;

    const addBar = (width: number, height: number, x: number, y: number) => {
      const material = new THREE.MeshBasicMaterial({
        color: NORMAL_COLOR,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      bar.position.set(x, y, 0);
      bar.renderOrder = 998;
      this.materials.push(material);
      this.group.add(bar);
    };

    // Same visual language as the website: four separated posts.
    addBar(0.042, 0.005, -0.047, 0);
    addBar(0.042, 0.005, 0.047, 0);
    addBar(0.005, 0.042, 0, 0.047);
    addBar(0.005, 0.042, 0, -0.047);

    const centerMaterial = new THREE.MeshBasicMaterial({
      color: NORMAL_COLOR,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.014), centerMaterial);
    center.rotation.z = Math.PI / 4;
    center.renderOrder = 998;
    this.materials.push(centerMaterial);
    this.group.add(center);

    scene.add(this.group);
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  flashHit(kind: "hit" | "armor" | "kill" = "hit") {
    const duration = kind === "kill" ? 220 : kind === "armor" ? 120 : 100;
    this.hitUntil = performance.now() + duration;
    this.hitKind = kind;
  }

  update(pose: ShotPose | null, visible: boolean) {
    if (!visible || !pose) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    this.group.position.copy(pose.origin).addScaledVector(pose.direction, RETICLE_DISTANCE);
    // Face back along the weapon ray so the reticle remains readable from the
    // headset without becoming head-locked.
    this.group.lookAt(pose.origin);

    const hit = performance.now() < this.hitUntil;
    const color =
      hit && this.hitKind === "kill"
        ? KILL_COLOR
        : hit && this.hitKind === "armor"
          ? ARMOR_COLOR
          : hit
            ? HIT_COLOR
            : NORMAL_COLOR;
    for (const material of this.materials) material.color.setHex(color);
    this.group.scale.setScalar(hit ? (this.hitKind === "kill" ? 1.45 : 1.25) : 1);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
    this.materials = [];
  }
}
