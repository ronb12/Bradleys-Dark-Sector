import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils";

type Hud = {
  health: number;
  ammo: number | string;
  score: number;
  enemies: number;
  wave: number;
  modelMode: string;
};

type LeaderboardEntry = {
  rank: number;
  playerName: string;
  score: number;
  wave: number;
  createdAt: string;
};

type EnemyType = {
  name: string;
  color: number;
  hp: number;
  speed: number;
  score: number;
};

type GameState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  player: THREE.Group;
  weapon: THREE.Group;
  allies: THREE.Group[];
  enemies: THREE.Group[];
  bullets: THREE.Mesh[];
  colliders: THREE.Box3[];
  health: number;
  ammo: number;
  maxAmmo: number;
  score: number;
  wave: number;
  fireCooldown: number;
  reload: number;
  yaw: number;
  pitch: number;
  recoil: number;
  running: boolean;
  disposed: boolean;
  enemyTemplate: THREE.Group | null;
  enemyAnimations: THREE.AnimationClip[];
  fbxClips: Record<string, THREE.AnimationClip>;
  mixers: THREE.AnimationMixer[];
  enemyModelLoaded: boolean;
  fbxModeLoaded: boolean;
};

const ENEMY_TYPES: EnemyType[] = [
  { name: "Rifleman", color: 0x5b5f45, hp: 75, speed: 2.45, score: 100 },
  { name: "Scout", color: 0x3e5541, hp: 55, speed: 3.35, score: 130 },
  { name: "Heavy", color: 0x665a3d, hp: 135, speed: 1.7, score: 220 },
  { name: "Sniper", color: 0x34432f, hp: 65, speed: 2.05, score: 180 },
  { name: "Commander", color: 0x4e3832, hp: 170, speed: 2.15, score: 350 },
];

const SOLDIER_MODEL_URL = "";
const FBX_MODEL_URL = "/models/soldier.fbx";
const FBX_IDLE_MODEL_FALLBACK_URL = "/models/idle.fbx";
const FBX_ANIMATION_URLS: Record<string, string> = {
  idle: "/models/idle.fbx",
  walk: "/models/walk.fbx",
  run: "/models/run.fbx",
  shoot: "/models/shoot.fbx",
};

const SHOOT_ANIMATION_LOCK_SECONDS = 0.32;

type BoneSnapshot = {
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
};

