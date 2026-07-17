/** Enemy visible weapons — AK-47 rifle + sidearm pistol, hand-bone attached. */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

const AK_URL = "/models/weapons/quaternius-ak47.glb";
const PISTOL_URL = "/models/pistol.glb";

let akTemplate: THREE.Group | null = null;
let pistolTemplate: THREE.Group | null = null;
let loadPromise: Promise<void> | null = null;

function normalizeWeapon(model: THREE.Object3D, targetLongest: number) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  model.position.sub(center);
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.scale.setScalar(targetLongest / longest);
  return wrap;
}

export function preloadEnemyWeapons(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) resolve();
    };

    new GLTFLoader().load(
      AK_URL,
      (gltf: GLTF) => {
        const model = gltf.scene.clone(true);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) child.castShadow = true;
        });
        akTemplate = normalizeWeapon(model, 1.05);
        // Quaternius models the muzzle toward +X. Rotate +X onto soldier
        // local -Z; the previous -PI/2 mapping pointed the stock at targets.
        akTemplate.rotation.y = Math.PI / 2;
        done();
      },
      undefined,
      () => done()
    );

    new GLTFLoader().load(
      PISTOL_URL,
      (gltf: GLTF) => {
        const model = gltf.scene.clone(true);
        model.children.forEach((child) => {
          if (child.name === "Pistol_Magazine") child.visible = false;
        });
        pistolTemplate = normalizeWeapon(model, 0.28);
        // pistol.glb also points its muzzle along +X.
        pistolTemplate.rotation.y = Math.PI / 2;
        done();
      },
      undefined,
      () => done()
    );
  });
  return loadPromise;
}

function makeProceduralAk() {
  const group = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1c16, roughness: 0.55, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.14), black);
  group.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), black);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = 0.62;
  group.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.08), black);
  mag.position.set(0.05, -0.22, 0);
  mag.rotation.z = 0.25;
  group.add(mag);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.1), wood);
  stock.position.set(-0.55, 0, 0);
  group.add(stock);
  // Procedural barrel is authored toward +X; map it to local -Z.
  group.rotation.y = Math.PI / 2;
  return group;
}

function makeProceduralPistol() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.35, metalness: 0.8 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), steel);
  group.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.08), steel);
  grip.position.set(-0.05, -0.12, 0);
  group.add(grip);
  group.rotation.y = Math.PI / 2;
  return group;
}

export type EnemyWeaponKind = "ak47" | "pistol";

function findNamedBone(root: THREE.Object3D, exactSuffixes: string | string[]): THREE.Object3D | null {
  const suffixes = Array.isArray(exactSuffixes) ? exactSuffixes : [exactSuffixes];
  let found: THREE.Object3D | null = null;
  let fallback: THREE.Object3D | null = null;
  root.traverse((child) => {
    const n = child.name;
    if (!n) return;
    // Finger bones include the hand suffix (RightHandThumb1) — skip those.
    if (/thumb|index|middle|ring|pinky/i.test(n)) return;
    const isExact = suffixes.some(
      (exactSuffix) =>
        n === exactSuffix ||
        n === `mixamorig${exactSuffix}` ||
        n === `mixamorig:${exactSuffix}` ||
        n.endsWith(`:${exactSuffix}`) ||
        n.endsWith(`_${exactSuffix}`) ||
        n.endsWith(exactSuffix)
    );
    if (!isExact) return;
    // Prefer the shortest exact name (RightHand over nested helpers).
    if (!found || n.length < found.name.length) found = child;
    fallback = fallback || child;
  });
  return found || fallback;
}

function cancelRigScale(kit: THREE.Object3D, bone: THREE.Object3D, soldier: THREE.Object3D) {
  soldier.updateMatrixWorld(true);
  const boneScale = bone.getWorldScale(new THREE.Vector3());
  const soldierScale = soldier.getWorldScale(new THREE.Vector3());
  kit.scale.set(
    boneScale.x ? soldierScale.x / boneScale.x : 1,
    boneScale.y ? soldierScale.y / boneScale.y : 1,
    boneScale.z ? soldierScale.z / boneScale.z : 1
  );
}

function addMuzzleMarker(primary: THREE.Object3D, kind: EnemyWeaponKind) {
  const muzzle = new THREE.Object3D();
  muzzle.name = "WeaponMuzzle";
  // After normalize + PI/2 yaw, barrel points along -Z in kit space.
  if (kind === "pistol") muzzle.position.set(0, 0.02, -0.18);
  else muzzle.position.set(0, 0.02, -0.72);
  primary.add(muzzle);
  return muzzle;
}

