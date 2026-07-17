/** Smarter AI: squads, cover, flanking, wounded retreat, coordinated pushes, grenade reactions. */

import * as THREE from "three";

export type AiRole = "assault" | "flanker" | "support" | "suppressor";

export type Squad = {
  id: number;
  members: THREE.Group[];
  pushUntil: number;
  focusX: number;
  focusZ: number;
};

export type CoverPoint = {
  x: number;
  z: number;
  quality: number;
  normalX: number;
  normalZ: number;
  peekLeftX: number;
  peekLeftZ: number;
  peekRightX: number;
  peekRightZ: number;
};

export type AiContext = {
  player: THREE.Vector3;
  colliders: THREE.Box3[];
  coverPoints: CoverPoint[];
  dt: number;
  now: number;
  tryMove: (from: THREE.Vector3, delta: THREE.Vector3) => { position: THREE.Vector3; moved: boolean; stuck: boolean };
  hasLos: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
};

let nextSquadId = 1;

export function buildCoverPointsFromColliders(colliders: THREE.Box3[]): CoverPoint[] {
  const points: CoverPoint[] = [];
  for (const box of colliders) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // Include sandbags / Jersey (~0.9–1.1 m). Skip tiny debris and floor slabs.
    if (size.y < 0.75 || size.x * size.z < 0.35) continue;
    // Skip perimeter walls / giant warehouse slabs — they starved yard fighting cover.
    if (size.x > 14 || size.z > 14) continue;
    const footprint = size.x * size.z;
    const combatProp = footprint < 18;
    const offsets: Array<[number, number]> = [
      [0, size.z * 0.55 + 0.95],
      [0, -(size.z * 0.55 + 0.95)],
      [size.x * 0.55 + 0.95, 0],
      [-(size.x * 0.55 + 0.95), 0],
    ];
    for (const [ox, oz] of offsets) {
      const x = center.x + ox;
      const z = center.z + oz;
      const normal = new THREE.Vector2(ox, oz).normalize();
      const tangent = new THREE.Vector2(-normal.y, normal.x);
      // Prefer mid-yard fighting positions over outer skirts.
      const radial = Math.hypot(x, z);
      const yardBias = Math.max(0, 1.4 - radial / 48);
      const propBonus = combatProp ? 2.4 : 0.35;
      const heightScore = Math.min(size.y, 2.6);
      points.push({
        x,
        z,
        quality: heightScore + yardBias + propBonus,
        normalX: normal.x,
        normalZ: normal.y,
        peekLeftX: x + tangent.x * 0.72,
        peekLeftZ: z + tangent.y * 0.72,
        peekRightX: x - tangent.x * 0.72,
        peekRightZ: z - tangent.y * 0.72,
      });
    }
  }
  points.sort((a, b) => b.quality - a.quality);
  // Keep a dense mid-yard set; drop duplicates that sit on top of each other.
  const unique: CoverPoint[] = [];
  for (const p of points) {
    if (unique.some((u) => Math.hypot(u.x - p.x, u.z - p.z) < 1.15)) continue;
    unique.push(p);
    if (unique.length >= 140) break;
  }
  return unique;
}

export function assignSquads(enemies: THREE.Group[], maxSquad = 4): Squad[] {
  const alive = enemies.filter((e) => e.userData.alive);
  const squads: Squad[] = [];
  for (let i = 0; i < alive.length; i += maxSquad) {
    const members = alive.slice(i, i + maxSquad);
    const roles: AiRole[] = ["assault", "flanker", "support", "suppressor"];
    members.forEach((m, idx) => {
      m.userData.squadId = nextSquadId;
      m.userData.aiRole = roles[idx % roles.length];
      m.userData.coverTarget = null as CoverPoint | null;
      m.userData.retreatUntil = 0;
      m.userData.grenadeReactUntil = 0;
      m.userData.suppression = 0;
      m.userData.magazine = m.userData.enemyType === "Heavy" ? 40 : 24;
      m.userData.magazineSize = m.userData.magazine;
      m.userData.reloadUntil = 0;
      m.userData.nextGrenadeAt = performance.now() / 1000 + 5 + Math.random() * 8;
      m.userData.peekSide = idx % 2 === 0 ? 1 : -1;
      m.userData.peekUntil = 0;
      m.userData.pushBias = 0;
    });
    squads.push({
      id: nextSquadId++,
      members,
      pushUntil: 0,
      focusX: members[0]?.position.x ?? 0,
      focusZ: members[0]?.position.z ?? 0,
    });
  }
  return squads;
}