function buildMixamoCombatClips(model: THREE.Group) {
  const rest = new Map<string, BoneSnapshot>();
  model.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      rest.set(child.name, {
        quaternion: child.quaternion.clone(),
        position: child.position.clone(),
      });
    }
  });

  const requiredBones = [
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:Spine1",
    "mixamorig:LeftUpLeg",
    "mixamorig:RightUpLeg",
    "mixamorig:LeftLeg",
    "mixamorig:RightLeg",
    "mixamorig:LeftArm",
    "mixamorig:RightArm",
    "mixamorig:LeftForeArm",
    "mixamorig:RightForeArm",
    "mixamorig:LeftShoulder",
    "mixamorig:RightShoulder",
    "mixamorig:Neck",
    "mixamorig:Head",
  ];
  if (!requiredBones.every((name) => rest.has(name))) return [];

  const clipFromDefinition = (
    name: string,
    duration: number,
    loopOffsets: Record<string, Array<[number, number, number, number]>>,
    hipsYOffset?: Array<[number, number]>
  ) => {
    const tracks: THREE.KeyframeTrack[] = [];
    Object.entries(loopOffsets).forEach(([boneName, frames]) => {
      const base = rest.get(boneName);
      if (!base) return;
      const times: number[] = [];
      const values: number[] = [];
      frames.forEach(([time, x, y, z]) => {
        const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
        const quat = base.quaternion.clone().multiply(offset);
        times.push(time);
        values.push(quat.x, quat.y, quat.z, quat.w);
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
    });
    if (hipsYOffset?.length) {
      const base = rest.get("mixamorig:Hips");
      if (base) {
        const times: number[] = [];
        const values: number[] = [];
        hipsYOffset.forEach(([time, offset]) => {
          times.push(time);
          values.push(base.position.x, base.position.y + offset, base.position.z);
        });
        tracks.push(new THREE.VectorKeyframeTrack("mixamorig:Hips.position", times, values));
      }
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };

  const walk = clipFromDefinition(
    "walk",
    1,
    {
      "mixamorig:LeftUpLeg": [[0, 0.55, 0, 0], [0.5, -0.55, 0, 0], [1, 0.55, 0, 0]],
      "mixamorig:RightUpLeg": [[0, -0.55, 0, 0], [0.5, 0.55, 0, 0], [1, -0.55, 0, 0]],
      "mixamorig:LeftLeg": [[0, -0.32, 0, 0], [0.5, 0.48, 0, 0], [1, -0.32, 0, 0]],
      "mixamorig:RightLeg": [[0, 0.48, 0, 0], [0.5, -0.32, 0, 0], [1, 0.48, 0, 0]],
      "mixamorig:LeftArm": [[0, -0.28, 0, -0.1], [0.5, 0.24, 0, 0.08], [1, -0.28, 0, -0.1]],
      "mixamorig:RightArm": [[0, 0.24, 0, 0.08], [0.5, -0.28, 0, -0.1], [1, 0.24, 0, 0.08]],
      "mixamorig:LeftForeArm": [[0, -0.22, 0, 0], [0.5, -0.08, 0, 0], [1, -0.22, 0, 0]],
      "mixamorig:RightForeArm": [[0, -0.08, 0, 0], [0.5, -0.22, 0, 0], [1, -0.08, 0, 0]],
      "mixamorig:Spine": [[0, 0.04, 0.05, 0], [0.5, -0.04, -0.05, 0], [1, 0.04, 0.05, 0]],
      "mixamorig:Spine1": [[0, -0.03, 0.04, 0], [0.5, 0.03, -0.04, 0], [1, -0.03, 0.04, 0]],
      "mixamorig:Head": [[0, 0.03, 0.02, 0], [0.5, -0.03, -0.02, 0], [1, 0.03, 0.02, 0]],
    },
    [[0, 0.02], [0.5, -0.04], [1, 0.02]]
  );

  const run = clipFromDefinition(
    "run",
    0.72,
    {
      "mixamorig:LeftUpLeg": [[0, 0.92, 0, 0], [0.36, -0.92, 0, 0], [0.72, 0.92, 0, 0]],
      "mixamorig:RightUpLeg": [[0, -0.92, 0, 0], [0.36, 0.92, 0, 0], [0.72, -0.92, 0, 0]],
      "mixamorig:LeftLeg": [[0, -0.22, 0, 0], [0.36, 0.86, 0, 0], [0.72, -0.22, 0, 0]],
      "mixamorig:RightLeg": [[0, 0.86, 0, 0], [0.36, -0.22, 0, 0], [0.72, 0.86, 0, 0]],
      "mixamorig:LeftArm": [[0, -0.48, 0, -0.18], [0.36, 0.42, 0, 0.16], [0.72, -0.48, 0, -0.18]],
      "mixamorig:RightArm": [[0, 0.42, 0, 0.16], [0.36, -0.48, 0, -0.18], [0.72, 0.42, 0, 0.16]],
      "mixamorig:LeftForeArm": [[0, -0.34, 0, 0], [0.36, -0.18, 0, 0], [0.72, -0.34, 0, 0]],
      "mixamorig:RightForeArm": [[0, -0.18, 0, 0], [0.36, -0.34, 0, 0], [0.72, -0.18, 0, 0]],
      "mixamorig:Spine": [[0, 0.07, 0.08, 0], [0.36, -0.07, -0.08, 0], [0.72, 0.07, 0.08, 0]],
      "mixamorig:Spine1": [[0, -0.05, 0.06, 0], [0.36, 0.05, -0.06, 0], [0.72, -0.05, 0.06, 0]],
      "mixamorig:Neck": [[0, 0.03, 0.03, 0], [0.36, -0.03, -0.03, 0], [0.72, 0.03, 0.03, 0]],
    },
    [[0, 0.05], [0.36, -0.09], [0.72, 0.05]]
  );

  const shoot = clipFromDefinition(
    "shoot",
    0.42,
    {
      "mixamorig:Spine": [[0, 0, 0, 0], [0.1, -0.08, 0.1, 0], [0.22, -0.12, 0.15, 0], [0.42, 0, 0, 0]],
      "mixamorig:Spine1": [[0, 0, 0, 0], [0.1, -0.1, 0.12, 0], [0.22, -0.16, 0.16, 0], [0.42, 0, 0, 0]],
      "mixamorig:LeftShoulder": [[0, 0, 0, 0], [0.1, -0.08, 0.08, 0.06], [0.22, -0.14, 0.12, 0.08], [0.42, 0, 0, 0]],
      "mixamorig:RightShoulder": [[0, 0, 0, 0], [0.1, -0.04, -0.06, -0.06], [0.22, -0.08, -0.1, -0.08], [0.42, 0, 0, 0]],
      "mixamorig:LeftArm": [[0, -0.18, 0.02, -0.08], [0.1, -0.46, 0.1, -0.2], [0.22, -0.56, 0.12, -0.24], [0.42, -0.18, 0.02, -0.08]],
      "mixamorig:RightArm": [[0, -0.12, -0.06, 0.08], [0.1, -0.34, -0.16, 0.12], [0.22, -0.42, -0.18, 0.14], [0.42, -0.12, -0.06, 0.08]],
      "mixamorig:LeftForeArm": [[0, -0.45, 0, 0], [0.1, -0.95, 0, 0], [0.22, -1.15, 0.04, 0], [0.42, -0.45, 0, 0]],
      "mixamorig:RightForeArm": [[0, -0.28, 0, 0], [0.1, -0.58, 0, 0], [0.22, -0.7, -0.02, 0], [0.42, -0.28, 0, 0]],
      "mixamorig:Head": [[0, 0, 0, 0], [0.1, -0.02, 0.03, 0], [0.22, -0.03, 0.04, 0], [0.42, 0, 0, 0]],
    },
    [[0, 0], [0.1, -0.01], [0.22, -0.025], [0.42, 0]]
  );

  const idle = clipFromDefinition(
    "idle",
    1.6,
    {
      "mixamorig:Spine": [[0, 0.01, 0.02, 0], [0.8, -0.01, -0.02, 0], [1.6, 0.01, 0.02, 0]],
      "mixamorig:Spine1": [[0, -0.01, -0.01, 0], [0.8, 0.01, 0.01, 0], [1.6, -0.01, -0.01, 0]],
      "mixamorig:Head": [[0, 0.01, 0.01, 0], [0.8, -0.01, -0.01, 0], [1.6, 0.01, 0.01, 0]],
      "mixamorig:LeftArm": [[0, -0.08, 0, -0.02], [0.8, -0.06, 0, 0.02], [1.6, -0.08, 0, -0.02]],
      "mixamorig:RightArm": [[0, -0.06, 0, 0.02], [0.8, -0.08, 0, -0.02], [1.6, -0.06, 0, 0.02]],
    },
    [[0, 0], [0.8, 0.015], [1.6, 0]]
  );

  return [idle, walk, run, shoot].filter(Boolean);
}

function makeMaterial(color: number, roughness = 0.8, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function enableShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function makeRealisticProceduralSoldier(name: string, color: number, enemy = false) {
  const group = new THREE.Group();
  group.name = name;

  const uniform = makeMaterial(color, 0.88, 0.05);
  const vest = makeMaterial(enemy ? 0x2b1717 : 0x202820, 0.9, 0.05);
  const black = makeMaterial(0x080808, 0.55, 0.65);
  const skin = makeMaterial(enemy ? 0xa36a4c : 0x8f5c3f, 0.78, 0.02);
  const darkSkin = makeMaterial(enemy ? 0x8d553b : 0x76452f, 0.8, 0.01);
  const faceDark = new THREE.MeshBasicMaterial({ color: 0x080808 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a1a14 });

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.36), uniform);
  hips.position.y = 0.95;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 8, 16), uniform);
  torso.position.y = 1.55;
  torso.scale.set(1.05, 1, 0.55);
  group.add(torso);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.14), vest);
  plate.position.set(0, 1.55, -0.28);
  group.add(plate);

  const pouchMat = makeMaterial(0x11140f, 0.8, 0.15);
  for (let i = 0; i < 4; i += 1) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.08), pouchMat);
    pouch.position.set(-0.24 + i * 0.16, 1.43, -0.38);
    group.add(pouch);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 28, 20), skin);
  head.position.y = 2.23;
  head.scale.set(0.95, 1.15, 0.92);
  group.add(head);

  const faceZ = -0.28;

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 12), skin);
  nose.position.set(0, 2.18, faceZ - 0.04);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), faceDark);
  leftEye.position.set(-0.095, 2.265, faceZ - 0.025);
  leftEye.scale.set(1, 0.62, 0.45);
  group.add(leftEye);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.095;
  group.add(rightEye);

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.018), faceDark);
  leftBrow.position.set(-0.095, 2.315, faceZ - 0.035);
  leftBrow.rotation.z = -0.18;
  group.add(leftBrow);

  const rightBrow = leftBrow.clone();
  rightBrow.position.x = 0.095;
  rightBrow.rotation.z = 0.18;
  group.add(rightBrow);

  const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), darkSkin);
  leftCheek.position.set(-0.105, 2.145, faceZ - 0.01);
  leftCheek.scale.set(1.05, 0.62, 0.35);
  group.add(leftCheek);

  const rightCheek = leftCheek.clone();
  rightCheek.position.x = 0.105;
  group.add(rightCheek);

  const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skin);
  leftEar.position.set(-0.245, 2.22, 0.01);
  leftEar.scale.set(0.55, 0.95, 0.35);
  group.add(leftEar);

  const rightEar = leftEar.clone();
  rightEar.position.x = 0.245;
  group.add(rightEar);

  const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.026, 0.02), mouthMat);
  mouthLine.position.set(0, 2.065, faceZ - 0.035);
  group.add(mouthLine);

  const chinStrap = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.035, 0.035), black);
  chinStrap.position.set(0, 2.01, -0.06);
  group.add(chinStrap);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    uniform
  );
  helmet.position.y = 2.38;
  helmet.scale.set(1.12, 1, 1.04);
  group.add(helmet);

  const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.16), uniform);
  helmetBrim.position.set(0, 2.23, -0.23);
  group.add(helmetBrim);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.22), black);
  backpack.position.set(0, 1.52, 0.33);
  group.add(backpack);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 8), black);
  antenna.position.set(-0.17, 2.02, 0.37);
  antenna.rotation.z = 0.2;
  group.add(antenna);

  const makeLimb = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material
  ) => {
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, sy, 8, 12), mat);
    limb.position.set(x, y, z);
    limb.scale.set(sx, 1, sz);
    group.add(limb);
    return limb;
  };

  makeLimb(-0.19, 0.47, 0, 1, 0.72, 0.95, uniform);
  makeLimb(0.19, 0.47, 0, 1, 0.72, 0.95, uniform);
  makeLimb(-0.54, 1.55, -0.02, 1, 0.63, 0.92, uniform);
  makeLimb(0.54, 1.55, -0.02, 1, 0.63, 0.92, uniform);

  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.44), black);
  lBoot.position.set(-0.19, 0.05, 0.08);
  group.add(lBoot);

  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.44), black);
  rBoot.position.set(0.19, 0.05, 0.08);
  group.add(rBoot);

  const rifle = new THREE.Group();
  const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.11, 0.13), black);
  rifleBody.position.set(0, 0, 0);
  rifle.add(rifleBody);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), black);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.75, -0.01, 0);
  rifle.add(barrel);
  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.11), black);
  scope.position.set(0.05, 0.1, 0);
  rifle.add(scope);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.09), black);
  mag.position.set(-0.08, -0.18, 0);
  mag.rotation.z = -0.2;
  rifle.add(mag);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.18), black);
  stock.position.set(-0.58, -0.04, 0.02);
  stock.rotation.z = -0.3;
  rifle.add(stock);
  rifle.position.set(0.08, 1.54, -0.08);
  rifle.rotation.z = -0.18;
  group.add(rifle);

  enableShadows(group);
  group.userData.baseY = 0;
  return group;
}

