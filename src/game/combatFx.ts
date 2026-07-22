/** Combat feedback: impacts, casings, shake, blood/dust, suppression, directional VFX. */

import * as THREE from "three";
import { getSoftParticleMap } from "./atmosphere";

export type CombatFxState = {
  group: THREE.Group;
  particles: THREE.Points[];
  casings: THREE.Mesh[];
  decals: THREE.Mesh[];
  gibs: THREE.Mesh[];
  bloodPools: THREE.Mesh[];
  shake: number;
  suppression: number;
  cameraPunch: THREE.Vector3;
};

/** Quality scale from graphicsConfig().particles (0–1). */
export type FxQuality = number;

const _tracerForward = new THREE.Vector3(0, 0, 1);
const _tracerDir = new THREE.Vector3();

const TRACER_POOL_MAX = 48;
const ACTIVE_PARTICLE_BUDGET = 32;
const ACTIVE_DECAL_BUDGET = 40;
const ACTIVE_CASING_BUDGET = 24;
const ACTIVE_GIB_BUDGET = 18;
const ACTIVE_BLOOD_POOL_BUDGET = 14;
const tracerPool: THREE.Mesh[] = [];

let streakGeoXr: THREE.BufferGeometry | null = null;
let streakGeoLow: THREE.BufferGeometry | null = null;
let streakGeoHigh: THREE.BufferGeometry | null = null;
let trailGeo: THREE.BufferGeometry | null = null;
let muzzleConeGeo: THREE.BufferGeometry | null = null;
let casingGeo: THREE.BufferGeometry | null = null;
let gibGeo: THREE.BoxGeometry | null = null;

function getGibGeo() {
  if (!gibGeo) gibGeo = new THREE.BoxGeometry(0.06, 0.04, 0.05);
  return gibGeo;
}

function getStreakGeo(quality: FxQuality) {
  // Quest / low: thin additive plane ribbon — 4-sided cylinders read as floating blocks.
  if (quality < 0.45) {
    if (!streakGeoXr) {
      streakGeoXr = new THREE.PlaneGeometry(0.014, 0.62);
      streakGeoXr.rotateX(Math.PI / 2);
      streakGeoXr.translate(0, 0, -0.31);
    }
    return streakGeoXr;
  }
  const high = quality >= 0.65;
  if (high) {
    if (!streakGeoHigh) {
      // Tapered streak along +Z; origin at tip, body trails behind (−Z).
      streakGeoHigh = new THREE.CylinderGeometry(0.015, 0.005, 0.7, 6, 1, true);
      streakGeoHigh.rotateX(Math.PI / 2);
      streakGeoHigh.translate(0, 0, -0.35);
    }
    return streakGeoHigh;
  }
  if (!streakGeoLow) {
    streakGeoLow = new THREE.CylinderGeometry(0.01, 0.004, 0.48, 6, 1, true);
    streakGeoLow.rotateX(Math.PI / 2);
    streakGeoLow.translate(0, 0, -0.24);
  }
  return streakGeoLow;
}

function getTrailGeo() {
  if (!trailGeo) {
    trailGeo = new THREE.CylinderGeometry(0.01, 0.002, 1.15, 4, 1, true);
    trailGeo.rotateX(Math.PI / 2);
    trailGeo.translate(0, 0, -0.85);
  }
  return trailGeo;
}

function getMuzzleConeGeo() {
  if (!muzzleConeGeo) {
    muzzleConeGeo = new THREE.ConeGeometry(0.07, 0.16, 6, 1, true);
    muzzleConeGeo.rotateX(Math.PI / 2);
    muzzleConeGeo.translate(0, 0, 0.08);
  }
  return muzzleConeGeo;
}

function getCasingGeo() {
  if (!casingGeo) casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6);
  return casingGeo;
}

export type TracerSpawnParams = {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  life: number;
  color: number;
  quality: FxQuality;
  enemyProjectile?: boolean;
  enemyDamage?: number;
  sourcePosition?: THREE.Vector3;
};

