import * as THREE from "three";
import { raycastColliders, segmentIntersectsSphere, type WorldHit } from "./collisionWorld";

export type BulletStepResult = {
  end: THREE.Vector3;
  worldHit: WorldHit | null;
  targetHit: boolean;
};

export function sweepBullet(
  start: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  colliders: THREE.Box3[],
  targetCenter?: THREE.Vector3,
  targetRadius = 0.65,
): BulletStepResult {
  const travel = velocity.length() * dt;
  const direction = velocity.clone().normalize();
  const worldHit = raycastColliders(colliders, start, direction, travel);
  const end = worldHit ? worldHit.point.clone() : start.clone().addScaledVector(velocity, dt);
  const targetHit = Boolean(
    targetCenter
      && segmentIntersectsSphere(start, end, targetCenter, targetRadius),
  );
  return { end, worldHit, targetHit };
}

export type GrenadeProjectile = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  fuse: number;
  radius: number;
  owner: "player" | "enemy";
};

export function createGrenade(
  scene: THREE.Scene,
  origin: THREE.Vector3,
  velocity: THREE.Vector3,
  owner: GrenadeProjectile["owner"],
): GrenadeProjectile {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({
      color: owner === "player" ? 0x4f5d3d : 0x5d3d32,
      roughness: 0.72,
      metalness: 0.5,
    }),
  );
  mesh.position.copy(origin);
  mesh.castShadow = true;
  scene.add(mesh);
  return { mesh, velocity: velocity.clone(), fuse: 2.35, radius: 7.5, owner };
}

export function stepGrenade(grenade: GrenadeProjectile, dt: number, colliders: THREE.Box3[]) {
  grenade.fuse -= dt;
  grenade.velocity.y -= 10.5 * dt;
  const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
  const direction = next.clone().sub(grenade.mesh.position);
  const distance = direction.length();
  const hit = distance > 0.001
    ? raycastColliders(colliders, grenade.mesh.position, direction.normalize(), distance)
    : null;
  if (hit) {
    grenade.mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.08);
    grenade.velocity.reflect(hit.normal).multiplyScalar(0.34);
  } else {
    grenade.mesh.position.copy(next);
  }
  if (grenade.mesh.position.y < 0.11) {
    grenade.mesh.position.y = 0.11;
    grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.25;
    grenade.velocity.x *= 0.72;
    grenade.velocity.z *= 0.72;
  }
  grenade.mesh.rotation.x += dt * 8;
  grenade.mesh.rotation.z += dt * 6;
  return grenade.fuse <= 0;
}
