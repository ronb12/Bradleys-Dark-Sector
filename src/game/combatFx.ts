/** Combat feedback: impacts, casings, shake, blood/dust, suppression, directional VFX. */

import * as THREE from "three";

export type CombatFxState = {
  group: THREE.Group;
  particles: THREE.Points[];
  casings: THREE.Mesh[];
  decals: THREE.Mesh[];
  shake: number;
  suppression: number;
  cameraPunch: THREE.Vector3;
};

export function createCombatFx(scene: THREE.Scene): CombatFxState {
  const group = new THREE.Group();
  group.name = "CombatFX";
  scene.add(group);
  return {
    group,
    particles: [],
    casings: [],
    decals: [],
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
    color,
    size: 0.06,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.userData = { velocities, life, maxLife: life };
  return points;
}

export function spawnBulletImpact(fx: CombatFxState, point: THREE.Vector3, normal: THREE.Vector3, kind: "dirt" | "metal" | "flesh") {
  const color = kind === "flesh" ? 0x8b1a1a : kind === "metal" ? 0xc8d0d8 : 0xb89a6a;
  const count = kind === "flesh" ? 18 : kind === "dirt" ? 20 : 16;
  const points = burstPoints(color, count, point, kind === "metal" ? 4.5 : kind === "dirt" ? 3.8 : 3.2, 0.35);
  fx.group.add(points);
  fx.particles.push(points);

  // Secondary dust puff on hard / dirt impacts for compound combat feel.
  if (kind !== "flesh") {
    const dust = burstPoints(0x8a7a58, 10, point.clone().addScaledVector(normal, 0.05), 2.2, 0.45);
    (dust.material as THREE.PointsMaterial).size = 0.09;
    (dust.material as THREE.PointsMaterial).opacity = 0.55;
    fx.group.add(dust);
    fx.particles.push(dust);
  }

  // Impact flash
  const flash = new THREE.PointLight(kind === "flesh" ? 0xff4422 : 0xffeeaa, 4.5, 5, 2);
  flash.position.copy(point);
  fx.group.add(flash);
  window.setTimeout(() => fx.group.remove(flash), 50);

  // Tiny decal disc
  const decal = new THREE.Mesh(
    new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 10),
    new THREE.MeshBasicMaterial({
      color: kind === "flesh" ? 0x4a0a0a : 0x1a1a16,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  decal.position.copy(point).addScaledVector(normal, 0.02);
  decal.lookAt(point.clone().add(normal));
  decal.userData.life = 8;
  fx.group.add(decal);
  fx.decals.push(decal);
}

export function spawnShellCasing(fx: CombatFxState, origin: THREE.Vector3, right: THREE.Vector3) {
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6),
    new THREE.MeshStandardMaterial({ color: 0xc4a35a, metalness: 0.85, roughness: 0.35 })
  );
  casing.position.copy(origin);
  casing.rotation.z = Math.PI / 2;
  const eject = right.clone().multiplyScalar(1.8 + Math.random()).add(new THREE.Vector3(0, 2.2 + Math.random(), -0.4));
  casing.userData = { velocity: eject, life: 1.4, spin: (Math.random() - 0.5) * 18 };
  fx.group.add(casing);
  fx.casings.push(casing);
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
    return false;
  });
}

/** Screen-edge vignette strength for HUD (0–1). */
export function suppressionHudOpacity(fx: CombatFxState) {
  return fx.suppression * 0.38;
}
