/** Animation helpers for Mixamo clips + procedural viewmodel / soldier poses. */

import * as THREE from "three";
import type { WeaponId } from "./weapons";

export type AnimStateName =
  | "idle"
  | "walk"
  | "run"
  | "aim"
  | "fire"
  | "hit"
  | "death"
  | "reload"
  | "crouch"
  | "crouchWalk"
  | "switch";

const CLIP_ALIASES: Record<AnimStateName, string[]> = {
  idle: ["idle", "stand", "tpose"],
  walk: ["walk", "walking"],
  run: ["run", "sprint", "jog"],
  aim: ["aim", "rifle aim", "idle aim", "gunplay", "combat idle"],
  fire: ["shoot", "fire", "attack", "rifle", "firing"],
  hit: ["hit", "impact", "react", "hurt", "damage"],
  death: ["death", "die", "dead", "falling"],
  reload: ["reload", "reloading"],
  crouch: ["crouch", "crouching idle", "crouch idle"],
  crouchWalk: ["crouch walk", "sneak", "crouched walk"],
  switch: ["draw", "holster", "equip"],
};

export const ANIM_LOCK: Partial<Record<AnimStateName, number>> = {
  fire: 0.32,
  hit: 0.28,
  death: 2.4,
  reload: 1.2,
  switch: 0.45,
};

export function findClip(clips: THREE.AnimationClip[], preferred: string[]): THREE.AnimationClip | null {
  if (!clips.length) return null;
  for (const name of preferred) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    if (hit) return hit;
  }
  return clips[0];
}