function playAnimation(state: GameState, model: THREE.Group, preferredNames: string[]) {
  const clips = (model.userData.animationClips as THREE.AnimationClip[] | undefined) || state.enemyAnimations || [];
  if (!clips.length) return false;
  const clip =
    preferredNames.map((name) => clips.find((item) => item.name.toLowerCase().includes(name.toLowerCase()))).find(Boolean) ||
    clips[0];
  if (!clip) return false;
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  model.userData.mixer = mixer;
  model.userData.currentAction = action;
  state.mixers.push(mixer);
  return true;
}

function switchEnemyAnimation(state: GameState, model: THREE.Group, preferredNames: string[], force = false) {
  const clips = (model.userData.animationClips as THREE.AnimationClip[] | undefined) || state.enemyAnimations || [];
  if (!clips.length) return false;
  const clip =
    preferredNames.map((name) => clips.find((item) => item.name.toLowerCase().includes(name.toLowerCase()))).find(Boolean) ||
    clips[0];
  if (!clip) return false;
  const mixer = model.userData.mixer as THREE.AnimationMixer | undefined;
  const oldAction = model.userData.currentAction as THREE.AnimationAction | undefined;
  const currentClipName = oldAction?.getClip().name || "";
  if (!force && currentClipName === clip.name) return true;
  if (!mixer) return playAnimation(state, model, preferredNames);
  const action = mixer.clipAction(clip);
  oldAction?.fadeOut(0.12);
  action.reset().fadeIn(0.12).play();
  model.userData.currentAction = action;
  return true;
}