function nearestCover(
  from: THREE.Vector3,
  player: THREE.Vector3,
  covers: CoverPoint[],
  preferredDistance: number,
  minimumDistance: number,
  preferAway = false
): CoverPoint | null {
  let best: CoverPoint | null = null;
  let bestScore = -Infinity;
  for (const c of covers) {
    const toPlayer = Math.hypot(c.x - player.x, c.z - player.z);
    const toSelf = Math.hypot(c.x - from.x, c.z - from.z);
    if (toSelf < 0.55) continue;
    // Never select "cover" that would pull a ranged soldier into the player.
    if (!preferAway && toPlayer < minimumDistance) continue;
    // Prefer reachable nearby cover over distant warehouses.
    if (toSelf > 18 && !preferAway) continue;
    let score = c.quality * 2.2 - toSelf * 0.85;
    if (preferAway) score += toPlayer * 0.15;
    else score += Math.max(0, 12 - Math.abs(toPlayer - preferredDistance));
    // Prefer cover that sits between enemy and player (occluder feel).
    const ax = from.x - player.x;
    const az = from.z - player.z;
    const bx = c.x - player.x;
    const bz = c.z - player.z;
    const align = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) + 0.001);
    score += align * 2.8;
    // Bonus when the point is on the far side of cover from the player (behind the prop).
    if (toPlayer + 0.8 < Math.hypot(from.x - player.x, from.z - player.z)) score += 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function signalGrenadeThreat(enemies: THREE.Group[], gx: number, gz: number, radius = 10) {
  const now = performance.now() / 1000;
  for (const e of enemies) {
    if (!e.userData.alive) continue;
    if (Math.hypot(e.position.x - gx, e.position.z - gz) <= radius) {
      e.userData.grenadeReactUntil = now + 2.2;
      e.userData.coverTarget = null;
    }
  }
}

export function updateSquadCoordination(squads: Squad[], ctx: AiContext) {
  for (const squad of squads) {
    squad.members = squad.members.filter((m) => m.userData.alive);
    if (!squad.members.length) continue;

    const wounded = squad.members.filter((m) => m.userData.health / m.userData.maxHealth < 0.35).length;
    const healthy = squad.members.length - wounded;
    const avgDist =
      squad.members.reduce((s, m) => s + m.position.distanceTo(ctx.player), 0) / Math.max(1, squad.members.length);

    // Coordinated pressure changes firing tempo, but does not abandon hard cover.
    if (ctx.now > squad.pushUntil && healthy >= 2 && avgDist < 22 && wounded === 0) {
      squad.pushUntil = ctx.now + 6 + Math.random() * 4;
      squad.focusX = ctx.player.x;
      squad.focusZ = ctx.player.z;
      for (const m of squad.members) {
        m.userData.pushBias = 1.4;
        // Keep cover targets — push through lanes, don't dump everyone into the open.
      }
    }

    if (ctx.now < squad.pushUntil) {
      for (const m of squad.members) m.userData.pushBias = Math.max(m.userData.pushBias || 0, 1);
    } else {
      for (const m of squad.members) m.userData.pushBias = Math.max(0, (m.userData.pushBias || 0) - ctx.dt * 0.5);
    }
  }
}

export type AiSteerResult = {
  steer: THREE.Vector3;
  wantCover: boolean;
  retreating: boolean;
  suppressed: boolean;
  intent: "advance" | "hold" | "strafe" | "cover" | "retreat";
};