/** Elongated tracer streak (pooled). Orient with `orientTracer` each frame. */
export function spawnTracer(params: TracerSpawnParams): THREE.Mesh {
  const { origin, direction, speed, life, color, quality } = params;
  const dir = direction.clone().normalize();
  let mesh = tracerPool.pop();
  const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
  if (!mesh || !mat) {
    mesh = new THREE.Mesh(
      getStreakGeo(quality),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
  } else {
    mesh.geometry = getStreakGeo(quality);
    mat.color.setHex(color);
    mat.opacity = 0.92;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.side = THREE.DoubleSide;
    mat.visible = true;
  }

  // Soft bloom trail on medium/high — skipped on low/Quest budgets.
  if (quality >= 0.55) {
    const trail = new THREE.Mesh(
      getTrailGeo(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22 + quality * 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    trail.name = "tracerTrail";
    mesh.add(trail);
  }

  mesh.position.copy(origin);
  mesh.userData = {
    velocity: dir.multiplyScalar(speed),
    life,
    maxLife: life,
    enemyProjectile: Boolean(params.enemyProjectile),
    enemyDamage: params.enemyDamage ?? 0,
    sourcePosition: params.sourcePosition?.clone(),
    pooledTracer: true,
  };
  orientTracer(mesh);
  return mesh;
}

export function orientTracer(mesh: THREE.Mesh) {
  const velocity = mesh.userData.velocity as THREE.Vector3 | undefined;
  if (!velocity || velocity.lengthSq() < 1e-8) return;
  _tracerDir.copy(velocity).normalize();
  mesh.quaternion.setFromUnitVectors(_tracerForward, _tracerDir);

  const life = mesh.userData.life as number;
  const maxLife = (mesh.userData.maxLife as number) || life;
  const fade = maxLife > 0 ? Math.max(0.15, life / maxLife) : 1;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.opacity = 0.35 + fade * 0.57;
  for (const child of mesh.children) {
    if (child.name === "tracerTrail" && child instanceof THREE.Mesh) {
      const trailMat = child.material as THREE.MeshBasicMaterial;
      trailMat.opacity = (0.12 + fade * 0.2) * fade;
    }
  }
}

export function releaseTracer(mesh: THREE.Mesh) {
  mesh.removeFromParent();
  for (let i = mesh.children.length - 1; i >= 0; i -= 1) {
    const child = mesh.children[i];
    mesh.remove(child);
    if (child instanceof THREE.Mesh) {
      const childMat = child.material as THREE.Material;
      if (child.name === "tracerTrail") childMat.dispose();
    } else if (child instanceof THREE.Points) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
  if (tracerPool.length < TRACER_POOL_MAX && mesh.userData.pooledTracer) {
    tracerPool.push(mesh);
  } else {
    (mesh.material as THREE.Material).dispose();
  }
}

/** Brief muzzle light + cone flash + optional smoke (quality-gated). */
export function spawnMuzzleBlast(
  fx: CombatFxState,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  quality: FxQuality,
  options?: { color?: number; smoke?: boolean; light?: boolean },
) {
  const color = options?.color ?? 0xffc878;
  const dir = direction.clone().normalize();
  if (options?.light !== false) {
    const intensity = quality < 0.45 ? 3.4 : 5.6;
    const range = quality < 0.45 ? 4.2 : 6.5;
    const flash = new THREE.PointLight(color, intensity, range, 2);
    flash.position.copy(origin).addScaledVector(dir, 0.12);
    fx.group.add(flash);
    window.setTimeout(() => {
      fx.group.remove(flash);
      flash.dispose();
    }, quality < 0.45 ? 45 : 70);
  }

  const cone = new THREE.Mesh(
    getMuzzleConeGeo(),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  cone.position.copy(origin).addScaledVector(dir, 0.06);
  cone.quaternion.setFromUnitVectors(_tracerForward, dir);
  fx.group.add(cone);
  window.setTimeout(() => {
    fx.group.remove(cone);
    (cone.material as THREE.Material).dispose();
  }, 55);

  const wantSmoke = options?.smoke !== false && quality >= 0.5;
  if (wantSmoke) {
    const count = Math.max(2, Math.round(5 * quality));
    const smokeOrigin = origin.clone().addScaledVector(dir, 0.18);
    const smoke = burstPoints(0x9a9080, count, smokeOrigin, 0.85, 0.28);
    (smoke.material as THREE.PointsMaterial).size = 0.07;
    (smoke.material as THREE.PointsMaterial).opacity = 0.4;
    // Bias smoke along shot + slight lift.
    const velocities = smoke.userData.velocities as THREE.Vector3[];
    for (const v of velocities) {
      v.addScaledVector(dir, 0.6 + Math.random() * 0.5);
      v.y += 0.35;
    }
    fx.group.add(smoke);
    fx.particles.push(smoke);
  }
}

export function createCombatFx(scene: THREE.Scene): CombatFxState {
  const group = new THREE.Group();
  group.name = "CombatFX";
  scene.add(group);
  return {
    group,
    particles: [],
    casings: [],
    decals: [],
    gibs: [],
    bloodPools: [],
    shake: 0,
    suppression: 0,
    cameraPunch: new THREE.Vector3(),
  };
}

function burstPoints(color: number, count: number, origin: THREE.Vector3, speed: number, life: number) {
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
    velocities.push(
      new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed)
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: getSoftParticleMap(),
    color,
    size: 0.05,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.userData = { velocities, life, maxLife: life };
  return points;
}

function directionalBloodPoints(
  origin: THREE.Vector3,
  outward: THREE.Vector3,
  count: number,
  quality: FxQuality,
) {
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  const direction = outward.clone().normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(direction);
  if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize();
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
    velocities.push(
      direction
        .clone()
        .multiplyScalar(1.5 + Math.random() * (2.4 + quality * 2.2))
        .addScaledVector(tangent, (Math.random() - 0.5) * 1.7)
        .addScaledVector(bitangent, (Math.random() - 0.5) * 1.7)
        .add(new THREE.Vector3(0, 0.4 + Math.random() * 1.1, 0)),
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: getSoftParticleMap(),
    color: 0x6f0608,
    size: quality < 0.4 ? 0.045 : 0.065,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.02,
  });
  const points = new THREE.Points(geo, material);
  points.userData = { velocities, life: 0.55, maxLife: 0.55 };
  return points;
}

/** Fine red mist — hangs briefly after entry wounds. */
function bloodMistPoints(
  origin: THREE.Vector3,
  outward: THREE.Vector3,
  count: number,
  quality: FxQuality,
) {
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  const direction = outward.clone().normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(direction);
  if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize();
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
    velocities.push(
      direction
        .clone()
        .multiplyScalar(0.35 + Math.random() * (0.9 + quality * 0.8))
        .addScaledVector(tangent, (Math.random() - 0.5) * 1.4)
        .addScaledVector(bitangent, (Math.random() - 0.5) * 1.4)
        .add(new THREE.Vector3(0, 0.15 + Math.random() * 0.55, 0)),
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: getSoftParticleMap(),
    color: 0xa01820,
    size: quality < 0.4 ? 0.035 : 0.052,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.userData = { velocities, life: 0.85, maxLife: 0.85 };
  return points;
}

function spawnBloodSpurtDecals(
  fx: CombatFxState,
  point: THREE.Vector3,
  outward: THREE.Vector3,
  quality: FxQuality,
) {
  const scale = Math.max(0.2, Math.min(1, quality));
  const dir = outward.clone().normalize();
  const count = scale >= 0.55 ? 2 : scale >= 0.3 ? 1 : 0;
  for (let i = 0; i < count; i += 1) {
    const spurt = new THREE.Mesh(
      new THREE.CircleGeometry(0.035 + Math.random() * 0.045, 6),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x4a0607 : 0x6a0a0b,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    spurt.position.copy(point).addScaledVector(dir, 0.03 + i * 0.055);
    spurt.lookAt(spurt.position.clone().add(dir));
    spurt.scale.set(0.45 + Math.random() * 0.35, 1.1 + Math.random() * 1.6, 1);
    spurt.rotation.z = Math.random() * Math.PI;
    spurt.userData.life = 7 + Math.random() * 3;
    fx.group.add(spurt);
    fx.decals.push(spurt);
  }
}

function spawnGibChunks(
  fx: CombatFxState,
  origin: THREE.Vector3,
  outward: THREE.Vector3,
  quality: FxQuality,
) {
  const scale = Math.max(0.2, Math.min(1, quality));
  const count = Math.max(2, Math.round((scale >= 0.65 ? 7 : 4) * scale));
  const dir = outward.clone().normalize();
  for (let i = 0; i < count; i += 1) {
    const gib = new THREE.Mesh(
      getGibGeo(),
      new THREE.MeshBasicMaterial({
        color: Math.random() < 0.45 ? 0x3a0606 : 0x5c0c0c,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }),
    );
    gib.position
      .copy(origin)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.12));
    const velocity = dir
      .clone()
      .multiplyScalar(1.8 + Math.random() * (2.6 + scale * 2.4))
      .add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 2.2));
    gib.userData = {
      velocity,
      life: 0.75 + Math.random() * 0.55,
      maxLife: 1.3,
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
    };
    gib.scale.setScalar(0.65 + Math.random() * 0.85);
    fx.group.add(gib);
    fx.gibs.push(gib);
  }
}

/** Flat ground smear that grows in and fades out — budget-capped. */
export function spawnGroundBloodPool(
  fx: CombatFxState,
  point: THREE.Vector3,
  intensity: number,
  quality: FxQuality = 1,
) {
  const scale = Math.max(0.2, Math.min(1, quality));
  if (scale < 0.22) return;
  const radius = (0.28 + Math.random() * 0.22) * intensity * (0.55 + scale * 0.45);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 8),
    new THREE.MeshBasicMaterial({
      color: 0x240303,
      transparent: true,
      opacity: 0.5 + scale * 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(point.x, 0.014 + Math.random() * 0.01, point.z);
  pool.userData.life = 16 + Math.random() * 10;
  pool.userData.maxLife = pool.userData.life;
  pool.userData.grow = 0.28;
  pool.scale.setScalar(0.12);
  fx.group.add(pool);
  fx.bloodPools.push(pool);
  trimFxBudget(fx);
}

/** Kill burst: spray, mist, gibs, and a ground pool — scaled by quality / fxScale. */
export function spawnFleshDeathGore(
  fx: CombatFxState,
  point: THREE.Vector3,
  shotDirection: THREE.Vector3,
  quality: FxQuality = 1,
) {
  const scale = Math.max(0.2, Math.min(1, quality));
  const outward = shotDirection.clone().normalize();
  spawnGroundBloodPool(fx, point, 1.05 + scale * 0.55, scale);
  if (scale < 0.25) return;

  const burst = directionalBloodPoints(
    point.clone().addScaledVector(outward, 0.04),
    outward,
    Math.max(8, Math.round(26 * scale)),
    scale,
  );
  (burst.material as THREE.PointsMaterial).size = 0.07 + scale * 0.045;
  fx.group.add(burst);
  fx.particles.push(burst);

  const mist = bloodMistPoints(point, outward, Math.max(4, Math.round(14 * scale)), scale);
  fx.group.add(mist);
  fx.particles.push(mist);

  if (scale >= 0.32) spawnGibChunks(fx, point, outward, scale);
  spawnBloodSpurtDecals(fx, point, outward, scale);
  trimFxBudget(fx);
}

/** Cheap wet-blood emissive + color lerp on enemy meshes. */
export function applyEnemyBloodFlash(enemy: THREE.Object3D, kind: "hit" | "kill" = "hit") {
  const emissiveHex = kind === "kill" ? 0xa01018 : 0x7a0e14;
  const emissiveBoost = kind === "kill" ? 0.58 : 0.44;
  const wetLerp = kind === "kill" ? 0.42 : 0.3;
  const duration = kind === "kill" ? 155 : 95;
  const wetColor = new THREE.Color(0x4a0808);
  enemy.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    const mat = child.material;
    const baseHex = typeof mat.userData.baseEmissiveHex === "number" ? mat.userData.baseEmissiveHex : 0x000000;
    const baseIntensity =
      typeof mat.userData.baseEmissiveIntensity === "number" ? mat.userData.baseEmissiveIntensity : 0;
    if (typeof mat.userData.baseColorHex !== "number") mat.userData.baseColorHex = mat.color.getHex();
    mat.emissive.setHex(emissiveHex);
    mat.emissiveIntensity = Math.max(emissiveBoost, baseIntensity);
    mat.color.lerp(wetColor, wetLerp);
    window.setTimeout(() => {
      mat.emissive.setHex(baseHex);
      mat.emissiveIntensity = baseIntensity;
      mat.color.setHex(mat.userData.baseColorHex as number);
    }, duration);
  });
}

function trimFxBudget(fx: CombatFxState) {
  while (fx.particles.length > ACTIVE_PARTICLE_BUDGET) {
    const oldest = fx.particles.shift();
    if (!oldest) break;
    fx.group.remove(oldest);
    oldest.geometry.dispose();
    (oldest.material as THREE.Material).dispose();
  }
  while (fx.decals.length > ACTIVE_DECAL_BUDGET) {
    const oldest = fx.decals.shift();
    if (!oldest) break;
    fx.group.remove(oldest);
    oldest.geometry.dispose();
    (oldest.material as THREE.Material).dispose();
  }
  while (fx.casings.length > ACTIVE_CASING_BUDGET) {
    const oldest = fx.casings.shift();
    if (!oldest) break;
    fx.group.remove(oldest);
  }
  while (fx.gibs.length > ACTIVE_GIB_BUDGET) {
    const oldest = fx.gibs.shift();
    if (!oldest) break;
    fx.group.remove(oldest);
  }
  while (fx.bloodPools.length > ACTIVE_BLOOD_POOL_BUDGET) {
    const oldest = fx.bloodPools.shift();
    if (!oldest) break;
    fx.group.remove(oldest);
    oldest.geometry.dispose();
    (oldest.material as THREE.Material).dispose();
  }
}

export function spawnBulletImpact(
  fx: CombatFxState,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  kind: "dirt" | "metal" | "flesh",
  quality: FxQuality = 1,
) {
  const scale = Math.max(0.25, Math.min(1, quality));
  const color = kind === "flesh" ? 0x8b1a1a : kind === "metal" ? 0xc8d0d8 : 0xb89a6a;
  const baseCount = kind === "flesh" ? 18 : kind === "dirt" ? 20 : 16;
  const count = Math.max(4, Math.round(baseCount * scale));
  const points = burstPoints(color, count, point, kind === "metal" ? 4.5 : kind === "dirt" ? 3.8 : 3.2, 0.35);
  fx.group.add(points);
  fx.particles.push(points);

  if (kind === "flesh") {
    // Directional dark-red droplets + mist sell impact in stereo without fluid sim.
    const blood = directionalBloodPoints(
      point.clone().addScaledVector(normal, 0.035),
      normal,
      Math.max(6, Math.round(18 * scale)),
      scale,
    );
    fx.group.add(blood);
    fx.particles.push(blood);

    const mist = bloodMistPoints(
      point.clone().addScaledVector(normal, 0.02),
      normal,
      Math.max(3, Math.round(10 * scale)),
      scale,
    );
    fx.group.add(mist);
    fx.particles.push(mist);

    spawnBloodSpurtDecals(fx, point, normal, scale);

    if (scale >= 0.38 && Math.random() < 0.42) {
      spawnGroundBloodPool(fx, point, 0.32 + Math.random() * 0.18, scale);
    }

    // Layer several irregular wound/splatter marks around the entry point.
    const splatterCount = scale >= 0.55 ? 3 : scale >= 0.3 ? 2 : 1;
    for (let i = 0; i < splatterCount; i += 1) {
      const radius = 0.045 + Math.random() * (0.07 + scale * 0.06);
      const splatter = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 7),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x350305 : 0x5a0708,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      splatter.position
        .copy(point)
        .addScaledVector(normal, 0.025 + i * 0.004)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.13,
          (Math.random() - 0.5) * 0.13,
          (Math.random() - 0.5) * 0.13,
        ));
      splatter.lookAt(splatter.position.clone().add(normal));
      splatter.scale.set(0.65 + Math.random() * 0.9, 0.45 + Math.random() * 1.4, 1);
      splatter.rotation.z = Math.random() * Math.PI;
      splatter.userData.life = 10;
      fx.group.add(splatter);
      fx.decals.push(splatter);
    }
  }

  // Secondary dust puff — skip on low / Quest budgets.
  if (kind !== "flesh" && scale >= 0.5) {
    const dust = burstPoints(
      0x8a7a58,
      Math.max(3, Math.round(10 * scale)),
      point.clone().addScaledVector(normal, 0.05),
      2.2,
      0.45,
    );
    (dust.material as THREE.PointsMaterial).size = 0.09;
    (dust.material as THREE.PointsMaterial).opacity = 0.55;
    fx.group.add(dust);
    fx.particles.push(dust);
  }

  // Impact flash lights are expensive — skip below high quality.
  if (scale >= 0.85) {
    const flash = new THREE.PointLight(kind === "flesh" ? 0xff4422 : 0xffeeaa, 3.2 * scale, 4, 2);
    flash.position.copy(point);
    fx.group.add(flash);
    window.setTimeout(() => {
      fx.group.remove(flash);
      flash.dispose();
    }, 40);
  }

  const decal = new THREE.Mesh(
    new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 8),
    new THREE.MeshBasicMaterial({
      color: kind === "flesh" ? 0x4a0a0a : 0x1a1a16,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  decal.position.copy(point).addScaledVector(normal, 0.02);
  decal.lookAt(point.clone().add(normal));
  decal.userData.life = 8;
  fx.group.add(decal);
  fx.decals.push(decal);
  trimFxBudget(fx);
}

export function spawnShellCasing(
  fx: CombatFxState,
  origin: THREE.Vector3,
  right: THREE.Vector3,
  quality: FxQuality = 1,
) {
  if (quality < 0.4 && fx.casings.length > 10) return;
  const casing = new THREE.Mesh(
    getCasingGeo(),
    quality >= 0.65
      ? new THREE.MeshStandardMaterial({
          color: 0xd4b06a,
          metalness: 0.9,
          roughness: 0.28,
          emissive: 0x3a2a10,
          emissiveIntensity: 0.15,
        })
      : new THREE.MeshBasicMaterial({ color: 0xc4a35a }),
  );
  casing.position.copy(origin);
  casing.rotation.z = Math.PI / 2;
  const eject = right.clone().multiplyScalar(1.8 + Math.random()).add(new THREE.Vector3(0, 2.2 + Math.random(), -0.4));
  casing.userData = { velocity: eject, life: 1.45, spin: (Math.random() - 0.5) * 18 };
  fx.group.add(casing);
  fx.casings.push(casing);

  // Cheap brass spark on eject — skipped on low quality.
  if (quality >= 0.55) {
    const sparks = burstPoints(0xffe2a0, Math.max(2, Math.round(4 * quality)), origin, 2.4, 0.18);
    (sparks.material as THREE.PointsMaterial).size = 0.035;
    const velocities = sparks.userData.velocities as THREE.Vector3[];
    for (const v of velocities) {
      v.addScaledVector(right, 1.2 + Math.random());
      v.y += 0.8;
    }
    fx.group.add(sparks);
    fx.particles.push(sparks);
  }
  trimFxBudget(fx);
}

export function addRecoilShake(fx: CombatFxState, amount: number) {
  fx.shake = Math.min(0.55, fx.shake + amount);
  fx.cameraPunch.x += (Math.random() - 0.5) * amount * 0.4;
  fx.cameraPunch.y += amount * 0.55;
}

export function addDamageShake(fx: CombatFxState, amount: number, bearing?: "front" | "left" | "right" | "rear" | null) {
  fx.shake = Math.min(0.65, fx.shake + amount * 0.85);
  fx.suppression = Math.min(0.72, fx.suppression + amount * 0.38);
  if (bearing === "left") fx.cameraPunch.x -= amount * 0.45;
  else if (bearing === "right") fx.cameraPunch.x += amount * 0.45;
  else if (bearing === "rear") fx.cameraPunch.z += amount * 0.25;
  else fx.cameraPunch.y += amount * 0.3;
}

export function addSuppression(fx: CombatFxState, amount: number) {
  fx.suppression = Math.min(0.65, fx.suppression + amount * 0.7);
  fx.shake = Math.min(0.28, fx.shake + amount * 0.1);
}

export function applyCameraShake(
  camera: THREE.PerspectiveCamera,
  fx: CombatFxState,
  basePitch: number,
  baseYaw: number,
  dt: number,
  reduceMotion: boolean
) {
  fx.shake = Math.max(0, fx.shake - dt * 2.2);
  fx.suppression = Math.max(0, fx.suppression - dt * 0.55);
  fx.cameraPunch.multiplyScalar(Math.max(0, 1 - dt * 8));

  if (reduceMotion || fx.shake <= 0.001) {
    camera.rotation.set(basePitch, baseYaw, 0, "YXZ");
    return;
  }

  const s = fx.shake * (0.5 + fx.suppression * 0.5);
  const ox = (Math.random() - 0.5) * s * 0.035 + fx.cameraPunch.x * 0.08;
  const oy = (Math.random() - 0.5) * s * 0.028 + fx.cameraPunch.y * 0.06;
  const oz = (Math.random() - 0.5) * s * 0.012;
  camera.rotation.set(basePitch + oy, baseYaw + ox, oz, "YXZ");
}

export function updateCombatFx(fx: CombatFxState, dt: number) {
  for (const points of fx.particles) {
    const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const velocities = points.userData.velocities as THREE.Vector3[];
    points.userData.life -= dt;
    const lifeRatio = Math.max(0, points.userData.life / points.userData.maxLife);
    (points.material as THREE.PointsMaterial).opacity = lifeRatio;
    for (let i = 0; i < velocities.length; i += 1) {
      velocities[i].y -= 6 * dt;
      positions.setXYZ(
        i,
        positions.getX(i) + velocities[i].x * dt,
        positions.getY(i) + velocities[i].y * dt,
        positions.getZ(i) + velocities[i].z * dt
      );
    }
    positions.needsUpdate = true;
  }
  fx.particles = fx.particles.filter((p) => {
    if (p.userData.life > 0) return true;
    fx.group.remove(p);
    p.geometry.dispose();
    (p.material as THREE.Material).dispose();
    return false;
  });

  for (const casing of fx.casings) {
    const vel = casing.userData.velocity as THREE.Vector3;
    vel.y -= 14 * dt;
    casing.position.addScaledVector(vel, dt);
    casing.rotation.x += casing.userData.spin * dt;
    casing.userData.life -= dt;
    if (casing.position.y < 0.03) {
      casing.position.y = 0.03;
      vel.set(0, 0, 0);
    }
  }
  fx.casings = fx.casings.filter((c) => {
    if (c.userData.life > 0) return true;
    fx.group.remove(c);
    return false;
  });

  for (const decal of fx.decals) {
    decal.userData.life -= dt;
    if (decal.material instanceof THREE.MeshBasicMaterial) {
      decal.material.opacity = Math.min(0.75, decal.userData.life / 4);
    }
  }
  fx.decals = fx.decals.filter((d) => {
    if (d.userData.life > 0) return true;
    fx.group.remove(d);
    d.geometry.dispose();
    (d.material as THREE.Material).dispose();
    return false;
  });

  for (const gib of fx.gibs) {
    const vel = gib.userData.velocity as THREE.Vector3;
    const spin = gib.userData.spin as THREE.Vector3;
    vel.y -= 11 * dt;
    gib.position.addScaledVector(vel, dt);
    gib.rotation.x += spin.x * dt;
    gib.rotation.y += spin.y * dt;
    gib.rotation.z += spin.z * dt;
    gib.userData.life -= dt;
    const lifeRatio = Math.max(0, gib.userData.life / (gib.userData.maxLife as number));
    if (gib.material instanceof THREE.MeshBasicMaterial) {
      gib.material.opacity = 0.94 * lifeRatio;
    }
    gib.scale.setScalar((0.65 + lifeRatio * 0.35) * lifeRatio);
    if (gib.position.y < 0.025) {
      gib.position.y = 0.025;
      vel.y *= -0.15;
      vel.x *= 0.55;
      vel.z *= 0.55;
    }
  }
  fx.gibs = fx.gibs.filter((g) => {
    if (g.userData.life > 0) return true;
    fx.group.remove(g);
    return false;
  });

  for (const pool of fx.bloodPools) {
    pool.userData.life -= dt;
    const maxLife = (pool.userData.maxLife as number) || pool.userData.life;
    const lifeRatio = Math.max(0, pool.userData.life / maxLife);
    const growT = 1 - Math.max(0, pool.userData.grow as number);
    pool.userData.grow = Math.max(0, (pool.userData.grow as number) - dt);
    const growScale = 0.12 + growT * 0.88;
    pool.scale.setScalar(growScale);
    if (pool.material instanceof THREE.MeshBasicMaterial) {
      pool.material.opacity = Math.min(0.72, (0.35 + lifeRatio * 0.45) * Math.min(1, growScale * 1.2));
    }
  }
  fx.bloodPools = fx.bloodPools.filter((p) => {
    if (p.userData.life > 0) return true;
    fx.group.remove(p);
    p.geometry.dispose();
    (p.material as THREE.Material).dispose();
    return false;
  });
}

/** Screen-edge vignette strength for HUD (0–1). */
export function suppressionHudOpacity(fx: CombatFxState) {
  return fx.suppression * 0.38;
}

/** Brief impact spark at a world point — ambient yard chaos, not combat hits. */
export function spawnAmbientImpactSpark(
  fx: CombatFxState,
  point: THREE.Vector3,
  quality: FxQuality,
) {
  if (quality < 0.22 || fx.particles.length >= ACTIVE_PARTICLE_BUDGET) return;
  const count = quality < 0.45 ? 4 : 7;
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = point.x + (Math.random() - 0.5) * 0.08;
    positions[i * 3 + 1] = point.y + Math.random() * 0.06;
    positions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 0.08;
    velocities.push(
      new THREE.Vector3((Math.random() - 0.5) * 2.8, 1.2 + Math.random() * 2.4, (Math.random() - 0.5) * 2.8),
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      map: getSoftParticleMap(),
      color: 0xffc878,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sparks.userData.life = 0.35;
  sparks.userData.maxLife = 0.35;
  sparks.userData.velocities = velocities;
  sparks.position.set(0, 0, 0);
  fx.group.add(sparks);
  fx.particles.push(sparks);
}
