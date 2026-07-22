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
          if (child instanceof THREE.Mesh) child.castShadow = false;
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

function normalizeBoneToken(name: string) {
  // Quaternius / Blender export as Wrist.R; Three may keep or strip the dot.
  return name.replace(/[._\s:-]/g, "").toLowerCase();
}

function boneNameMatches(nodeName: string, exactSuffix: string) {
  if (
    nodeName === exactSuffix ||
    nodeName === `mixamorig${exactSuffix}` ||
    nodeName === `mixamorig:${exactSuffix}` ||
    nodeName.endsWith(`:${exactSuffix}`) ||
    nodeName.endsWith(`_${exactSuffix}`) ||
    nodeName.endsWith(`.${exactSuffix}`) ||
    nodeName.endsWith(exactSuffix)
  ) {
    return true;
  }
  const normalizedNode = normalizeBoneToken(nodeName);
  const normalizedSuffix = normalizeBoneToken(exactSuffix);
  return normalizedNode === normalizedSuffix || normalizedNode.endsWith(normalizedSuffix);
}

function findNamedBone(root: THREE.Object3D, exactSuffixes: string | string[]): THREE.Object3D | null {
  const suffixes = Array.isArray(exactSuffixes) ? exactSuffixes : [exactSuffixes];

  // Prefer real skeleton bones from SkinnedMesh — parenting to a similarly named
  // Object3D leaves the weapon floating at bind pose while the mesh animates.
  const skeletonBones: THREE.Bone[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && child.skeleton?.bones?.length) {
      for (const bone of child.skeleton.bones) skeletonBones.push(bone);
    }
  });
  const pickFrom = (nodes: THREE.Object3D[]) => {
    let found: THREE.Object3D | null = null;
    for (const child of nodes) {
      const n = child.name;
      if (!n) continue;
      if (/thumb|index|middle|ring|pinky/i.test(n)) continue;
      const isExact = suffixes.some((exactSuffix) => boneNameMatches(n, exactSuffix));
      if (!isExact) continue;
      if (!found || n.length < found.name.length) found = child;
    }
    return found;
  };

  const fromSkeleton = pickFrom(skeletonBones);
  if (fromSkeleton) return fromSkeleton;

  let found: THREE.Object3D | null = null;
  let fallback: THREE.Object3D | null = null;
  root.traverse((child) => {
    const n = child.name;
    if (!n) return;
    if (/thumb|index|middle|ring|pinky/i.test(n)) return;
    const isExact = suffixes.some((exactSuffix) => boneNameMatches(n, exactSuffix));
    if (!isExact) return;
    // Prefer THREE.Bone over plain Object3D helpers with the same name.
    const isBone = child instanceof THREE.Bone;
    if (
      !found
      || (isBone && !(found instanceof THREE.Bone))
      || ((isBone === (found instanceof THREE.Bone)) && n.length < found.name.length)
    ) {
      found = child;
    }
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

/** Force the held weapon to a readable world length after bone parenting/scale cancel. */
function fitHeldWeaponWorldSize(kit: THREE.Object3D, primary: THREE.Object3D, targetLongest: number) {
  kit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(primary);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest < 0.001) return;
  kit.scale.multiplyScalar(targetLongest / longest);
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

/**
 * `normalizeWeapon` centers on the bbox midpoint, so the pistol grip is NOT at
 * the origin — parenting that origin to the wrist makes the gun poke through the
 * palm. Shift the visual so the grip sits at local (0,0,0).
 *
 * After rotation.y = PI/2: muzzle → -Z, stock → +Z, magazine / grip → -Y.
 */
function alignGripToOrigin(visual: THREE.Object3D, kind: EnemyWeaponKind) {
  visual.position.set(0, 0, 0);
  visual.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(visual);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x < 1e-4) {
    // Fallback if geometry isn't ready yet.
    if (kind === "pistol") visual.position.set(0, 0.06, 0.02);
    else visual.position.set(0, 0.11, -0.055);
    return;
  }

  // Grip sits below the receiver and slightly toward the stock (+Z), not at the
  // mag tip (absolute bottom) and not at the bbox center.
  const gripY =
    kind === "pistol"
      ? box.min.y + size.y * 0.32
      : box.min.y + size.y * 0.34;
  const gripZ =
    kind === "pistol"
      ? box.min.z + size.z * 0.48
      : box.min.z + size.z * 0.48;
  const gripX = (box.min.x + box.max.x) * 0.5;
  visual.position.set(-gripX, -gripY, -gripZ);
}

/** Mixamo RightHand local axes — grip in palm, muzzle roughly along fingers. */
function posePrimaryOnHand(primary: THREE.Object3D, kind: EnemyWeaponKind) {
  if (kind === "pistol") {
    primary.position.set(0.02, 0.04, 0.06);
    primary.rotation.set(-Math.PI * 0.5, Math.PI * 0.05, Math.PI * 0.08);
  } else {
    primary.position.set(0.04, 0.06, 0.12);
    primary.rotation.set(-Math.PI * 0.52, 0.08, 0.12);
  }
}

/**
 * Quaternius WristR — fixed soldier-local aim while position tracks the bone.
 * Barrel along local -Z after visual PI/2 yaw; slight pitch matches gun clips.
 */
function posePrimaryOnQuaterniusWrist(primary: THREE.Object3D, kind: EnemyWeaponKind) {
  if (kind === "pistol") {
    primary.rotation.set(-0.06, 0, 0.015);
  } else {
    primary.rotation.set(-0.05, 0, 0.02);
  }
}

const _wristWorld = new THREE.Vector3();
const _gripLocal = new THREE.Vector3();
const _gripOffset = new THREE.Vector3();
const _visualWorld = new THREE.Vector3();
const _soldierInv = new THREE.Matrix4();
const _wristInSoldier = new THREE.Vector3();
const _visualInSoldier = new THREE.Vector3();

/**
 * Seat grip on WristR each frame without inheriting the bone's bind-pose twist
 * (which previously drove the mesh through the palm). Position follows the
 * animated wrist; rotation stays on the tuned soldier-local aim.
 */
export function syncEnemyWeaponGrip(soldier: THREE.Group) {
  if (soldier.userData.weaponAttachmentMode !== "wrist-follow") return;
  const primary = soldier.getObjectByName("EnemyPrimaryWeapon") as THREE.Object3D | null;
  const boneName = soldier.userData.weaponHandBone as string | undefined;
  if (!primary || !boneName) return;

  const wrist = findNamedBone(soldier, boneName);
  if (!wrist) return;

  const fine = soldier.userData.weaponGripFineOffset as THREE.Vector3 | undefined;
  if (fine) _gripOffset.copy(fine);
  else _gripOffset.set(0, 0, 0);

  // Calibrate once the gun-ready clip is playing — attach runs before playAnimation.
  if (!soldier.userData.weaponGripCalibrated) {
    const visual = soldier.getObjectByName("EnemyWeaponVisual");
    if (visual) {
      soldier.updateMatrixWorld(true);
      wrist.getWorldPosition(_wristWorld);
      visual.getWorldPosition(_visualWorld);
      _soldierInv.copy(soldier.matrixWorld).invert();
      _wristInSoldier.copy(_wristWorld).applyMatrix4(_soldierInv);
      _visualInSoldier.copy(_visualWorld).applyMatrix4(_soldierInv);
      _gripOffset.add(_wristInSoldier.sub(_visualInSoldier));
      if (!soldier.userData.weaponGripFineOffset) {
        soldier.userData.weaponGripFineOffset = _gripOffset.clone();
      } else {
        soldier.userData.weaponGripFineOffset.copy(_gripOffset);
      }
      soldier.userData.weaponGripCalibrated = true;
      // Palm center sits slightly above the wrist bone — lift grip into the fist.
      const weaponKind = soldier.userData.enemyWeapon as EnemyWeaponKind | undefined;
      soldier.userData.weaponGripFineOffset.y += weaponKind === "pistol" ? 0.022 : 0.028;
    }
  }

  wrist.getWorldPosition(_wristWorld);
  soldier.updateMatrixWorld(true);
  _gripLocal.copy(_wristWorld);
  soldier.worldToLocal(_gripLocal);
  primary.position.copy(_gripLocal).add(_gripOffset);
}

export function attachEnemyWeapon(soldier: THREE.Group, kind: EnemyWeaponKind = "ak47") {
  try {
    const existing = soldier.getObjectByName("EnemyWeaponKit");
    if (existing) existing.parent?.remove(existing);
    const existingHolster = soldier.getObjectByName("EnemyHolster");
    if (existingHolster) existingHolster.parent?.remove(existingHolster);

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
    // Prefer distal hand bones over wrist so the grip sits in the fingers/palm.
    const rightHand = isRigged
      ? findNamedBone(soldier, ["HandR", "RightHand", "handr", "WristR", "RightWrist"])
      : null;

    if (rightHand) {
      const boneToken = normalizeBoneToken(rightHand.name);
      // Quaternius exports Wrist.R; Mixamo uses mixamorigRightHand — different local axes.
      const isQuaterniusRig = /wristr$/.test(boneToken) || (/handr$/.test(boneToken) && !/righthand|mixamo/.test(boneToken));

      if (isQuaterniusRig) {
        // Parenting directly to WristR inherited bind-pose twist and spiked the
        // barrel through the palm. Track wrist world position each frame but
        // keep a stable soldier-local aim aligned with idle_gun / run_shoot clips.
        alignGripToOrigin(weaponVisual, kind);
        if (kind === "pistol") weaponVisual.scale.multiplyScalar(1.05);
        posePrimaryOnQuaterniusWrist(primary, kind);
        kit.add(primary);
        soldier.add(kit);
        soldier.updateMatrixWorld(true);
        const wristLocal = new THREE.Vector3();
        rightHand.getWorldPosition(wristLocal);
        soldier.worldToLocal(wristLocal);
        // Nudge grip into palm (bone sits at wrist joint, not palm center).
        soldier.userData.weaponGripFineOffset = new THREE.Vector3(
          kind === "pistol" ? 0.008 : 0.006,
          kind === "pistol" ? -0.012 : -0.016,
          kind === "pistol" ? 0.018 : 0.024
        );
        primary.position.copy(wristLocal).add(soldier.userData.weaponGripFineOffset);
        fitHeldWeaponWorldSize(kit, primary, kind === "pistol" ? 0.32 : 1.05);
        soldier.userData.weaponGripCalibrated = false;
        soldier.userData.weaponBoneAttached = false;
        soldier.userData.weaponAttachmentMode = "wrist-follow";
        soldier.userData.weaponHandBone = rightHand.name;
        soldier.userData.weaponBoneIsSkeleton = rightHand instanceof THREE.Bone;
      } else {
        alignGripToOrigin(weaponVisual, kind);
        if (kind === "pistol") weaponVisual.scale.multiplyScalar(1.05);
        posePrimaryOnHand(primary, kind);
        rightHand.add(kit);
        cancelRigScale(kit, rightHand, soldier);
        kit.add(primary);
        fitHeldWeaponWorldSize(kit, primary, kind === "pistol" ? 0.32 : 1.05);
        soldier.userData.weaponBoneAttached = true;
        soldier.userData.weaponAttachmentMode = "hand";
        soldier.userData.weaponHandBone = rightHand.name;
        soldier.userData.weaponBoneIsSkeleton = rightHand instanceof THREE.Bone;
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
      soldier.userData.weaponAttachmentMode = "chest-fallback";
    } else {
      const limbs = soldier.userData.limbs;
      if (limbs?.rifle) limbs.rifle.visible = false;
      primary.position.set(0.36, 1.52, -0.47);
      primary.rotation.set(0, -0.15, 0);
      kit.add(primary);
      soldier.add(kit);
      soldier.userData.weaponBoneAttached = false;
      soldier.userData.weaponAttachmentMode = "procedural";
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