export function computeEnemySteer(enemy: THREE.Group, ctx: AiContext): AiSteerResult {
  const toPlayer = ctx.player.clone().sub(enemy.position);
  const distance = toPlayer.length();
  const toward = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, -1);
  const flankSign = enemy.userData.flank || 1;
  const flankDir = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(flankSign);
  const preferred = enemy.userData.preferredDistance || 8;
  const minimum = enemy.userData.minimumDistance || 5;
  const weaponRange = enemy.userData.range || preferred + 3;
  const role = (enemy.userData.aiRole as AiRole) || "assault";
  const hpRatio = enemy.userData.health / Math.max(1, enemy.userData.maxHealth);
  const now = ctx.now;
  const hasLos = ctx.hasLos(enemy.position, ctx.player);
  const tacticalOffset = enemy.userData.tacticalOffset ?? Math.random() * 5.4;
  enemy.userData.tacticalOffset = tacticalOffset;

  let retreating = false;
  let wantCover = false;
  enemy.userData.suppression = Math.max(0, (enemy.userData.suppression || 0) - ctx.dt * 0.28);
  let suppressed = (enemy.userData.suppression || 0) > 0.58;

  // Retreat ONLY when wounded (user request) — not healthy flee behavior.
  if (hpRatio < 0.32 && now > (enemy.userData.retreatUntil || 0)) {
    enemy.userData.retreatUntil = now + 3.5;
  }
  if (now < (enemy.userData.retreatUntil || 0)) {
    retreating = true;
    wantCover = true;
  }

  if (now < (enemy.userData.grenadeReactUntil || 0)) {
    suppressed = true;
    wantCover = true;
  }

  if (!enemy.userData.coverTarget || now >= (enemy.userData.coverLockUntil || 0)) {
    const cover = nearestCover(enemy.position, ctx.player, ctx.coverPoints, preferred, minimum, retreating);
    if (cover) {
      enemy.userData.coverTarget = cover;
      enemy.userData.coverLockUntil = now + 4 + Math.random() * 3;
    }
  }

  const cover = enemy.userData.coverTarget as CoverPoint | null;
  const push = enemy.userData.pushBias || 0;
  const steer = new THREE.Vector3();
  let intent: AiSteerResult["intent"] = "hold";

  if (suppressed && cover) {
    intent = "cover";
    steer.set(cover.x - enemy.position.x, 0, cover.z - enemy.position.z);
  } else if (retreating) {
    intent = "retreat";
    steer.copy(toward).multiplyScalar(-1).addScaledVector(flankDir, 0.55);
    if (cover) steer.add(new THREE.Vector3(cover.x - enemy.position.x, 0, cover.z - enemy.position.z).normalize().multiplyScalar(0.8));
  } else {
    const farThreshold = Math.max(preferred + 1.5, Math.min(weaponRange * 0.9, preferred + 3));
    const coverDistance = cover ? Math.hypot(cover.x - enemy.position.x, cover.z - enemy.position.z) : Infinity;
    const coverPlayerDistance = cover ? Math.hypot(cover.x - ctx.player.x, cover.z - ctx.player.z) : 0;
    const usefulCover = Boolean(
      cover
      && coverDistance > 0.85
      && coverDistance < 16
      && coverPlayerDistance >= minimum
      && coverPlayerDistance <= weaponRange + 2
    );
    // Once a soldier reaches its assigned fighting position, plant there.
    // This guard must run before the far-distance advance branch; previously an
    // enemy at cover but outside preferred range immediately rushed the player.
    const atCover = Boolean(cover && coverDistance <= 1.75);

    if (distance < minimum) {
      // Hard separation guard: ranged soldiers backpedal instead of crowding.
      intent = "retreat";
      steer.copy(toward).multiplyScalar(-1).addScaledVector(flankDir, 0.3);
    } else if (atCover) {
      if (now >= (enemy.userData.peekUntil || 0)) {
        enemy.userData.peekSide *= -1;
        enemy.userData.peekUntil = now + 0.7 + Math.random() * 1.1;
      }
      const peeking = (enemy.userData.suppression || 0) < 0.42 && now < enemy.userData.peekUntil - 0.28;
      if (peeking) {
        intent = "strafe";
        const tx = enemy.userData.peekSide > 0 ? cover!.peekRightX : cover!.peekLeftX;
        const tz = enemy.userData.peekSide > 0 ? cover!.peekRightZ : cover!.peekLeftZ;
        steer.set(tx - enemy.position.x, 0, tz - enemy.position.z);
      } else {
        intent = "hold";
        steer.set(0, 0, 0);
      }
      wantCover = true;
      // Keep the position long enough to make cover use readable. A later
      // suppression/grenade/wounded state can still force relocation.
      enemy.userData.coverLockUntil = Math.max(
        enemy.userData.coverLockUntil || 0,
        now + 1.25
      );
    } else if (!hasLos) {
      // Reposition to another fighting position; never run straight at the
      // player simply because LOS is blocked.
      if (usefulCover && !atCover) {
        intent = "cover";
        wantCover = true;
        steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
      } else {
        intent = "strafe";
        steer.copy(flankDir);
      }
    } else if (usefulCover && !atCover && distance <= farThreshold + 2) {
      // With LOS, still move into nearby cover before holding in the open.
      intent = "cover";
      wantCover = true;
      steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
    } else if (distance > farThreshold - Math.min(push, 0.75)) {
      // Move cover-to-cover from long range. If no useful cover is available,
      // flank laterally rather than charging down the player's sightline.
      if (usefulCover && !atCover) {
        intent = "cover";
        wantCover = true;
        steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
      } else {
        intent = "strafe";
        steer.copy(flankDir).multiplyScalar(role === "flanker" ? 1 : 0.45);
      }
    } else if (distance < preferred - 1) {
      intent = "retreat";
      steer.copy(toward).multiplyScalar(-0.75).addScaledVector(flankDir, 0.35);
      if (usefulCover && !atCover) {
        intent = "cover";
        wantCover = true;
        steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
      }
    } else {
      // Commit to readable hold/strafe/peek beats instead of changing intent
      // every frame. Offset keeps squad members from moving in lockstep.
      if (now >= (enemy.userData.intentUntil || 0)) {
        const roll = Math.abs(Math.sin(now * 0.73 + tacticalOffset));
        if (usefulCover && !atCover) {
          enemy.userData.aiIntent = "cover";
        } else if ((role === "support" || role === "suppressor") && atCover && roll > 0.55) {
          enemy.userData.aiIntent = "hold";
        } else {
          enemy.userData.aiIntent = roll > 0.5 ? "strafe" : "hold";
        }
        enemy.userData.intentUntil = now + 1.15 + roll * 1.35;
      }
      intent = enemy.userData.aiIntent || "hold";
      if (intent === "cover" && usefulCover && !atCover) {
        wantCover = true;
        steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
      } else if (intent === "strafe") {
        steer.copy(flankDir);
      } else {
        intent = "hold";
      }
    }
  }

  if (steer.lengthSq() >= 0.0001) steer.normalize();

  // Speed modifiers
  let speedMul = 1;
  if (retreating) speedMul = 1.25;
  else if (intent === "retreat") speedMul = 1.6;
  if (suppressed) speedMul = 1.35;
  if (role === "support") speedMul *= 0.9;
  if (push > 0.8) speedMul *= 1.15;
  enemy.userData.aiSpeedMul = speedMul;
  enemy.userData.aiIntent = intent;

  return { steer, wantCover, retreating, suppressed, intent };
}

export function enemyShouldHoldFire(enemy: THREE.Group): boolean {
  const now = performance.now() / 1000;
  return now < (enemy.userData.grenadeReactUntil || 0)
    || now < (enemy.userData.reloadUntil || 0)
    || (enemy.userData.suppression || 0) > 0.72;
}

export function suppressEnemiesNearShot(
  enemies: THREE.Group[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
) {
  for (const enemy of enemies) {
    if (!enemy.userData.alive) continue;
    const toEnemy = enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(origin);
    const along = THREE.MathUtils.clamp(toEnemy.dot(direction), 0, maxDistance);
    const nearest = origin.clone().addScaledVector(direction, along);
    const missDistance = nearest.distanceTo(enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    if (missDistance > 2.2) continue;
    enemy.userData.suppression = Math.min(1, (enemy.userData.suppression || 0) + (2.2 - missDistance) * 0.22);
    if (enemy.userData.suppression > 0.62) {
      enemy.userData.coverTarget = null;
      enemy.userData.coverLockUntil = 0;
    }
  }
}