function spawnEnemyFromTemplate(
  state: GameState,
  enemyType: EnemyType,
  x: number,
  z: number
) {
  const enemy = state.enemyTemplate
    ? (cloneSkeleton(state.enemyTemplate) as THREE.Group)
    : makeRealisticProceduralSoldier(enemyType.name, enemyType.color, true);
  enemy.position.set(x, 0, z);
  enemy.userData.hp = enemyType.hp;
  enemy.userData.speed = enemyType.speed;
  enemy.userData.score = enemyType.score;
  enemy.userData.flank = Math.random() > 0.5 ? 1 : -1;
  enemy.userData.kind = enemyType.name;
  enemy.userData.lockedUntil = 0;
  if (state.enemyTemplate) {
    enemy.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    enemy.userData.animationClips = state.enemyAnimations;
    switchEnemyAnimation(state, enemy, ["idle", "walk", "run"], true);
  }
  state.scene.add(enemy);
  state.enemies.push(enemy);
}

function setupFbxModelAsEnemyTemplate(state: GameState, fbxModel: THREE.Group, label: string) {
  enableShadows(fbxModel);
  fbxModel.scale.setScalar(0.0125);
  fbxModel.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  state.enemyTemplate = fbxModel;
  state.enemyAnimations = buildMixamoCombatClips(fbxModel);
  state.fbxModeLoaded = true;
  state.enemyModelLoaded = true;
  state.enemies.forEach((enemy) => {
    state.scene.remove(enemy);
  });
  state.enemies = [];
  state.wave = 1;
  state.score = 0;
  state.health = 100;
  state.ammo = state.maxAmmo;
  state.running = false;
  setTimeout(() => {
    state.running = true;
  }, 150);
  state.player.position.set(0, 0, 8);
  state.camera.position.copy(state.player.position).add(new THREE.Vector3(0, 1.95, 0));
  state.camera.lookAt(state.player.position.clone().add(new THREE.Vector3(0, 1.5, -4)));
  state.enemyModelLoaded = true;
  state.fbxModeLoaded = true;
  state.mixers = state.mixers.filter((mixer) => mixer.getRoot() !== fbxModel);
  console.info(label);
}

async function loadEnemyModel(state: GameState, setHud: React.Dispatch<React.SetStateAction<Hud>>) {
  const fbxLoader = new FBXLoader();
  const gltfLoader = new GLTFLoader();

  const setMode = (modelMode: string) => {
    setHud((current) => ({ ...current, modelMode }));
  };

  try {
    if (SOLDIER_MODEL_URL) {
      const gltf = await gltfLoader.loadAsync(SOLDIER_MODEL_URL);
      const model = gltf.scene;
      model.scale.setScalar(1.08);
      model.rotation.y = Math.PI;
      enableShadows(model);
      state.enemyTemplate = model;
      state.enemyAnimations = gltf.animations || [];
      state.enemyModelLoaded = true;
      setMode("Mixamo GLB soldier");
      return;
    }
  } catch (error) {
    console.warn("GLB model unavailable, trying FBX.", error);
  }

  try {
    const fbxModel = await fbxLoader.loadAsync(FBX_MODEL_URL);
    setupFbxModelAsEnemyTemplate(state, fbxModel as THREE.Group, "Real FBX soldier.fbx loaded");
    setMode("FBX soldier + combat clips");
    return;
  } catch (error) {
    console.warn("Primary FBX model unavailable, trying idle fallback.", error);
  }

  try {
    const idleFbxModel = await fbxLoader.loadAsync(FBX_IDLE_MODEL_FALLBACK_URL);
    setupFbxModelAsEnemyTemplate(state, idleFbxModel as THREE.Group, "Real FBX idle.fbx model loaded");
    setMode("FBX idle soldier + combat clips");
    return;
  } catch (error) {
    console.warn("FBX fallback model unavailable, using procedural soldiers.", error);
  }

  state.enemyTemplate = null;
  state.enemyAnimations = [];
  state.enemyModelLoaded = false;
  setMode("procedural 3D fallback");
}

