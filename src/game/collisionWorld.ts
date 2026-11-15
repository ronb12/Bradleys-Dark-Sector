import * as THREE from "three";

export type SurfaceKind = "dirt" | "metal" | "concrete" | "glass" | "wood";

/** How a collider treats small-arms fire. */
export type CoverGrade = "hard" | "light" | "floor";

export type WorldHit = {
  collider: THREE.Box3;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  surface: SurfaceKind;
  grade: CoverGrade;
};

export type BulletCoverResult = {
  /** True when hard cover (or too much light cover) stops the round before the target. */
  blocked: boolean;
  /** Multiplier after soft light-cover penetration (1 = clean). */
  damageMul: number;
  /** First solid impact along the ray (for FX), if any. */
  impact: WorldHit | null;
  /** True when the round punched through light cover. */
  penetrated: boolean;
};

const _ray = new THREE.Ray();
const _hitPoint = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _local = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _from = new THREE.Vector3();

function surfaceForBox(box: THREE.Box3): SurfaceKind {
  box.getSize(_size);
  return _size.y >= 1.8 || _size.x * _size.z >= 8 ? "metal" : "dirt";
}

/**
 * Sandbags / Jersey / crates ≈ 0.9–1.35 m. Floor slabs are flat pads.
 * Everything taller (walls, Hesco stacks, buildings) is hard stop.
 */
export function coverGradeForBox(box: THREE.Box3): CoverGrade {
  box.getSize(_size);
  if (_size.y < 0.45) return "floor";
  // Low fighting positions — allow over-the-top clearance + soft pen.
  if (box.max.y <= 1.45 && _size.y <= 1.55) return "light";
  return "hard";
}

/** Ray height at a distance along a unit direction. */
function rayHeightAt(origin: THREE.Vector3, direction: THREE.Vector3, distance: number) {
  return origin.y + direction.y * distance;
}

/**
 * True when the round clears the parapet / floor pad instead of burying into mass.
 * Fixes fat AABBs on sandbags that block chest shots aimed over the lip.
 */
export function shotClearsCover(
  hit: Pick<WorldHit, "collider" | "distance" | "grade">,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): boolean {
  if (hit.grade === "floor") return true;
  const y = rayHeightAt(origin, direction, hit.distance);
  // Slightly under the top still counts as a lip graze on low cover.
  const lip = hit.grade === "light" ? 0.18 : 0.08;
  return y >= hit.collider.max.y - lip;
}

function surfaceImpactKind(grade: CoverGrade, surface: SurfaceKind): SurfaceKind {
  if (grade === "floor") return "dirt";
  return surface;
}

/** Nearest ray/AABB hit. Allocation-light for AI LOS and projectiles. */
export function raycastColliders(
  colliders: THREE.Box3[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  ignore?: ReadonlySet<THREE.Box3> | null,
): WorldHit | null {
  _ray.origin.copy(origin);
  _ray.direction.copy(direction);
  let best: WorldHit | null = null;
  let bestDist = maxDistance;

  for (const collider of colliders) {
    if (ignore?.has(collider)) continue;
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

    const grade = coverGradeForBox(collider);
    bestDist = distance;
    best = {
      collider,
      point: hit.clone(),
      normal: _normal.clone(),
      distance,
      surface: surfaceImpactKind(grade, surfaceForBox(collider)),
      grade,
    };
  }
  return best;
}

/**
 * Trace cover between muzzle and a prospective target distance.
 * - Floor pads / parapet clears never block.
 * - Light cover (sandbags, Jersey, crates) can be punched with damage falloff.
 * - Hard cover stops the round.
 */
export function evaluateBulletCover(
  colliders: THREE.Box3[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  targetDistance: number,
): BulletCoverResult {
  const stopAt = Math.max(0, targetDistance - 0.15);
  if (stopAt <= 0.05) {
    return { blocked: false, damageMul: 1, impact: null, penetrated: false };
  }

  let damageMul = 1;
  let penetrated = false;
  let firstImpact: WorldHit | null = null;
  let cursor = 0;
  const ignored = new Set<THREE.Box3>();

  for (let step = 0; step < 8; step += 1) {
    const remain = stopAt - cursor;
    if (remain <= 0.05) break;
    _from.copy(origin).addScaledVector(direction, cursor);
    const hit = raycastColliders(colliders, _from, direction, remain, ignored);
    if (!hit) break;

    const worldDist = cursor + hit.distance;
    const worldHit: WorldHit = {
      ...hit,
      distance: worldDist,
      point: origin.clone().addScaledVector(direction, worldDist),
    };
    if (!firstImpact) firstImpact = worldHit;

    if (shotClearsCover(worldHit, origin, direction)) {
      ignored.add(hit.collider);
      cursor = worldDist + 0.06;
      continue;
    }

    if (hit.grade === "light") {
      penetrated = true;
      damageMul *= 0.72;
      if (damageMul < 0.38) {
        return { blocked: true, damageMul: 0, impact: firstImpact, penetrated: true };
      }
      ignored.add(hit.collider);
      // Step through the slab so the same AABB isn't re-tested.
      hit.collider.getSize(_size);
      cursor = worldDist + Math.max(0.2, Math.min(0.85, Math.min(_size.x, _size.z) * 0.55));
      continue;
    }

    return { blocked: true, damageMul: 0, impact: worldHit, penetrated };
  }

  return { blocked: false, damageMul, impact: firstImpact, penetrated };
}

/**
 * AI / fairness LOS: floors and parapet clears don't block, but light cover mass does.
 * (Peeking over sandbags is fine; shooting through the bag stack is not.)
 */
export function hasClearShotLane(
  colliders: THREE.Box3[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
): boolean {
  const stopAt = Math.max(0, distance);
  if (stopAt <= 0.05) return true;
  let cursor = 0;
  const ignored = new Set<THREE.Box3>();
  for (let step = 0; step < 6; step += 1) {
    const remain = stopAt - cursor;
    if (remain <= 0.05) return true;
    _from.copy(origin).addScaledVector(direction, cursor);
    const hit = raycastColliders(colliders, _from, direction, remain, ignored);
    if (!hit) return true;
    const worldDist = cursor + hit.distance;
    const graded = { ...hit, distance: worldDist };
    if (shotClearsCover(graded, origin, direction)) {
      ignored.add(hit.collider);
      cursor = worldDist + 0.06;
      continue;
    }
    return false;
  }
  return true;
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