/** Strict match — no fallback to an unrelated clip. */
export function resolveClip(clips: THREE.AnimationClip[], state: AnimStateName): THREE.AnimationClip | null {
  if (!clips.length) return null;
  for (const name of CLIP_ALIASES[state]) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

export function playOrSwitch(
  mixer: THREE.AnimationMixer,
  model: THREE.Object3D,
  clips: THREE.AnimationClip[],
  state: AnimStateName,
  opts?: { force?: boolean; fade?: number; loop?: boolean }
) {
  const force = opts?.force ?? false;
  const fade = opts?.fade ?? (force ? 0.05 : 0.18);
  if (!force && model.userData.actionLock > 0) return false;
  if (!force && model.userData.animState === state) return false;

  const clip = resolveClip(clips, state);
  if (!clip) return false;

  const oldAction = model.userData.currentAction as THREE.AnimationAction | undefined;
  const newAction = mixer.clipAction(clip);
  newAction.reset();
  newAction.setLoop(opts?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, opts?.loop === false ? 1 : Infinity);
  if (opts?.loop === false) newAction.clampWhenFinished = true;
  newAction.fadeIn(fade);
  newAction.play();
  if (oldAction && oldAction !== newAction) oldAction.fadeOut(fade);

  model.userData.currentAction = newAction;
  model.userData.currentClipName = clip.name;
  model.userData.animState = state;
  const lock = ANIM_LOCK[state];
  if (lock) model.userData.actionLock = lock;
  return true;
}

type BoneKeyPose = Array<{ t: number; x: number; y: number; z: number }>;

function sampleTrackQuaternion(track: THREE.KeyframeTrack, time = 0): THREE.Quaternion {
  const q = new THREE.Quaternion(0, 0, 0, 1);
  if (!(track instanceof THREE.QuaternionKeyframeTrack) || track.values.length < 4) return q;
  // Prefer first keyframe; combat synthesis layers onto the idle bind.
  void time;
  q.fromArray(track.values, 0);
  return q;
}

function buildQuaternionTrack(
  trackName: string,
  base: THREE.Quaternion,
  keys: BoneKeyPose
): THREE.QuaternionKeyframeTrack {
  const times = keys.map((k) => k.t);
  const values: number[] = [];
  const offset = new THREE.Euler();
  const qOffset = new THREE.Quaternion();
  const out = new THREE.Quaternion();
  for (const k of keys) {
    offset.set(k.x, k.y, k.z, "XYZ");
    qOffset.setFromEuler(offset);
    out.copy(base).multiply(qOffset);
    values.push(out.x, out.y, out.z, out.w);
  }
  return new THREE.QuaternionKeyframeTrack(trackName, times, values);
}

/**
 * Build aim/fire/hit/death/reload/crouch clips from an Idle pose when the GLB
 * only ships locomotion. Track names match Mixamo (`mixamorig:Bone.quaternion`).
 */
export function synthesizeCombatClips(sourceClips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const idle = resolveClip(sourceClips, "idle") || sourceClips.find((c) => !/tpose/i.test(c.name)) || sourceClips[0];
  if (!idle) return [];

  const quatTracks = new Map<string, THREE.KeyframeTrack>();
  for (const track of idle.tracks) {
    if (track.name.endsWith(".quaternion")) {
      const bone = track.name.slice(0, -".quaternion".length);
      quatTracks.set(bone, track);
    }
  }

  const bone = (suffix: string) => {
    for (const name of quatTracks.keys()) {
      if (name === suffix || name.endsWith(suffix) || name.endsWith(`:${suffix}`)) return name;
    }
    return null;
  };

  const hips = bone("Hips");
  const spine = bone("Spine") || bone("Spine1");
  const spine2 = bone("Spine2") || bone("Spine1") || spine;
  const rArm = bone("RightArm");
  const rFore = bone("RightForeArm");
  const rHand = bone("RightHand");
  const lArm = bone("LeftArm");
  const lFore = bone("LeftForeArm");
  const lUp = bone("LeftUpLeg");
  const rUp = bone("RightUpLeg");
  const lLeg = bone("LeftLeg");
  const rLeg = bone("RightLeg");

  const recipes: Array<{ name: string; duration: number; loop: boolean; poses: Record<string, BoneKeyPose> }> = [
    {
      name: "Aim",
      duration: 1.2,
      loop: true,
      poses: {
        ...(spine2 ? { [spine2]: [{ t: 0, x: 0.12, y: 0, z: 0 }, { t: 1.2, x: 0.12, y: 0, z: 0 }] } : {}),
        ...(rArm ? { [rArm]: [{ t: 0, x: -1.05, y: 0.15, z: 0.25 }, { t: 1.2, x: -1.05, y: 0.15, z: 0.25 }] } : {}),
        ...(rFore ? { [rFore]: [{ t: 0, x: 0.35, y: 0, z: 0.1 }, { t: 1.2, x: 0.35, y: 0, z: 0.1 }] } : {}),
        ...(lArm ? { [lArm]: [{ t: 0, x: -0.85, y: -0.35, z: -0.2 }, { t: 1.2, x: -0.85, y: -0.35, z: -0.2 }] } : {}),
        ...(lFore ? { [lFore]: [{ t: 0, x: 0.55, y: 0.1, z: 0 }, { t: 1.2, x: 0.55, y: 0.1, z: 0 }] } : {}),
      },
    },
    {
      name: "Shoot",
      duration: 0.32,
      loop: false,
      poses: {
        ...(spine2 ? { [spine2]: [{ t: 0, x: 0.08, y: 0, z: 0 }, { t: 0.06, x: -0.12, y: 0.04, z: 0 }, { t: 0.32, x: 0.1, y: 0, z: 0 }] } : {}),
        ...(rArm
          ? {
              [rArm]: [
                { t: 0, x: -1.05, y: 0.15, z: 0.25 },
                { t: 0.05, x: -1.25, y: 0.2, z: 0.35 },
                { t: 0.32, x: -1.05, y: 0.15, z: 0.25 },
              ],
            }
          : {}),
        ...(rFore
          ? {
              [rFore]: [
                { t: 0, x: 0.35, y: 0, z: 0.1 },
                { t: 0.05, x: 0.55, y: 0, z: 0.15 },
                { t: 0.32, x: 0.35, y: 0, z: 0.1 },
              ],
            }
          : {}),
        ...(rHand
          ? {
              [rHand]: [
                { t: 0, x: 0, y: 0, z: 0 },
                { t: 0.05, x: -0.15, y: 0, z: 0 },
                { t: 0.32, x: 0, y: 0, z: 0 },
              ],
            }
          : {}),
      },
    },
    {
      name: "Hit",
      duration: 0.35,
      loop: false,
      poses: {
        ...(spine
          ? {
              [spine]: [
                { t: 0, x: 0, y: 0, z: 0 },
                { t: 0.08, x: -0.2, y: 0.35, z: 0.15 },
                { t: 0.35, x: 0, y: 0, z: 0 },
              ],
            }
          : {}),
        ...(hips
          ? {
              [hips]: [
                { t: 0, x: 0, y: 0, z: 0 },
                { t: 0.08, x: 0.08, y: -0.12, z: 0 },
                { t: 0.35, x: 0, y: 0, z: 0 },
              ],
            }
          : {}),
      },
    },
    {
      name: "Death",
      duration: 1.8,
      loop: false,
      poses: {
        ...(hips
          ? {
              [hips]: [
                { t: 0, x: 0, y: 0, z: 0 },
                { t: 0.45, x: 0.55, y: 0.15, z: 0.2 },
                { t: 1.8, x: 1.35, y: 0.25, z: 0.35 },
              ],
            }
          : {}),
        ...(spine
          ? {
              [spine]: [
                { t: 0, x: 0, y: 0, z: 0 },
                { t: 0.5, x: 0.4, y: 0.1, z: 0 },
                { t: 1.8, x: 0.85, y: 0.2, z: 0.1 },
              ],
            }
          : {}),
        ...(rArm
          ? {
              [rArm]: [
                { t: 0, x: -0.4, y: 0, z: 0 },
                { t: 1.8, x: -0.2, y: 0.6, z: 0.8 },
              ],
            }
          : {}),
        ...(lArm
          ? {
              [lArm]: [
                { t: 0, x: -0.4, y: 0, z: 0 },
                { t: 1.8, x: -0.15, y: -0.5, z: -0.7 },
              ],
            }
          : {}),
      },
    },
    {
      name: "Reload",
      duration: 1.15,
      loop: false,
      poses: {
        ...(lArm
          ? {
              [lArm]: [
                { t: 0, x: -0.7, y: -0.2, z: 0 },
                { t: 0.35, x: -1.1, y: -0.55, z: -0.35 },
                { t: 0.7, x: -0.95, y: -0.4, z: -0.2 },
                { t: 1.15, x: -0.7, y: -0.2, z: 0 },
              ],
            }
          : {}),
        ...(lFore
          ? {
              [lFore]: [
                { t: 0, x: 0.4, y: 0, z: 0 },
                { t: 0.35, x: 1.1, y: 0.2, z: 0.15 },
                { t: 1.15, x: 0.4, y: 0, z: 0 },
              ],
            }
          : {}),
        ...(rArm
          ? {
              [rArm]: [
                { t: 0, x: -0.9, y: 0.1, z: 0.2 },
                { t: 0.5, x: -1.0, y: 0.25, z: 0.3 },
                { t: 1.15, x: -0.9, y: 0.1, z: 0.2 },
              ],
            }
          : {}),
      },
    },
    {
      name: "CrouchIdle",
      duration: 1.4,
      loop: true,
      poses: {
        ...(hips ? { [hips]: [{ t: 0, x: 0.55, y: 0, z: 0 }, { t: 1.4, x: 0.55, y: 0, z: 0 }] } : {}),
        ...(lUp ? { [lUp]: [{ t: 0, x: 1.1, y: 0, z: 0 }, { t: 1.4, x: 1.1, y: 0, z: 0 }] } : {}),
        ...(rUp ? { [rUp]: [{ t: 0, x: 1.1, y: 0, z: 0 }, { t: 1.4, x: 1.1, y: 0, z: 0 }] } : {}),
        ...(lLeg ? { [lLeg]: [{ t: 0, x: -1.35, y: 0, z: 0 }, { t: 1.4, x: -1.35, y: 0, z: 0 }] } : {}),
        ...(rLeg ? { [rLeg]: [{ t: 0, x: -1.35, y: 0, z: 0 }, { t: 1.4, x: -1.35, y: 0, z: 0 }] } : {}),
        ...(spine2 ? { [spine2]: [{ t: 0, x: 0.2, y: 0, z: 0 }, { t: 1.4, x: 0.2, y: 0, z: 0 }] } : {}),
        ...(rArm ? { [rArm]: [{ t: 0, x: -0.95, y: 0.1, z: 0.2 }, { t: 1.4, x: -0.95, y: 0.1, z: 0.2 }] } : {}),
      },
    },
  ];

  const stateForRecipe = (name: string): AnimStateName => {
    if (name === "CrouchIdle") return "crouch";
    if (name === "Shoot") return "fire";
    return name.toLowerCase() as AnimStateName;
  };

  const synthesized: THREE.AnimationClip[] = [];
  for (const recipe of recipes) {
    if (resolveClip(sourceClips, stateForRecipe(recipe.name))) continue;

    const tracks: THREE.KeyframeTrack[] = [];
    for (const [boneName, keys] of Object.entries(recipe.poses)) {
      const baseTrack = quatTracks.get(boneName);
      if (!baseTrack) continue;
      const baseQ = sampleTrackQuaternion(baseTrack);
      tracks.push(buildQuaternionTrack(`${boneName}.quaternion`, baseQ, keys));
    }
    if (!tracks.length) continue;
    const clip = new THREE.AnimationClip(recipe.name, recipe.duration, tracks);
    synthesized.push(clip);
  }

  return synthesized;
}

/** Merge locomotion + synthesized combat clips; de-dupe by name. */
export function mergeAnimationLibrary(base: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const synth = synthesizeCombatClips(base);
  const byName = new Map<string, THREE.AnimationClip>();
  for (const clip of [...base, ...synth]) {
    if (!byName.has(clip.name.toLowerCase())) byName.set(clip.name.toLowerCase(), clip);
  }
  return [...byName.values()];
}

/** Procedural FPS viewmodel bob / aim / recoil / reload / crouch / swap. */
export type ViewmodelPose = {
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  bobPhase: number;
  recoilKick: number;
  reloadT: number;
  switchT: number;
  crouchBlend: number;
  aimBlend: number;
};

export function createViewmodelPose(weapon: WeaponId): ViewmodelPose {
  if (weapon === "pistol") {
    return {
      basePos: new THREE.Vector3(0.3, -0.43, -0.82),
      baseRot: new THREE.Euler(-0.04, -0.08, 0.03),
      bobPhase: 0,
      recoilKick: 0,
      reloadT: 0,
      switchT: 0,
      crouchBlend: 0,
      aimBlend: 0,
    };
  }
  return {
    basePos: new THREE.Vector3(0.55, -0.55, -1.1),
    baseRot: new THREE.Euler(-0.08, -0.1, 0.05),
    bobPhase: 0,
    recoilKick: 0,
    reloadT: 0,
    switchT: 0,
    crouchBlend: 0,
    aimBlend: 0,
  };
}

export function updateViewmodel(
  group: THREE.Object3D,
  pose: ViewmodelPose,
  dt: number,
  opts: {
    moving: boolean;
    sprinting: boolean;
    reloading: boolean;
    crouching: boolean;
    aiming?: boolean;
    weapon?: WeaponId;
    firingKick?: number;
  }
) {
  if (opts.firingKick) pose.recoilKick = Math.min(0.35, pose.recoilKick + opts.firingKick);
  pose.recoilKick = Math.max(0, pose.recoilKick - dt * 2.4);
  pose.reloadT = opts.reloading ? Math.min(1, pose.reloadT + dt * 1.1) : Math.max(0, pose.reloadT - dt * 2.5);
  pose.switchT = Math.max(0, pose.switchT - dt * 2.2);
  pose.crouchBlend = THREE.MathUtils.damp(pose.crouchBlend, opts.crouching ? 1 : 0, 8, dt);
  pose.aimBlend = THREE.MathUtils.damp(
    pose.aimBlend,
    opts.aiming && !opts.sprinting && !opts.reloading ? 1 : 0,
    12,
    dt
  );

  const speed = opts.sprinting ? 11 : opts.moving ? 7.5 : 2.2;
  pose.bobPhase += dt * speed;
  const bobAmp = opts.moving ? (opts.sprinting ? 0.028 : 0.018) : 0.004;
  const bobY = Math.sin(pose.bobPhase) * bobAmp;
  const bobX = Math.cos(pose.bobPhase * 0.5) * bobAmp * 0.6;

  const reloadDrop = Math.sin(pose.reloadT * Math.PI) * 0.22;
  const switchSlide = Math.sin(pose.switchT * Math.PI) * 0.45;
  const crouchDrop = pose.crouchBlend * 0.12;
  const isPistol = opts.weapon === "pistol";
  const adsX = isPistol ? -0.3 : -0.55;
  const adsY = isPistol ? 0.29 : 0.35;
  const adsZ = isPistol ? -0.18 : -0.17;

  group.position.set(
    pose.basePos.x + bobX * (1 - pose.aimBlend * 0.85) + switchSlide * 0.35 + adsX * pose.aimBlend,
    pose.basePos.y + bobY * (1 - pose.aimBlend * 0.85) - pose.recoilKick * 0.75 - reloadDrop - crouchDrop + adsY * pose.aimBlend,
    pose.basePos.z + pose.recoilKick * 0.35 + adsZ * pose.aimBlend
  );
  group.rotation.set(
    pose.baseRot.x * (1 - pose.aimBlend) - pose.recoilKick * 0.55 + reloadDrop * 0.8,
    pose.baseRot.y * (1 - pose.aimBlend) + switchSlide * 0.4,
    pose.baseRot.z * (1 - pose.aimBlend) + bobX * 0.4 * (1 - pose.aimBlend),
    "YXZ"
  );
}

/** Lightweight procedural death sink for soldiers without a death clip. */
export function applyProceduralDeath(group: THREE.Group, dt: number, opts?: { soft?: boolean }) {
  group.userData.deathT = (group.userData.deathT || 0) + dt;
  const duration = opts?.soft ? 2.2 : 1.6;
  const t = Math.min(1, group.userData.deathT / duration);
  if (!opts?.soft) {
    group.rotation.x = t * 1.35;
  } else {
    // Clip-driven death: only settle into the ground slightly.
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, t * 0.35, 0.15);
  }
  group.position.y = (group.userData.groundOffset || 0) - t * (opts?.soft ? 0.2 : 0.35);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      child.material.transparent = true;
      child.material.opacity = 1 - t * (opts?.soft ? 0.55 : 0.85);
    }
  });
  return t >= 1;
}

export function applyHitReact(group: THREE.Group, strength = 0.18) {
  group.userData.hitReact = strength;
}

export function tickHitReact(group: THREE.Group, dt: number) {
  const hr = group.userData.hitReact || 0;
  if (hr <= 0) {
    group.rotation.z = 0;
    return;
  }
  group.userData.hitReact = Math.max(0, hr - dt);
  group.rotation.z = Math.sin(hr * 40) * 0.08;
  group.rotation.x = Math.sin(hr * 28) * 0.04;
}