function makeBox(width: number, height: number, depth: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    makeMaterial(color, 0.9, 0.05)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#1a1712";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 9000; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const alpha = 0.03 + Math.random() * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 250; i += 1) {
    ctx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.12})`;
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.stroke();
  }
  return canvas;
}

function addDust(scene: THREE.Scene) {
  const positions = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i += 1) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 180;
    positions[i * 3 + 1] = Math.random() * 12 + 0.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xb8aa84,
    size: 0.07,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
}

function addFogBanks(scene: THREE.Scene) {
  const group = new THREE.Group();
  for (let i = 0; i < 12; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(2 + Math.random() * 3, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0x6f756e,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
      })
    );
    puff.position.set((Math.random() - 0.5) * 90, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 90);
    puff.scale.z = 2.4;
    group.add(puff);
  }
  scene.add(group);
}

function makeWeapon() {
  const group = new THREE.Group();
  const black = makeMaterial(0x090909, 0.45, 0.65);
  const metal = makeMaterial(0x4a5563, 0.4, 0.8);
  const glow = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.2,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 1.25), black);
  group.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 16), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.8);
  group.add(barrel);
  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.35), black);
  scope.position.set(0, 0.15, -0.15);
  group.add(scope);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glow);
  sight.position.set(0, 0.2, -0.68);
  group.add(sight);
  group.position.set(0.38, -0.28, -0.75);
  return group;
}

function addStatic(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number
) {
  mesh.position.set(x, y, z);
  scene.add(mesh);
  colliders.push(new THREE.Box3().setFromObject(mesh));
}

function addEnvironment(scene: THREE.Scene, colliders: THREE.Box3[]) {
  const concrete = makeMaterial(0x3a3c3a, 0.95, 0.04);
  const darkConcrete = makeMaterial(0x1d1f1d, 0.98, 0.02);
  const metal = makeMaterial(0x4e514d, 0.7, 0.35);
  const sand = makeMaterial(0x51473c, 1, 0.01);

  const compoundSegments = [
    { x: 0, z: -28, w: 40, h: 6, d: 1.8 },
    { x: 0, z: 28, w: 40, h: 6, d: 1.8 },
    { x: -28, z: 0, w: 1.8, h: 6, d: 40 },
    { x: 28, z: 0, w: 1.8, h: 6, d: 40 },
  ];

  compoundSegments.forEach(({ x, z, w, h, d }) => {
    const group = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.45), concrete);
    back.position.set(0, h / 2, 0);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.45, h * 0.8, d), concrete);
    left.position.set(-w / 2 + 0.2, h * 0.4, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, d), concrete);
    right.position.set(w / 2 - 0.2, h * 0.5, 0);
    const frontA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.62, 0.45), concrete);
    frontA.position.set(-w * 0.34, h * 0.31, d / 2 - 0.2);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), darkConcrete);
    floor.position.set(0, 0.11, 0);
    [back, left, right, frontA, floor].forEach((item) => {
      item.castShadow = true;
      item.receiveShadow = true;
      group.add(item);
    });
    group.position.set(x, 0, z);
    scene.add(group);
    group.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.BoxGeometry &&
        child.position.y > 0.5
      ) {
        colliders.push(new THREE.Box3().setFromObject(child));
      }
    });
  });

  for (let i = 0; i < 24; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), metal);
    crate.position.set((Math.random() - 0.5) * 44, 0.6, (Math.random() - 0.5) * 44);
    crate.rotation.y = Math.random() * Math.PI;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    if (i < 15) colliders.push(new THREE.Box3().setFromObject(crate));
  }

  for (let i = 0; i < 12; i += 1) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8), sand);
    bag.position.set((Math.random() - 0.5) * 34, 0.45, (Math.random() - 0.5) * 34);
    bag.scale.set(1.4, 0.55, 1.1);
    bag.castShadow = true;
    bag.receiveShadow = true;
    scene.add(bag);
  }

  for (let i = 0; i < 7; i += 1) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1.05, 18),
      makeMaterial(0x3c4236, 0.75, 0.35)
    );
    barrel.position.set((Math.random() - 0.5) * 30, 0.52, (Math.random() - 0.5) * 30);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    scene.add(barrel);
  }

  for (let i = 0; i < 18; i += 1) {
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(1.4 + Math.random() * 2.8, 28),
      new THREE.MeshBasicMaterial({
        color: 0x050403,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    crater.rotation.x = -Math.PI / 2;
    crater.position.set((Math.random() - 0.5) * 80, 0.02, (Math.random() - 0.5) * 80);
    scene.add(crater);
  }

  for (let i = 0; i < 6; i += 1) {
    const fireGroup = new THREE.Group();
    fireGroup.userData.kind = "fire";
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.9, 0.22, 14),
      makeMaterial(0x090806, 0.95, 0.05)
    );
    base.position.y = 0.11;
    fireGroup.add(base);
    for (let j = 0; j < 5; j += 1) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.35 + Math.random() * 0.25, 1.2 + Math.random() * 0.9, 12),
        new THREE.MeshBasicMaterial({
          color: 0xff6a00,
          transparent: true,
          opacity: 0.78,
        })
      );
      flame.position.set((Math.random() - 0.5) * 0.38, 0.55 + Math.random() * 0.45, (Math.random() - 0.5) * 0.28);
      flame.rotation.z = (Math.random() - 0.5) * 0.45;
      fireGroup.add(flame);
    }
    const light = new THREE.PointLight(0xff5a00, 4.2, 16);
    light.position.set(0, 1.4, 0);
    fireGroup.add(light);
    fireGroup.position.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60);
    scene.add(fireGroup);
  }
}

function initScene(container: HTMLDivElement): GameState {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070806);
  scene.fog = new THREE.FogExp2(0x16120d, 0.034);

  const camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 600);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x5c6570, 0x1a120b, 0.48));
  const moon = new THREE.DirectionalLight(0xffd0a0, 1.65);
  moon.position.set(18, 28, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -35;
  moon.shadow.camera.right = 35;
  moon.shadow.camera.top = 35;
  moon.shadow.camera.bottom = -35;
  scene.add(moon);

  const redAlarm = new THREE.PointLight(0xff1f1f, 1.8, 24);
  redAlarm.position.set(-10, 7, -10);
  scene.add(redAlarm);

  const blueLight = new THREE.PointLight(0x38bdf8, 1.2, 22);
  blueLight.position.set(12, 6, 14);
  scene.add(blueLight);

  const groundTex = new THREE.CanvasTexture(makeGroundTexture());
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(8, 8);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160, 96, 96),
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.98,
      metalness: 0.02,
      bumpMap: groundTex,
      bumpScale: 0.05,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const colliders: THREE.Box3[] = [];
  addEnvironment(scene, colliders);
  addDust(scene);
  addFogBanks(scene);

  const player = new THREE.Group();
  player.position.set(0, 0, 8);
  scene.add(player);
  camera.position.copy(player.position).add(new THREE.Vector3(0, 1.95, 0));
  camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1.4, -5)));

  const weapon = makeWeapon();
  camera.add(weapon);
  scene.add(camera);

  const allies: THREE.Group[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ally = makeRealisticProceduralSoldier(`Ally-${i}`, 0x53604e, false);
    ally.position.set(-4 + i * 3.5, 0, 14 + (i % 2 === 0 ? 2 : -2));
    scene.add(ally);
    allies.push(ally);
  }

  return {
    scene,
    camera,
    renderer,
    clock: new THREE.Clock(),
    player,
    weapon,
    allies,
    enemies: [],
    bullets: [],
    colliders,
    health: 100,
    ammo: 30,
    maxAmmo: 30,
    score: 0,
    wave: 1,
    fireCooldown: 0,
    reload: 0,
    yaw: 0,
    pitch: 0,
    recoil: 0,
    running: false,
    disposed: false,
    enemyTemplate: null,
    enemyAnimations: [],
    fbxClips: {},
    mixers: [],
    enemyModelLoaded: false,
    fbxModeLoaded: false,
  };
}

function canMoveTo(state: GameState, position: THREE.Vector3) {
  const box = new THREE.Box3().setFromCenterAndSize(
    position.clone().add(new THREE.Vector3(0, 1, 0)),
    new THREE.Vector3(0.85, 1.9, 0.85)
  );
  return !state.colliders.some((collider) => collider.intersectsBox(box));
}

function animateSoldier(group: THREE.Group, dt: number, moving: boolean) {
  const sway = moving ? Math.sin(Date.now() * 0.01) * 0.04 : 0;
  group.position.y = (group.userData.baseY || 0) + sway;
}

function triggerSoldierShootAnimation(state: GameState, soldier: THREE.Group) {
  switchEnemyAnimation(state, soldier, ["shoot", "fire"], true);
  soldier.userData.lockedUntil = state.clock.elapsedTime + SHOOT_ANIMATION_LOCK_SECONDS;
}

function shoot(state: GameState) {
  if (!state.running || state.fireCooldown > 0 || state.reload > 0) return;
  if (state.ammo <= 0) {
    state.reload = 1.4;
    return;
  }

  state.ammo -= 1;
  state.fireCooldown = 0.12;
  state.recoil = 1;

  const origin = new THREE.Vector3();
  state.camera.getWorldPosition(origin);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion).normalize();

  let closestHit: { enemy: THREE.Group; distance: number } | null = null;
  state.enemies.forEach((enemy) => {
    const target = enemy.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const projected = target.clone().sub(origin);
    const distance = projected.length();
    const angle = dir.angleTo(projected.normalize());
    if (angle < 0.09 && (!closestHit || distance < closestHit.distance)) {
      closestHit = { enemy, distance };
    }
  });

  if (closestHit) {
    closestHit.enemy.userData.hp -= 34;
    closestHit.enemy.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive = new THREE.Color(0xff5533);
        child.material.emissiveIntensity = 0.45;
        setTimeout(() => {
          child.material.emissiveIntensity = 0;
        }, 90);
      }
    });
  }

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: closestHit ? 0xff5533 : 0xfff3a3 })
  );
  bullet.position.copy(origin);
  bullet.userData.velocity = dir.multiplyScalar(70);
  bullet.userData.life = 1.1;
  state.scene.add(bullet);
  state.bullets.push(bullet);

  const flash = new THREE.PointLight(0xffcc66, 5, 6);
  flash.position.copy(origin).add(
    new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion).multiplyScalar(1.7)
  );
  state.scene.add(flash);
  setTimeout(() => state.scene.remove(flash), 40);
}

function updateAtmosphere(scene: THREE.Scene, time: number) {
  scene.traverse((obj) => {
    if (obj.userData.kind === "fire") {
      obj.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
          child.scale.y = 0.8 + Math.sin(time * 10 + child.position.x * 5) * 0.08;
          child.rotation.z += 0.003;
        }
      });
    }
    if (obj.userData.fireLight && obj instanceof THREE.PointLight) {
      obj.intensity = 3.4 + Math.sin(time * 12) * 0.8 + Math.random() * 0.35;
    }
  });
}

function updateGame(state: GameState, dt: number, keys: Record<string, boolean>, setHud: React.Dispatch<React.SetStateAction<Hud>>, setGameOver: React.Dispatch<React.SetStateAction<boolean>>) {
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.reload = Math.max(0, state.reload - dt);
  if (state.reload === 0 && state.ammo <= 0) state.ammo = state.maxAmmo;

  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(-1);
  const move = new THREE.Vector3();
  if (keys["w"]) move.add(forward);
  if (keys["s"]) move.sub(forward);
  if (keys["a"]) move.sub(right);
  if (keys["d"]) move.add(right);

  const moving = move.lengthSq() > 0;
  if (moving) move.normalize();
  const speed = keys["shift"] ? 8.4 : 5.25;
  const nextPos = state.player.position.clone().add(move.multiplyScalar(speed * dt));
  if (!moving || canMoveTo(state, nextPos)) {
    state.player.position.copy(nextPos);
  }

  state.camera.position.copy(state.player.position).add(new THREE.Vector3(0, 1.95, 0));
  state.camera.rotation.order = "YXZ";
  state.camera.rotation.y = state.yaw;
  state.camera.rotation.x = state.pitch + state.recoil * 0.035;
  state.weapon.position.set(0.38, -0.28 - Math.abs(Math.sin(Date.now() * 0.012)) * 0.01, -0.75);
  state.recoil = Math.max(0, state.recoil - dt * 6.5);

  state.allies.forEach((ally, index) => {
    animateSoldier(ally, dt, true);
    ally.lookAt(state.player.position.clone().add(new THREE.Vector3(Math.sin(index), 1.2, Math.cos(index))));
  });

  if (state.enemies.length < Math.min(6 + state.wave * 2, 18)) {
    const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    const radius = 25 + Math.random() * 18;
    const angle = Math.random() * Math.PI * 2;
    spawnEnemyFromTemplate(state, type, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  state.enemies = state.enemies.filter((enemy) => {
    if (enemy.userData.hp <= 0) {
      state.scene.remove(enemy);
      state.score += enemy.userData.score || 100;
      return false;
    }

    const toPlayer = state.player.position.clone().sub(enemy.position);
    const distance = toPlayer.length();
    toPlayer.normalize();
    const flank = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x)
      .normalize()
      .multiplyScalar(enemy.userData.flank || 1);
    const speedFactor = enemy.userData.speed || 2;
    const desired = distance > 7 ? toPlayer : flank;
    const attempt = enemy.position.clone().add(desired.multiplyScalar(speedFactor * dt));
    if (canMoveTo(state, attempt)) enemy.position.copy(attempt);
    enemy.lookAt(state.player.position.clone().setY(1.4));

    const lockUntil = enemy.userData.lockedUntil || 0;
    if (lockUntil > state.clock.elapsedTime) {
      // hold shooting pose
    } else if (distance < 18 && Math.random() < dt * 0.85) {
      triggerSoldierShootAnimation(state, enemy);
      state.health = Math.max(0, state.health - (enemy.userData.kind === "Commander" ? 8 : 4));
      if (state.health === 0) {
        state.running = false;
        setGameOver(true);
      }
    } else {
      switchEnemyAnimation(state, enemy, distance > 10 ? ["run", "walk"] : ["walk", "idle"]);
    }

    animateSoldier(enemy, dt, true);
    return true;
  });

  state.bullets = state.bullets.filter((bullet) => {
    bullet.position.add((bullet.userData.velocity as THREE.Vector3).clone().multiplyScalar(dt));
    bullet.userData.life -= dt;
    if (bullet.userData.life <= 0) {
      state.scene.remove(bullet);
      return false;
    }
    return true;
  });

  if (state.score >= state.wave * 850) {
    state.wave += 1;
  }

  setHud((current) => ({
    ...current,
    health: Math.round(state.health),
    ammo: state.reload > 0 ? "RLD" : state.ammo,
    score: state.score,
    enemies: state.enemies.length,
    wave: state.wave,
  }));
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const animationRef = useRef<number | null>(null);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hud, setHud] = useState<Hud>({
    health: 100,
    ammo: 30,
    score: 0,
    enemies: 0,
    wave: 1,
    modelMode: "procedural 3D fallback",
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState("Ronell");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submittingScore, setSubmittingScore] = useState(false);

  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/scores", { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const payload = await res.json();
      if (payload?.ok && Array.isArray(payload.scores)) setLeaderboard(payload.scores);
    } catch (error) {
      console.warn("Leaderboard fetch failed.", error);
    }
  }

  async function submitScore() {
    if (!gameOver || hud.score <= 0 || !playerName.trim() || submittingScore) return;
    setSubmittingScore(true);
    setSubmitStatus("");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          score: hud.score,
          wave: hud.wave,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) {
        setSubmitStatus(payload?.error || "Could not submit score.");
        return;
      }
      setLeaderboard(payload.scores || []);
      setSubmitStatus("Score submitted to the Dark Sector leaderboard.");
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : "Could not submit score.");
    } finally {
      setSubmittingScore(false);
    }
  }

  function startMission() {
    const state = gameRef.current;
    if (!state) return;
    state.running = true;
    state.health = 100;
    state.ammo = state.maxAmmo;
    state.score = 0;
    state.wave = 1;
    state.player.position.set(0, 0, 8);
    state.enemies.forEach((enemy) => state.scene.remove(enemy));
    state.enemies = [];
    setGameOver(false);
    setStarted(true);
    setSubmitStatus("");
    setHud((current) => ({
      ...current,
      health: 100,
      ammo: state.maxAmmo,
      score: 0,
      enemies: 0,
      wave: 1,
    }));
  }

  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = true;
      if (event.key === " ") shoot(gameRef.current!);
      if (event.key.toLowerCase() === "r" && gameRef.current) {
        gameRef.current.reload = 1.4;
      }
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const state = initScene(container);
    gameRef.current = state;
    loadEnemyModel(state, setHud).catch((error) => {
      console.warn("Enemy model loading failed.", error);
    });

    const onResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      state.camera.aspect = width / height;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(width, height);
    };

    const onMouseDown = (event: MouseEvent) => {
      mouseRef.current.dragging = true;
      mouseRef.current.lastX = event.clientX;
      mouseRef.current.lastY = event.clientY;
    };
    const onMouseUp = () => {
      mouseRef.current.dragging = false;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!mouseRef.current.dragging) return;
      const dx = event.clientX - mouseRef.current.lastX;
      const dy = event.clientY - mouseRef.current.lastY;
      mouseRef.current.lastX = event.clientX;
      mouseRef.current.lastY = event.clientY;
      state.yaw -= dx * 0.004;
      state.pitch -= dy * 0.003;
      state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.45);
    };
    const onClick = () => shoot(state);

    window.addEventListener("resize", onResize);
    state.renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    state.renderer.domElement.addEventListener("click", onClick);

    const animate = () => {
      if (state.disposed) return;
      const dt = Math.min(0.033, state.clock.getDelta());
      if (state.running) updateGame(state, dt, keysRef.current, setHud, setGameOver);
      state.mixers.forEach((mixer) => mixer.update(dt));
      updateAtmosphere(state.scene, state.clock.elapsedTime);
      state.renderer.render(state.scene, state.camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      state.disposed = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", onResize);
      state.renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      state.renderer.domElement.removeEventListener("click", onClick);
      state.renderer.dispose();
      if (state.renderer.domElement.parentElement) {
        state.renderer.domElement.parentElement.removeChild(state.renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-black text-white">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-2xl border border-cyan-300/40 bg-black/60 p-4 shadow-2xl backdrop-blur">
        <div className="text-xs tracking-[0.25em] text-cyan-200">BRADLEY&apos;S DARK SECTOR</div>
        <div className="mt-1 text-2xl font-black">WAVE {hud.wave}</div>
        <div className="text-sm text-slate-300">Hostiles: {hud.enemies}</div>
        <div className="text-xs text-slate-400">Enemy models: {hud.modelMode}</div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-2xl border border-slate-300/30 bg-black/60 p-4 text-right shadow-2xl backdrop-blur">
        <div className="text-xs tracking-[0.25em] text-slate-300">M4A1 CARBINE</div>
        <div className="mt-1 text-4xl font-black text-cyan-200">{hud.ammo}</div>
        <div className="text-sm text-slate-300">Score {hud.score}</div>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex items-end justify-between gap-4">
        <div className="rounded-2xl border border-emerald-300/40 bg-black/60 p-4 shadow-2xl backdrop-blur">
          <div className="text-xs tracking-[0.25em] text-emerald-200">ARMOR</div>
          <div className="text-4xl font-black">{hud.health}%</div>
        </div>
        <div className="hidden rounded-2xl border border-slate-300/30 bg-black/60 p-4 text-center shadow-2xl backdrop-blur md:block">
          <div className="text-sm text-slate-200">WASD move • Shift sprint • Drag mouse aim • Click/Space fire • R reload</div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-10 w-10 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-0 top-1/2 h-0.5 w-10 -translate-y-1/2 bg-white/80" />
        <div className="absolute left-1/2 top-0 h-10 w-0.5 -translate-x-1/2 bg-white/80" />
      </div>

      {!started && !gameOver ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm">
          <h1 className="text-5xl font-black uppercase leading-none drop-shadow-[0_0_30px_rgba(34,211,238,.75)] md:text-8xl">
            Bradley&apos;s
            <br />
            Dark Sector
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-cyan-100">
            Fight through a burning compound with real 3D soldier support when model files exist in
            <code className="mx-1 rounded bg-white/10 px-2 py-1 text-sm">/public/models/</code>
            and strong procedural fallback soldiers when they do not.
          </p>
          <button
            type="button"
            onClick={startMission}
            className="mt-8 rounded-full bg-cyan-300 px-8 py-4 font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,.5)]"
          >
            ENTER COMPOUND
          </button>
        </div>
      ) : null}

      {gameOver ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
          <h2 className="text-5xl font-black text-rose-400 md:text-7xl">COMPOUND OVERRUN</h2>
          <p className="mt-4 text-cyan-100">Final Score: {hud.score}</p>
          <p className="mt-2 text-sm text-slate-300">Wave reached: {hud.wave}</p>
          <div className="mt-6 w-full max-w-md rounded-3xl border border-cyan-400/20 bg-black/60 p-4 text-left">
            <div className="text-xs tracking-[0.25em] text-cyan-200">LEADERBOARD ENTRY</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                maxLength={40}
                className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-white outline-none"
                placeholder="Player name"
              />
              <button
                type="button"
                onClick={submitScore}
                disabled={submittingScore || hud.score <= 0}
                className="rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingScore ? "Submitting..." : "Submit Score"}
              </button>
            </div>
            {submitStatus ? <div className="mt-2 text-sm text-cyan-100">{submitStatus}</div> : null}
            <div className="mt-4">
              <div className="mb-2 text-xs tracking-[0.25em] text-slate-400">TOP OPERATIVES</div>
              <div className="space-y-2">
                {leaderboard.length ? (
                  leaderboard.map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.playerName}-${entry.createdAt}`}
                      className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="mr-2 text-cyan-200">#{entry.rank}</span>
                        <span>{entry.playerName}</span>
                      </div>
                      <div className="text-right text-slate-300">
                        <div>{entry.score} pts</div>
                        <div className="text-xs">Wave {entry.wave}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
                    No scores yet. Be the first one on the board.
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={startMission}
            className="mt-8 rounded-full bg-cyan-300 px-8 py-4 font-black text-slate-950"
          >
            REBOOT MISSION
          </button>
        </div>
      ) : null}
    </div>
  );
}