export function attachEnemyWeapon(soldier: THREE.Group, kind: EnemyWeaponKind = "ak47") {
  try {
    const existing = soldier.getObjectByName("EnemyWeaponKit");
    if (existing) existing.parent?.remove(existing);

    const kit = new THREE.Group();
    kit.name = "EnemyWeaponKit";

    let weaponVisual: THREE.Object3D;
    if (kind === "pistol") {
      weaponVisual = pistolTemplate ? pistolTemplate.clone(true) : makeProceduralPistol();
    } else {
      weaponVisual = akTemplate ? akTemplate.clone(true) : makeProceduralAk();
    }
    weaponVisual.name = "EnemyWeaponVisual";

    // Keep source-axis normalization on the visual. Hand-pose rotations belong
    // on a separate mount; assigning them directly used to erase the -90° yaw.
    const primary = new THREE.Group();
    primary.name = "EnemyPrimaryWeapon";
    primary.add(weaponVisual);

    const isRigged = soldier.userData.modelType === "mixamo-glb" || soldier.userData.modelType === "fbx-mixamo";
    const rightHand = isRigged ? findNamedBone(soldier, ["RightHand", "HandR", "WristR"]) : null;

    if (rightHand) {
      const isQuaterniusRig = /wrist.?r/i.test(rightHand.name);
      if (isQuaterniusRig) {
        // WristR carries animation-space rotations that turn separately loaded
        // props vertical/backward. Keep the firearm on a stable soldier-local
        // presentation mount: local -Z remains the muzzle direction while the
        // authored gun animations place both hands around this chest position.
        if (kind === "pistol") {
          primary.position.set(0.2, 1.34, -0.27);
          primary.rotation.set(-0.04, 0, 0.02);
        } else {
          primary.position.set(0.16, 1.3, -0.34);
          primary.rotation.set(-0.04, 0, 0.02);
        }
        kit.add(primary);
        soldier.add(kit);
        soldier.userData.weaponBoneAttached = false;
        soldier.userData.weaponAttachmentMode = "chest-presentation";
      } else {
        if (kind === "pistol") {
          primary.position.set(0.02, 0.04, 0.06);
          primary.rotation.set(-Math.PI * 0.5, Math.PI * 0.05, Math.PI * 0.08);
          weaponVisual.scale.multiplyScalar(1.05);
        } else {
          primary.position.set(0.04, 0.06, 0.12);
          primary.rotation.set(-Math.PI * 0.52, 0.08, 0.12);
        }
        rightHand.add(kit);
        cancelRigScale(kit, rightHand, soldier);
        kit.add(primary);
        soldier.userData.weaponBoneAttached = true;
        soldier.userData.weaponAttachmentMode = "hand";
      }
    } else if (isRigged) {
      primary.position.set(0.28, 1.15, -0.35);
      primary.rotation.set(-0.15, 0.1, 0.05);
      if (kind === "pistol") {
        primary.position.set(0.32, 1.2, -0.28);
        primary.scale.multiplyScalar(1.1);
      }
      kit.add(primary);
      soldier.add(kit);
      soldier.userData.weaponBoneAttached = false;
    } else {
      const limbs = soldier.userData.limbs;
      if (limbs?.rifle) limbs.rifle.visible = false;
      primary.position.set(0.36, 1.52, -0.47);
      primary.rotation.set(0, -0.15, 0);
      kit.add(primary);
      soldier.add(kit);
      soldier.userData.weaponBoneAttached = false;
    }

    const muzzle = addMuzzleMarker(primary, kind);

    if (kind === "ak47") {
      const sidearm = pistolTemplate ? pistolTemplate.clone(true) : makeProceduralPistol();
      sidearm.name = "EnemySidearm";
      sidearm.scale.multiplyScalar(0.85);
      const hips = isRigged ? findNamedBone(soldier, "Hips") : null;
      if (hips) {
        const holster = new THREE.Group();
        holster.name = "EnemyHolster";
        sidearm.position.set(-0.18, 0.05, 0.08);
        sidearm.rotation.set(0.35, Math.PI * 0.5, 0.55);
        hips.add(holster);
        cancelRigScale(holster, hips, soldier);
        holster.add(sidearm);
      } else {
        sidearm.position.set(-0.32, 1.05, 0.08);
        sidearm.rotation.set(0.2, Math.PI * 0.5, 0.4);
        kit.add(sidearm);
      }
    }

    soldier.userData.enemyWeapon = kind;
    soldier.userData.hasVisibleWeapon = true;
    soldier.userData.muzzleObject = muzzle;
    return kit;
  } catch (err) {
    console.warn("[BDS] attachEnemyWeapon failed, using procedural fallback", err);
    soldier.userData.hasVisibleWeapon = false;
    return null;
  }
}

export function getEnemyMuzzleWorldPos(soldier: THREE.Object3D, target = new THREE.Vector3()) {
  const muzzle = soldier.userData.muzzleObject as THREE.Object3D | undefined;
  if (muzzle) {
    muzzle.getWorldPosition(target);
    return target;
  }
  soldier.getWorldPosition(target);
  target.y += 1.45;
  // Approximate forward along visual front (local -Z after lookAt+PI)
  const forward = new THREE.Vector3(0, 0, -0.55).applyQuaternion(soldier.getWorldQuaternion(new THREE.Quaternion()));
  target.add(forward);
  return target;
}

export function pickEnemyWeapon(typeName: string): EnemyWeaponKind {
  if (typeName === "Scout") return "pistol";
  if (typeName === "Sniper") return Math.random() < 0.25 ? "pistol" : "ak47";
  return "ak47";
}
