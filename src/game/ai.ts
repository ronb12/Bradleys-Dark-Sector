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
      m.userData.coverArrivedAt = 0;
      m.userData.coverLockUntil = 0;
      m.userData.repositionUntil = 0;
      m.userData.retreatUntil = 0;
      m.userData.grenadeReactUntil = 0;
      m.userData.suppression = 0;
      m.userData.magazine = m.userData.enemyType === "Heavy" ? 40 : 24;
      m.userData.magazineSize = m.userData.magazine;
      m.userData.reloadUntil = 0;
      m.userData.nextGrenadeAt = performance.now() / 1000 + 70 + Math.random() * 50;
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
  preferAway = false,
  options?: {
    exclude?: CoverPoint | null;
    preferCloser?: boolean;
    preferFlank?: number;
  }
): CoverPoint | null {
  let best: CoverPoint | null = null;
  let bestScore = -Infinity;
  const exclude = options?.exclude ?? null;
  const preferCloser = Boolean(options?.preferCloser);
  const preferFlank = options?.preferFlank ?? 0;
  const fromPlayerDist = Math.hypot(from.x - player.x, from.z - player.z);
  for (const c of covers) {
    if (exclude && c === exclude) continue;
    if (exclude && Math.hypot(c.x - exclude.x, c.z - exclude.z) < 2.2) continue;
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
    // Advance: bias toward fighting positions that close distance without rushing melee.
    if (preferCloser && toPlayer + 0.6 < fromPlayerDist && toPlayer >= preferredDistance - 1.5) {
      score += 4.2;
    }
    if (preferFlank !== 0) {
      const towardX = player.x - from.x;
      const towardZ = player.z - from.z;
      const flankX = -towardZ * preferFlank;
      const flankZ = towardX * preferFlank;
      const toCoverX = c.x - from.x;
      const toCoverZ = c.z - from.z;
      const flankAlign =
        (toCoverX * flankX + toCoverZ * flankZ)
        / ((Math.hypot(toCoverX, toCoverZ) + 0.001) * (Math.hypot(flankX, flankZ) + 0.001));
      score += flankAlign * 3.4;
    }
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

function coverDwellSeconds(role: AiRole, push: number): number {
  const base =
    role === "assault" ? 1.65
    : role === "flanker" ? 1.15
    : role === "suppressor" ? 2.55
    : 2.15;
  return Math.max(0.55, base - push * 1.05);
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
    if (ctx.now > squad.pushUntil && healthy >= 2 && avgDist < 26 && wounded === 0) {
      squad.pushUntil = ctx.now + 4.5 + Math.random() * 3.5;
      squad.focusX = ctx.player.x;
      squad.focusZ = ctx.player.z;
      for (const m of squad.members) {
        m.userData.pushBias = 1.65;
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
  const push = enemy.userData.pushBias || 0;

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

  // Finite cover dwell — never refresh lock forever while planted (that froze
  // spawn-at-cover soldiers in place for the whole fight).
  const currentCover = enemy.userData.coverTarget as CoverPoint | null;
  const atCurrentCover = Boolean(
    currentCover
    && Math.hypot(currentCover.x - enemy.position.x, currentCover.z - enemy.position.z) <= 1.75
  );
  if (atCurrentCover) {
    if (!enemy.userData.coverArrivedAt) enemy.userData.coverArrivedAt = now;
  } else {
    enemy.userData.coverArrivedAt = 0;
  }
  const dwellExpired =
    atCurrentCover
    && (now - (enemy.userData.coverArrivedAt || now)) >= coverDwellSeconds(role, push);
  const forceAdvance =
    !retreating
    && !suppressed
    && (
      dwellExpired
      || push > 0.85
      || (role === "assault" && distance > preferred + 2.5 && atCurrentCover)
      || (role === "flanker" && atCurrentCover && now >= (enemy.userData.repositionUntil || 0))
    );

  if (forceAdvance) {
    const next = nearestCover(
      enemy.position,
      ctx.player,
      ctx.coverPoints,
      preferred,
      minimum,
      false,
      {
        exclude: currentCover,
        preferCloser: distance > preferred - 0.5 || push > 0.5,
        preferFlank: role === "flanker" || role === "assault" ? flankSign : 0,
      }
    );
    if (next) {
      enemy.userData.coverTarget = next;
      enemy.userData.coverLockUntil = now + 3.2 + Math.random() * 2.2;
      enemy.userData.coverArrivedAt = 0;
      enemy.userData.repositionUntil = now + 2.4 + Math.random() * 1.6;
    } else if (dwellExpired || push > 0.85) {
      // No alternate prop — clear lock so open-field flank/strafe can resume.
      enemy.userData.coverTarget = null;
      enemy.userData.coverLockUntil = 0;
      enemy.userData.coverArrivedAt = 0;
      enemy.userData.repositionUntil = now + 1.8 + Math.random();
    }
  } else if (!enemy.userData.coverTarget || now >= (enemy.userData.coverLockUntil || 0)) {
    const cover = nearestCover(
      enemy.position,
      ctx.player,
      ctx.coverPoints,
      preferred,
      minimum,
      retreating,
      {
        preferCloser: !retreating && distance > preferred + 1,
        preferFlank: role === "flanker" ? flankSign : 0,
      }
    );
    if (cover) {
      enemy.userData.coverTarget = cover;
      enemy.userData.coverLockUntil = now + 3.5 + Math.random() * 2.5;
      enemy.userData.coverArrivedAt = 0;
    }
  }

  const cover = enemy.userData.coverTarget as CoverPoint | null;
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
    // Once a soldier reaches its assigned fighting position, work that prop
    // briefly (peek/hold), then relocate — never plant for the whole fight.
    const atCover = Boolean(cover && coverDistance <= 1.75);

    if (distance < minimum) {
      // Hard separation guard: ranged soldiers backpedal instead of crowding.
      intent = "retreat";
      steer.copy(toward).multiplyScalar(-1).addScaledVector(flankDir, 0.3);
    } else if (usefulCover && !atCover) {
      // Moving to the next fighting position takes priority over open holds.
      intent = "cover";
      wantCover = true;
      steer.set(cover!.x - enemy.position.x, 0, cover!.z - enemy.position.z);
    } else if (atCover) {
      if (now >= (enemy.userData.peekUntil || 0)) {
        enemy.userData.peekSide *= -1;
        enemy.userData.peekUntil = now + 0.55 + Math.random() * 0.85;
      }
      const peeking = (enemy.userData.suppression || 0) < 0.42 && now < enemy.userData.peekUntil - 0.18;
      if (peeking) {
        intent = "strafe";
        const tx = enemy.userData.peekSide > 0 ? cover!.peekRightX : cover!.peekLeftX;
        const tz = enemy.userData.peekSide > 0 ? cover!.peekRightZ : cover!.peekLeftZ;
        steer.set(tx - enemy.position.x, 0, tz - enemy.position.z);
      } else if (role === "flanker" || push > 0.4) {
        // Keep feet moving between peeks so squads don't freeze on sandbags.
        intent = "strafe";
        steer.copy(flankDir).multiplyScalar(0.65);
      } else {
        intent = "hold";
        steer.set(0, 0, 0);
      }
      wantCover = true;
    } else if (!hasLos) {
      // Reposition laterally when LOS is blocked and no useful cover path exists.
      intent = "strafe";
      steer.copy(flankDir).addScaledVector(toward, role === "assault" ? 0.35 : 0.15);
    } else if (distance > farThreshold - Math.min(push, 0.75)) {
      // Long range: flank/advance rather than freeze in the open.
      intent = push > 0.5 || role === "assault" ? "advance" : "strafe";
      steer
        .copy(flankDir)
        .multiplyScalar(role === "flanker" ? 1 : 0.55)
        .addScaledVector(toward, role === "assault" || push > 0.5 ? 0.55 : 0.2);
    } else if (distance < preferred - 1) {
      intent = "retreat";
      steer.copy(toward).multiplyScalar(-0.75).addScaledVector(flankDir, 0.35);
    } else {
      // Preferred band: mostly strafe/advance beats; hold is brief and rare.
      if (now >= (enemy.userData.intentUntil || 0)) {
        const roll = Math.abs(Math.sin(now * 0.73 + tacticalOffset));
        if ((role === "support" || role === "suppressor") && roll > 0.72) {
          enemy.userData.aiIntent = "hold";
        } else if (role === "assault" && roll > 0.45) {
          enemy.userData.aiIntent = "advance";
        } else {
          enemy.userData.aiIntent = "strafe";
        }
        enemy.userData.intentUntil = now + 0.85 + roll * 0.95;
      }
      intent = enemy.userData.aiIntent || "strafe";
      if (intent === "advance") {
        steer.copy(toward).multiplyScalar(0.4).addScaledVector(flankDir, 0.75);
      } else if (intent === "strafe") {
        steer.copy(flankDir).addScaledVector(toward, 0.12);
      } else {
        intent = "hold";
      }
    }
  }

  if (steer.lengthSq() >= 0.0001) steer.normalize();

  // Speed modifiers — keep relocation snappy; plants happen in the movement loop.
  let speedMul = 1;
  if (retreating) speedMul = 1.35;
  else if (intent === "retreat") speedMul = 1.7;
  else if (intent === "advance") speedMul = 1.35;
  else if (intent === "cover") speedMul = 1.25;
  else if (intent === "strafe") speedMul = 1.08;
  if (suppressed) speedMul = Math.max(speedMul, 1.4);
  if (role === "support") speedMul *= 0.92;
  if (role === "flanker" && (intent === "advance" || intent === "strafe" || intent === "cover")) {
    speedMul *= 1.08;
  }
  if (push > 0.8) speedMul *= 1.18;
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

/**
 * Kneel-and-shoot stance: brief plant while firing / cover-hold beats.
 * Cleared before relocate/advance/flank so hostiles stand before sprinting.
 */
export function updateEnemyKneelStance(
  enemy: THREE.Group,
  opts: {
    now: number;
    dt: number;
    distance: number;
    fireHolding: boolean;
    relocating: boolean;
    intent: AiSteerResult["intent"];
    wantCover: boolean;
    fireHoldUntil: number;
  },
): { kneeling: boolean; kneelBlend: number; planted: boolean } {
  const role = (enemy.userData.aiRole as AiRole) || "assault";
  // Stand when relocating (or suppressed) — blend-out still plants feet briefly.
  const mustStand =
    opts.relocating
    || opts.intent === "advance"
    || opts.intent === "retreat"
    || (opts.intent === "cover" && !opts.fireHolding)
    || (enemy.userData.suppression || 0) > 0.62
    || opts.now < (enemy.userData.grenadeReactUntil || 0);

  if (mustStand) {
    enemy.userData.kneelUntil = 0;
  } else if (
    opts.now >= (enemy.userData.kneelUntil || 0)
    && opts.distance >= 6.2
    && opts.distance <= 15.5
  ) {
    const midRange = opts.distance >= 7 && opts.distance <= 13.5;
    const coverHold = opts.wantCover && opts.intent === "hold";
    const canEnter = opts.fireHolding || coverHold;
    const roll = Math.abs(Math.sin(opts.now * 1.17 + (enemy.userData.tacticalOffset || 0)));
    if (canEnter && midRange && (coverHold || opts.fireHolding)) {
      // Suppressors/supports kneel most fire-holds; assault sometimes; flankers rarely.
      const takeKneel =
        coverHold
        || role === "suppressor"
        || role === "support"
        || (role === "assault" && roll < 0.58)
        || (role === "flanker" && roll < 0.28);
      if (takeKneel) {
        const holdEnd = opts.fireHolding
          ? Math.max(opts.fireHoldUntil, opts.now + 0.55)
          : opts.now + 0.7 + Math.random() * 0.3;
        enemy.userData.kneelUntil = holdEnd;
        // Nudge plant window enough to read the kneel without freezing relocates.
        enemy.userData.fireHoldUntil = Math.max(
          enemy.userData.fireHoldUntil || 0,
          Math.min(holdEnd, opts.now + 0.5),
        );
      }
    }
  } else if (opts.fireHolding && opts.now < (enemy.userData.kneelUntil || 0)) {
    // Keep kneel aligned with the active fire-hold window.
    enemy.userData.kneelUntil = Math.max(enemy.userData.kneelUntil || 0, opts.fireHoldUntil);
  }

  const kneeling = opts.now < (enemy.userData.kneelUntil || 0);
  const kneelBlend = THREE.MathUtils.damp(
    enemy.userData.kneelBlend || 0,
    kneeling ? 1 : 0,
    kneeling ? 11 : 9,
    opts.dt,
  );
  enemy.userData.kneelBlend = kneelBlend;
  enemy.userData.kneeling = kneeling;
  // Plant while kneeling or still rising — prevents moonwalk on the blend-out.
  const planted = kneeling || kneelBlend > 0.35;
  return { kneeling, kneelBlend, planted };
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
