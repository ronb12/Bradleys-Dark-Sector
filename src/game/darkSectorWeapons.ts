/**
 * Bradley's Dark Sector — original modular FPS weapon collection.
 * Every mesh and finish below is authored for this project, not imported.
 * Weapon barrels point down camera -Z; dimensions are in Three.js world units.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { WeaponId } from "./weapons";

type Finish = "graphite" | "receiver" | "steel" | "rubber" | "accent" | "lens" | "olive" | "bronze";
const finishes: Record<Finish, THREE.MeshStandardMaterial> = {
  graphite: new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.73, metalness: 0.26 }),
  receiver: new THREE.MeshStandardMaterial({ color: 0x303d47, roughness: 0.42, metalness: 0.56 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x525d64, roughness: 0.3, metalness: 0.76 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x161b1b, roughness: 0.92, metalness: 0.02 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x30d6e0, emissive: 0x0b5269, emissiveIntensity: 0.45, metalness: 0.3, roughness: 0.45 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x1b5267, emissive: 0x0b2636, emissiveIntensity: 0.25, transparent: true, opacity: 0.82, metalness: 0.2, roughness: 0.13, side: THREE.DoubleSide }),
  olive: new THREE.MeshStandardMaterial({ color: 0x424f42, roughness: 0.82, metalness: 0.1 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x92765b, roughness: 0.52, metalness: 0.32 }),
};

function block(parent: THREE.Object3D, width: number, height: number, depth: number,
               x: number, y: number, z: number, finish: Finish, radius = 0.014) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, width / 3, height / 3, depth / 3)),
    finishes[finish]
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function tube(parent: THREE.Object3D, r: number, len: number,
              x: number, y: number, z: number, finish: Finish, sides = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), finishes[finish]);
  mesh.rotation.x = Math.PI / 2; // along Z (muzzle points -Z)
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function sidePanel(parent: THREE.Object3D, z: number, y: number, length: number, kind: Finish = "steel") {
  for (const side of [-1, 1]) {
    block(parent, 0.018, 0.038, length, side * 0.169, y, z, kind, 0.006);
  }
}

function ventRibs(parent: THREE.Object3D, zStart: number, count: number, spacing: number,
                  x: number, y: number, length = 0.055) {
  for (let i = 0; i < count; i++) {
    const z = zStart - spacing * i;
    block(parent, 0.016, 0.028, length, x, y, z, i % 3 === 0 ? "steel" : "receiver", 0.005);
  }
}

function muzzleFlash(parent: THREE.Group, z: number) {
  const flash = new THREE.Group();
  flash.name = "DS_MUZZLE_FLASH";
  flash.position.set(0, 0, z);
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.095, 0.32, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbed91, transparent: true, opacity: 0.85, depthWrite: false })
  );
  core.rotation.x = -Math.PI / 2;
  core.position.z = -0.17;
  flash.add(core);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 5),
    new THREE.MeshBasicMaterial({ color: 0xffac4c, transparent: true, opacity: 0.68, depthWrite: false })
  );
  flash.add(halo);
  flash.visible = false;
  parent.add(flash);
}

function combatGloves(parent: THREE.Object3D, rifle: boolean) {
  // First-person hand silhouettes with individual knuckles: original geometry.
  const rear = new THREE.Group();
  rear.position.set(0.17, -0.44, rifle ? 0.35 : 0.22);
  const cuff = block(rear, 0.19, 0.2, 0.24, 0.09, -0.16, 0.11, "olive", 0.045);
  cuff.rotation.z = -0.24;
  const hand = block(rear, 0.18, 0.19, 0.21, 0.04, -0.015, 0, "rubber", 0.05);
  hand.rotation.z = -0.12;
  for (let i = 0; i < 3; i++) block(rear, 0.043, 0.05, 0.1, -0.012 + i * 0.049, 0.058, -0.07, "receiver", 0.014);
  parent.add(rear);
  if (!rifle) return;
  const support = new THREE.Group();
  support.position.set(-0.23, -0.34, -0.61);
  const sleeve = block(support, 0.22, 0.22, 0.36, -0.035, -0.11, 0.11, "olive", 0.04);
  sleeve.rotation.z = 0.27;
  block(support, 0.19, 0.12, 0.27, 0.016, 0.044, -0.04, "rubber", 0.04);
  for (let i = 0; i < 4; i++) {
    block(support, 0.034, 0.04, 0.18, -0.06 + 0.043 * i, 0.109, -0.09, "graphite", 0.014);
  }
  parent.add(support);
}

function rifle(parent: THREE.Group, compact: boolean) {
  const stockEnd = compact ? 0.57 : 0.79;
  const guardFront = compact ? -0.83 : -1.03;
  block(parent, 0.3, 0.22, compact ? 0.53 : 0.62, 0, 0, 0.07, "receiver");
  block(parent, 0.27, 0.13, 0.43, 0, -0.055, -0.10, "graphite");
  block(parent, 0.28, 0.21, compact ? 0.53 : 0.72, 0, 0.006, compact ? -0.56 : -0.65, "graphite");
  // Flat-faceted handguard, top Picatinny rail, parallel recesses and bolts.
  block(parent, 0.34, 0.048, compact ? 0.74 : 0.92, 0, 0.16, compact ? -0.44 : -0.56, "steel", 0.012);
  for (let i = 0; i < (compact ? 10 : 13); i++) {
    const z = 0.02 - i * 0.067;
    block(parent, 0.31, 0.024, 0.044, 0, 0.193, z, i % 4 === 0 ? "bronze" : "graphite", 0.006);
  }
  sidePanel(parent, -0.45, 0.043, compact ? 0.39 : 0.5);
  ventRibs(parent, -0.23, compact ? 7 : 10, 0.064, -0.168, 0.048);
  ventRibs(parent, -0.23, compact ? 7 : 10, 0.064, 0.168, 0.048);
  tube(parent, 0.041, compact ? 0.49 : 0.58, 0, 0.01, guardFront - 0.08, "steel", 16);
  tube(parent, 0.052, 0.145, 0, 0.01, compact ? -1.08 : -1.37, "graphite", 14);
  // Angular three-slot muzzle brake, visible silhouette from the side.
  for (let n = 0; n < 3; n++) {
    block(parent, 0.112, 0.028, 0.024, 0, 0.012, (compact ? -1.13 : -1.42) + n * 0.043, "steel", 0.004);
  }
  // Collapsible stock with diagonal support frame and rubber butt.
  block(parent, 0.11, 0.12, 0.49, 0, -0.014, 0.51, "steel");
  block(parent, 0.23, 0.29, 0.11, 0, -0.06, stockEnd, "graphite");
  block(parent, 0.236, 0.30, 0.04, 0, -0.061, stockEnd + 0.07, "rubber");
  for (const side of [-1, 1]) {
    const strut = block(parent, 0.026, 0.045, 0.48, side * 0.103, -0.119, 0.42, "receiver");
    strut.rotation.x = -0.16;
  }
  // Grip, angled magazine, brass-finish fasteners and receiver selector.
  const grip = block(parent, 0.16, 0.46, 0.19, 0.015, -0.31, 0.25, "rubber", 0.036);
  grip.rotation.x = -0.2;
  const magazine = block(parent, compact ? 0.16 : 0.19, compact ? 0.32 : 0.48, 0.25, 0, compact ? -0.33 : -0.42, -0.13, "graphite", 0.022);
  magazine.rotation.x = compact ? 0.17 : 0.11;
  block(parent, 0.22, 0.055, 0.29, 0, compact ? -0.51 : -0.67, -0.18, "steel");
  for (const side of [-1, 1]) {
    tube(parent, 0.033, 0.015, side * 0.158, 0.041, 0.24, "bronze", 10);
    block(parent, 0.014, 0.065, 0.17, side * 0.163, 0.034, -0.07, "steel", 0.005);
  }
  // Illuminated holo sight: separated mount, housing, lens, tiny reticle emitter.
  block(parent, 0.17, 0.11, 0.2, 0, 0.245, -0.2, "graphite");
  block(parent, 0.2, 0.27, 0.2, 0, 0.41, -0.2, "receiver", 0.024);
  block(parent, 0.149, 0.175, 0.215, 0, 0.418, -0.2, "graphite", 0.012);
  const glass = block(parent, 0.134, 0.142, 0.007, 0, 0.433, -0.31, "lens", 0.002);
  glass.material.depthWrite = false;
  block(parent, 0.017, 0.017, 0.014, 0, 0.425, -0.319, "accent", 0.004);
  // Handguard identification strips set this series apart from generic M4 assets.
  for (const side of [-1, 1]) {
    block(parent, 0.017, 0.023, 0.3, side * 0.18, -0.042, -0.56, "accent", 0.004);
  }
  combatGloves(parent, true);
  muzzleFlash(parent, compact ? -1.23 : -1.52);
}

function sidearm(parent: THREE.Group) {
  block(parent, 0.22, 0.17, 0.7, 0, 0.022, -0.15, "receiver");
  block(parent, 0.18, 0.09, 0.54, 0, -0.1, 0.03, "graphite");
  block(parent, 0.15, 0.064, 0.65, 0, 0.119, -0.17, "steel");
  tube(parent, 0.035, 0.23, 0, 0.019, -0.54, "graphite");
  tube(parent, 0.027, 0.05, 0, 0.019, -0.668, "steel");
  const grip = block(parent, 0.177, 0.47, 0.22, 0, -0.345, 0.155, "rubber", 0.03);
  grip.rotation.x = -0.18;
  for (const side of [-1, 1]) {
    block(parent, 0.013, 0.31, 0.16, side * 0.095, -0.341, 0.15, "olive", 0.01);
    for (let n = 0; n < 5; n++) block(parent, 0.02, 0.12, 0.012, side * 0.119, 0.08, 0.14 + n * 0.035, "graphite", 0.004);
  }
  block(parent, 0.13, 0.045, 0.1, 0, 0.135, 0.155, "accent", 0.006);
  block(parent, 0.14, 0.05, 0.07, 0, 0.143, -0.49, "steel", 0.008);
  block(parent, 0.19, 0.03, 0.04, 0, -0.56, 0.205, "steel", 0.004);
  combatGloves(parent, false);
  muzzleFlash(parent, -0.7);
}

export function createOriginalWeaponView(id: WeaponId): THREE.Group {
  const group = new THREE.Group();
  group.name = id === "m4" ? "DS-ASH4 Atlas Carbine" : id === "smg" ? "DS-V9 Warden SMG" : "DS-Kestrel Sidearm";
  group.userData.darkSectorOriginal = true;
  group.userData.assetVersion = 1;
  if (id === "pistol") {
    group.position.set(0.3, -0.43, -0.82);
    group.rotation.set(-0.04, -0.08, 0.03);
    sidearm(group);
  } else {
    group.position.set(0.55, -0.55, -1.1);
    group.rotation.set(-0.08, -0.1, 0.05);
    rifle(group, id === "smg");
    if (id === "smg") {
      group.scale.set(0.84, 0.84, 0.78);
      group.position.set(0.5, -0.52, -1);
    }
  }
  return group;
}

export function triggerOriginalWeaponFlash(group: THREE.Group) {
  group.userData.muzzleFlashRemaining = 0.065;
  const flash = group.getObjectByName("DS_MUZZLE_FLASH");
  if (flash) flash.visible = true;
}

export function tickOriginalWeaponFlash(group: THREE.Group, dt: number) {
  const remaining = Math.max(0, (group.userData.muzzleFlashRemaining as number || 0) - dt);
  group.userData.muzzleFlashRemaining = remaining;
  const flash = group.getObjectByName("DS_MUZZLE_FLASH");
  if (flash) flash.visible = remaining > 0;
}
