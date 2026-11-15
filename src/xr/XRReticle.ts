import * as THREE from "three";
import type { ShotPose } from "./types";

const NORMAL_COLOR = 0xe7eadf;
const HIT_COLOR = 0xfda4af;
const ARMOR_COLOR = 0xfcd34d;
const KILL_COLOR = 0xffffff;
const ADS_COLOR = 0xa7f3d0;
const RETICLE_DISTANCE = 7.5;

/** Weapon-aimed VR crosshair — hipfire posts, ADS optic sight. */
export class XRReticle {
  readonly group = new THREE.Group();
  private hipfire = new THREE.Group();
  private optic = new THREE.Group();
  private materials: THREE.MeshBasicMaterial[] = [];
  private hitUntil = 0;
  private hitKind: "hit" | "armor" | "kill" = "hit";

  constructor(scene: THREE.Scene) {
    this.group.name = "XRCombatCrosshair";
    this.group.visible = false;
    this.hipfire.name = "HipfireReticle";
    this.optic.name = "AdsOpticSight";

    const addBar = (parent: THREE.Group, width: number, height: number, x: number, y: number, color = NORMAL_COLOR) => {
      const material = new THREE.MeshBasicMaterial({
        color,
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
      parent.add(bar);
    };

    // Hipfire: four separated posts + diamond (matches desktop).
    addBar(this.hipfire, 0.042, 0.005, -0.047, 0);
    addBar(this.hipfire, 0.042, 0.005, 0.047, 0);
    addBar(this.hipfire, 0.005, 0.042, 0, 0.047);
    addBar(this.hipfire, 0.005, 0.042, 0, -0.047);

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
    this.hipfire.add(center);

    // ADS: compact combat optic — ring + cross + BDC dots.
    const ringMat = new THREE.MeshBasicMaterial({
      color: ADS_COLOR,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.068, 48), ringMat);
    ring.renderOrder = 998;
    this.materials.push(ringMat);
    this.optic.add(ring);

    const innerMat = ringMat.clone();
    innerMat.opacity = 0.45;
    this.materials.push(innerMat);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.022, 32), innerMat);
    inner.renderOrder = 998;
    this.optic.add(inner);

    addBar(this.optic, 0.0028, 0.11, 0, 0, ADS_COLOR);
    addBar(this.optic, 0.11, 0.0028, 0, 0, ADS_COLOR);
    addBar(this.optic, 0.012, 0.012, 0, 0, ADS_COLOR);

    for (const y of [-0.028, -0.042, -0.056]) {
      const dotMat = new THREE.MeshBasicMaterial({
        color: ADS_COLOR,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 10), dotMat);
      dot.position.set(0, y, 0);
      dot.renderOrder = 998;
      this.materials.push(dotMat);
      this.optic.add(dot);
    }

    this.optic.visible = false;
    this.group.add(this.hipfire, this.optic);
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

  update(pose: ShotPose | null, visible: boolean, ads = false) {
    if (!visible || !pose) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    this.hipfire.visible = !ads;
    this.optic.visible = ads;

    const distance = ads ? 10.5 : RETICLE_DISTANCE;
    this.group.position.copy(pose.origin).addScaledVector(pose.direction, distance);
    this.group.lookAt(pose.origin);

    const hit = performance.now() < this.hitUntil;
    const color =
      hit && this.hitKind === "kill"
        ? KILL_COLOR
        : hit && this.hitKind === "armor"
          ? ARMOR_COLOR
          : hit
            ? HIT_COLOR
            : ads
              ? ADS_COLOR
              : NORMAL_COLOR;
    for (const material of this.materials) {
      material.color.setHex(color);
    }
    const base = ads ? 0.92 : 1;
    this.group.scale.setScalar(hit ? (this.hitKind === "kill" ? base * 1.4 : base * 1.2) : base);
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
