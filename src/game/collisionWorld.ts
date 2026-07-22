import * as THREE from "three";

export type SurfaceKind = "dirt" | "metal" | "concrete" | "glass" | "wood";

export type WorldHit = {
  collider: THREE.Box3;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  surface: SurfaceKind;
};

const _ray = new THREE.Ray();
const _hitPoint = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _local = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _toCenter = new THREE.Vector3();

function surfaceForBox(box: THREE.Box3): SurfaceKind {
  box.getSize(_size);
  return _size.y >= 1.8 || _size.x * _size.z >= 8 ? "metal" : "dirt";
}

/** Nearest ray/AABB hit. Allocation-light for AI LOS and projectiles. */
export function raycastColliders(
  colliders: THREE.Box3[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): WorldHit | null {
  _ray.origin.copy(origin);
  _ray.direction.copy(direction);
  let best: WorldHit | null = null;
  let bestDist = maxDistance;

  for (const collider of colliders) {
    // Sphere early-out around AABB — skips most of ~280 colliders cheaply.
    collider.getCenter(_center);
    collider.getSize(_size);
    const radius = Math.sqrt(_size.x * _size.x + _size.y * _size.y + _size.z * _size.z) * 0.5;
    _toCenter.copy(_center).sub(origin);
    const proj = _toCenter.dot(direction);
    if (proj < -radius || proj > bestDist + radius) continue;
    const closestDistSq = _toCenter.lengthSq() - proj * proj;
    if (closestDistSq > radius * radius) continue;

    const hit = _ray.intersectBox(collider, _hitPoint);
    if (!hit) continue;
    const distance = hit.distanceTo(origin);
    if (distance < 0.12 || distance > bestDist) continue;

    collider.getCenter(_center);
    collider.getSize(_size);
    _local.copy(hit).sub(_center);
    const nx = Math.abs(_local.x / Math.max(_size.x * 0.5, 0.001));
    const ny = Math.abs(_local.y / Math.max(_size.y * 0.5, 0.001));
    const nz = Math.abs(_local.z / Math.max(_size.z * 0.5, 0.001));
    if (nx >= ny && nx >= nz) _normal.set(Math.sign(_local.x) || 1, 0, 0);
    else if (ny >= nx && ny >= nz) _normal.set(0, Math.sign(_local.y) || 1, 0);
    else _normal.set(0, 0, Math.sign(_local.z) || 1);

    bestDist = distance;
    best = {
      collider,
      point: hit.clone(),
      normal: _normal.clone(),
      distance,
      surface: surfaceForBox(collider),
    };
  }
  return best;
}

const _segment = new THREE.Vector3();
const _closest = new THREE.Vector3();

export function segmentIntersectsSphere(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): boolean {
  _segment.copy(end).sub(start);
  const lengthSq = _segment.lengthSq();
  if (lengthSq <= 0.000001) return start.distanceToSquared(center) <= radius * radius;
  const t = THREE.MathUtils.clamp(_closest.copy(center).sub(start).dot(_segment) / lengthSq, 0, 1);
  _closest.copy(start).addScaledVector(_segment, t);
  return _closest.distanceToSquared(center) <= radius * radius;
}
