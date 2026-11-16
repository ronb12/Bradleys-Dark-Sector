/** Enemy visible weapons — AK-47 rifle + sidearm pistol, hand-bone attached. */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { createOriginalEnemyWeapon } from "./darkSectorEnemyWeapons";

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
    if (kind === "pistol") visual.position.set(0, 0.06, 0.02);
    else visual.position.set(0, 0.11, 0.02);
    return;
  }

  // Grip sits below the receiver and toward the stock (+Z), not near the muzzle.
  const gripY =
    kind === "pistol"
      ? box.min.y + size.y * 0.32
      : box.min.y + size.y * 0.36;
  const gripZ =
    kind === "pistol"
      ? box.min.z + size.z * 0.55
      : box.min.z + size.z * 0.68;
  const gripX = (box.min.x + box.max.x) * 0.5;
  visual.position.set(-gripX, -gripY, -gripZ);
}

/**
 * Wrist-follow mounts were showing Quaternius AKs stock-forward. Flip the
 * visual 180° around Y and re-seat the grip so the barrel leads soldier -Z.
 */
function fixReversedRifleVisual(visual: THREE.Object3D, kind: EnemyWeaponKind) {
  if (kind !== "ak47") return;
  visual.rotation.y += Math.PI;
  alignGripToOrigin(visual, kind);
}

function syncMuzzleToBarrelTip(primary: THREE.Object3D, visual: THREE.Object3D, kind: EnemyWeaponKind) {
  const muzzle = primary.getObjectByName("WeaponMuzzle");
  if (!muzzle) return;
  visual.updateWorldMatrix(true, true);
  primary.updateWorldMatrix(true, true);
  const inv = primary.matrixWorld.clone().invert();
  const worldBox = new THREE.Box3().setFromObject(visual);
  const midY = (worldBox.min.y + worldBox.max.y) * 0.5;
  const midX = (worldBox.min.x + worldBox.max.x) * 0.5;
  const a = new THREE.Vector3(midX, midY, worldBox.min.z).applyMatrix4(inv);
  const b = new THREE.Vector3(midX, midY, worldBox.max.z).applyMatrix4(inv);
  // Muzzle = end farther along -Z (soldier / primary forward).
  const tip = a.z < b.z ? a : b;
  muzzle.position.set(0, kind === "pistol" ? 0.02 : 0.025, tip.z - Math.sign(tip.z || -1) * 0.02);
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
    primary.rotation.set(-0.08, 0, 0.02);
  } else {
    // Keep rifle level with soldier -Z aim (Run_Shoot / Idle_Gun_Pointing).
    primary.rotation.set(-0.04, 0, 0.015);
  }
}

const _wristWorld = new THREE.Vector3();
const _gripLocal = new THREE.Vector3();
const _palmWorld = new THREE.Vector3();
const _wristQuat = new THREE.Quaternion();
const _palmBoneLocal = new THREE.Vector3();
const _soldierQuat = new THREE.Quaternion();
const _wristLocalQuat = new THREE.Quaternion();
const _deltaQuat = new THREE.Quaternion();

/**
 * Seat grip on WristR/HandR each frame without inheriting bind-pose twist.
 * Palm offset is applied in the bone's world orientation so the rifle stays
 * in the fist as the arm animates (soldier-space offsets floated the gun away).
 *
 * Rotation follows the delta the wrist has swung through since attach time
 * (soldier-local, relative to a captured baseline), composed onto the tuned
 * aim pose — not the wrist's raw orientation. Adopting the raw bone
 * quaternion directly (literal bone-parenting) previously inherited
 * bind-pose twist and spiked the barrel through the palm; tracking a delta
 * from a captured baseline keeps the tuned aim pose as neutral while still
 * letting the gun swing through run/walk gaits instead of staying frozen at
 * the aim pose while only its position followed the hand.
 */
