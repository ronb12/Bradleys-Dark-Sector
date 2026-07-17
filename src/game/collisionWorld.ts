import * as THREE from "three";

export type SurfaceKind = "dirt" | "metal" | "concrete" | "glass" | "wood";

export type WorldHit = {
  collider: THREE.Box3;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  surface: SurfaceKind;
};

function surfaceForBox(box: THREE.Box3): SurfaceKind {
  const size = box.getSize(new THREE.Vector3());
  return size.y >= 1.8 || size.x * size.z >= 8 ? "metal" : "dirt";
}

/** Nearest ray/AABB hit. Kept allocation-light enough for AI LOS and projectiles. */
export function raycastColliders(
  colliders: THREE.Box3[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): WorldHit | null {
  const ray = new THREE.Ray(origin, direction);
  const point = new THREE.Vector3();
  let best: WorldHit | null = null;

  for (const collider of colliders) {
    const hit = ray.intersectBox(collider, point);
    if (!hit) continue;
    const distance = hit.distanceTo(origin);
    if (distance < 0.12 || distance > maxDistance || (best && distance >= best.distance)) continue;

    const center = collider.getCenter(new THREE.Vector3());
    const size = collider.getSize(new THREE.Vector3());
    const local = hit.clone().sub(center);
    const nx = Math.abs(local.x / Math.max(size.x * 0.5, 0.001));
    const ny = Math.abs(local.y / Math.max(size.y * 0.5, 0.001));
    const nz = Math.abs(local.z / Math.max(size.z * 0.5, 0.001));
    const normal = new THREE.Vector3();
    if (nx >= ny && nx >= nz) normal.set(Math.sign(local.x) || 1, 0, 0);
    else if (ny >= nx && ny >= nz) normal.set(0, Math.sign(local.y) || 1, 0);
    else normal.set(0, 0, Math.sign(local.z) || 1);

    best = {
      collider,
      point: hit.clone(),
      normal,
      distance,
      surface: surfaceForBox(collider),
    };
  }
  return best;
}

export function segmentIntersectsSphere(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): boolean {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.000001) return start.distanceToSquared(center) <= radius * radius;
  const t = THREE.MathUtils.clamp(center.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return start.clone().addScaledVector(segment, t).distanceToSquared(center) <= radius * radius;
}