export function syncEnemyWeaponGrip(soldier: THREE.Group) {
  if (soldier.userData.weaponAttachmentMode !== "wrist-follow") return;
  const primary = soldier.getObjectByName("EnemyPrimaryWeapon") as THREE.Object3D | null;
  const boneName = soldier.userData.weaponHandBone as string | undefined;
  if (!primary || !boneName) return;

  const wrist = findNamedBone(soldier, boneName);
  if (!wrist) return;

  const weaponKind = (soldier.userData.enemyWeapon as EnemyWeaponKind | undefined) || "ak47";
  const fine = soldier.userData.weaponGripFineOffset as THREE.Vector3 | undefined;
  // Bone-local palm: +X into fingers-ish, +Y toward palm center for Quaternius WristR.
  if (fine) _palmBoneLocal.copy(fine);
  else {
    _palmBoneLocal.set(
      weaponKind === "pistol" ? 0.01 : 0.012,
      weaponKind === "pistol" ? 0.045 : 0.055,
      weaponKind === "pistol" ? 0.02 : 0.028,
    );
  }

  wrist.updateWorldMatrix(true, false);
  wrist.getWorldPosition(_wristWorld);
  wrist.getWorldQuaternion(_wristQuat);
  _palmWorld.copy(_palmBoneLocal).applyQuaternion(_wristQuat).add(_wristWorld);

  soldier.updateMatrixWorld(true);
  _gripLocal.copy(_palmWorld);
  soldier.worldToLocal(_gripLocal);
  primary.position.copy(_gripLocal);

  const baseWristLocalQuat = soldier.userData.weaponGripBaseWristLocalQuat as THREE.Quaternion | undefined;
  const baseAimQuat = soldier.userData.weaponGripBaseAimQuat as THREE.Quaternion | undefined;
  if (baseWristLocalQuat && baseAimQuat) {
    soldier.getWorldQuaternion(_soldierQuat);
    _wristLocalQuat.copy(_soldierQuat).invert().multiply(_wristQuat);
    _deltaQuat.copy(baseWristLocalQuat).invert().premultiply(_wristLocalQuat);
    primary.quaternion.copy(_deltaQuat).multiply(baseAimQuat);
  }
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
    // The hostile soldier family equips original matching weapons. Imported
    // models remain an untouched fallback for allied and PVP rigged avatars.
    if (soldier.userData.modelType === "original-soldier") {
      weaponVisual = createOriginalEnemyWeapon(kind);
    } else if (kind === "pistol") {
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
        fixReversedRifleVisual(weaponVisual, kind);
        if (kind === "pistol") weaponVisual.scale.multiplyScalar(1.05);
        posePrimaryOnQuaterniusWrist(primary, kind);
        // Captured once as the tuned "neutral" aim pose — syncEnemyWeaponGrip
        // composes the wrist's rotation delta since attach onto this each frame.
        soldier.userData.weaponGripBaseAimQuat = primary.quaternion.clone();
        kit.add(primary);
        soldier.add(kit);
        soldier.updateMatrixWorld(true);
        const wristLocal = new THREE.Vector3();
        rightHand.getWorldPosition(wristLocal);
        soldier.worldToLocal(wristLocal);
        // Bone-local palm offset — syncEnemyWeaponGrip applies wrist orientation.
        soldier.userData.weaponGripFineOffset = new THREE.Vector3(
          kind === "pistol" ? 0.01 : 0.014,
          kind === "pistol" ? 0.048 : 0.058,
          kind === "pistol" ? 0.016 : 0.022,
        );
        primary.position.copy(wristLocal);
        {
          // Baseline wrist orientation, in soldier-local space, at attach time —
          // syncEnemyWeaponGrip tracks how far the wrist has rotated from this.
          const wristWorldQuat = new THREE.Quaternion();
          rightHand.getWorldQuaternion(wristWorldQuat);
          const soldierWorldQuat = new THREE.Quaternion();
          soldier.getWorldQuaternion(soldierWorldQuat);
          soldier.userData.weaponGripBaseWristLocalQuat = soldierWorldQuat.invert().multiply(wristWorldQuat);
        }
        fitHeldWeaponWorldSize(kit, primary, kind === "pistol" ? 0.32 : 1.05);
        soldier.userData.weaponGripCalibrated = true;
        soldier.userData.weaponBoneAttached = false;
        soldier.userData.weaponAttachmentMode = "wrist-follow";
        soldier.userData.weaponHandBone = rightHand.name;
        soldier.userData.weaponBoneIsSkeleton = rightHand instanceof THREE.Bone;
        syncEnemyWeaponGrip(soldier);
      } else {
        alignGripToOrigin(weaponVisual, kind);
        fixReversedRifleVisual(weaponVisual, kind);
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
      // The original soldier has an animated WeaponPoseAnchor. Mount the kit
      // to that joint so recoil, kneeling and movement affect both the gun and
      // the muzzle tracer origin, rather than leaving the rifle hovering still.
      if (limbs?.rifle && soldier.userData.modelType === "original-soldier") {
        limbs.rifle.visible = true;
        primary.position.set(0, 0, 0);
        primary.rotation.set(0, -0.15, 0);
        kit.add(primary);
        limbs.rifle.add(kit);
        soldier.userData.weaponAttachmentMode = "animated-rifle-joint";
      } else {
        if (limbs?.rifle) limbs.rifle.visible = false;
        primary.position.set(0.36, 1.52, -0.47);
        primary.rotation.set(0, -0.15, 0);
        kit.add(primary);
        soldier.add(kit);
        soldier.userData.weaponAttachmentMode = "procedural";
      }
      soldier.userData.weaponBoneAttached = false;
    }

    const muzzle = addMuzzleMarker(primary, kind);
    if (isRigged) syncMuzzleToBarrelTip(primary, weaponVisual, kind);
    void muzzle;

    if (kind === "ak47") {
      const sidearm = soldier.userData.modelType === "original-soldier"
        ? createOriginalEnemyWeapon("pistol")
        : pistolTemplate ? pistolTemplate.clone(true) : makeProceduralPistol();
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
