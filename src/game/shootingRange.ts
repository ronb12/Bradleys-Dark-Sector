/**
 * Shooting Range — practice bay with pop-up / plate / moving targets,
 * hit scoring, timed challenge, qualification badges, and auto-refill magazines.
 */

import * as THREE from "three";
import { populateShootingRangeWithEnvironmentAssets } from "./envAssets";

export const RANGE_WORLD_ORIGIN = new THREE.Vector3(200, 0, 0);
export const RANGE_BEST_SCORE_KEY = "bds-range-best-30s";
export const RANGE_BEST_BADGE_KEY = "bds-range-best-badge";
export const RANGE_UNLOCKED_BADGES_KEY = "bds-range-unlocked-badges";
export const RANGE_CHALLENGE_SECONDS = 30;

export type RangeTargetKind = "silhouette" | "plate" | "popup" | "moving";

/** Qualification tiers — Unqualified is fail (below Marksman). */
export type RangeBadgeId = "unqualified" | "marksman" | "sharpshooter" | "expert";

export const RANGE_BADGE_ORDER: RangeBadgeId[] = ["unqualified", "marksman", "sharpshooter", "expert"];

export const RANGE_BADGE_THRESHOLDS: Record<
  Exclude<RangeBadgeId, "unqualified">,
  { minScore: number; minAccuracy: number; label: string }
> = {
  marksman: { minScore: 300, minAccuracy: 50, label: "Marksman" },
  sharpshooter: { minScore: 500, minAccuracy: 65, label: "Sharpshooter" },
  expert: { minScore: 700, minAccuracy: 80, label: "Expert" },
};

/** XP awarded the first time each badge is unlocked. */
export const RANGE_BADGE_XP: Record<Exclude<RangeBadgeId, "unqualified">, number> = {
  marksman: 50,
  sharpshooter: 100,
  expert: 200,
};

export type RangeHitResult = {
  hit: boolean;
  distance: number;
  point: THREE.Vector3;
  score: number;
  targetId: string;
  kind: RangeTargetKind;
};

export type RangeChallengeResult = {
  passed: boolean;
  badge: RangeBadgeId;
  score: number;
  accuracy: number;
  hits: number;
  misses: number;
  shots: number;
  bestScore: number;
  highestBadge: RangeBadgeId;
  unlockedBadges: Exclude<RangeBadgeId, "unqualified">[];
  /** Badges newly unlocked on this attempt (for XP / toast). */
  newlyUnlocked: Exclude<RangeBadgeId, "unqualified">[];
  endedAt: number;
};

export type RangeStats = {
  hits: number;
  misses: number;
  shots: number;
  score: number;
  accuracy: number;
  challengeActive: boolean;
  challengeTimeLeft: number;
  challengeScore: number;
  challengeHits: number;
  challengeMisses: number;
  challengeShots: number;
  challengeAccuracy: number;
  bestChallengeScore: number;
  highestBadge: RangeBadgeId;
  unlockedBadges: Exclude<RangeBadgeId, "unqualified">[];
  lastResult: RangeChallengeResult | null;
  lastHitDistance: number;
};

type InternalTarget = {
  id: string;
  kind: RangeTargetKind;
  distanceMeters: number;
  root: THREE.Group;
  hitMesh: THREE.Mesh;
  faceMat: THREE.MeshStandardMaterial;
  stateMat: THREE.MeshStandardMaterial;
  baseColor: number;
  impactGroup: THREE.Group;
  impactMarks: THREE.Mesh[];
  hitFlash: number;
  visualState: "ready" | "inactive" | "hit";
  upright: boolean;
  knocked: boolean;
  resetIn: number;
  scoreValue: number;
  popupPhase: number;
  popupPeriod: number;
  moveMin: number;
  moveMax: number;
  moveSpeed: number;
  moveDir: number;
  baseLocalX: number;
  baseLocalY: number;
  baseLocalZ: number;
};

export type ShootingRangeSession = {
  root: THREE.Group;
  colliders: THREE.Box3[];
  stats: RangeStats;
  spawnLocal: THREE.Vector3;
  spawnWorld: THREE.Vector3;
  lookYaw: number;
  refillWorld: THREE.Vector3;
  update: (dt: number) => void;
  tryHit: (origin: THREE.Vector3, dir: THREE.Vector3) => RangeHitResult | null;
  registerMiss: () => void;
  startChallenge: () => void;
  endChallenge: () => RangeChallengeResult;
  clearLastResult: () => void;
  refillWeapons: () => { m4: number; pistol: number };
  nearRefill: (playerWorld: THREE.Vector3) => boolean;
  dispose: (scene: THREE.Scene) => void;
};

export function badgeRank(badge: RangeBadgeId): number {
  return RANGE_BADGE_ORDER.indexOf(badge);
}

export function badgeLabel(badge: RangeBadgeId): string {
  if (badge === "unqualified") return "Unqualified";
  return RANGE_BADGE_THRESHOLDS[badge].label;
}

export function evaluateRangeBadge(score: number, accuracyPercent: number): RangeBadgeId {
  const s = Math.floor(score);
  const a = accuracyPercent;
  if (s >= RANGE_BADGE_THRESHOLDS.expert.minScore && a >= RANGE_BADGE_THRESHOLDS.expert.minAccuracy) {
    return "expert";
  }
  if (s >= RANGE_BADGE_THRESHOLDS.sharpshooter.minScore && a >= RANGE_BADGE_THRESHOLDS.sharpshooter.minAccuracy) {
    return "sharpshooter";
  }
  if (s >= RANGE_BADGE_THRESHOLDS.marksman.minScore && a >= RANGE_BADGE_THRESHOLDS.marksman.minAccuracy) {
    return "marksman";
  }
  return "unqualified";
}

export function loadBestChallengeScore(): number {
  try {
    const raw = localStorage.getItem(RANGE_BEST_SCORE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveBestChallengeScore(score: number): number {
  const prev = loadBestChallengeScore();
  const next = Math.max(prev, Math.floor(score));
  try {
    localStorage.setItem(RANGE_BEST_SCORE_KEY, String(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

function parseBadgeId(raw: string | null): RangeBadgeId | null {
  if (!raw) return null;
  if (raw === "unqualified" || raw === "marksman" || raw === "sharpshooter" || raw === "expert") return raw;
  return null;
}

export function loadHighestBadge(): RangeBadgeId {
  try {
    const parsed = parseBadgeId(localStorage.getItem(RANGE_BEST_BADGE_KEY));
    return parsed ?? "unqualified";
  } catch {
    return "unqualified";
  }
}

export function saveHighestBadge(badge: RangeBadgeId): RangeBadgeId {
  const prev = loadHighestBadge();
  const next = badgeRank(badge) > badgeRank(prev) ? badge : prev;
  try {
    localStorage.setItem(RANGE_BEST_BADGE_KEY, next);
  } catch {
    // ignore
  }
  return next;
}

export function loadUnlockedBadges(): Exclude<RangeBadgeId, "unqualified">[] {
  try {
    const raw = localStorage.getItem(RANGE_UNLOCKED_BADGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is Exclude<RangeBadgeId, "unqualified"> =>
        id === "marksman" || id === "sharpshooter" || id === "expert"
    );
  } catch {
    return [];
  }
}

export function saveUnlockedBadges(badges: Exclude<RangeBadgeId, "unqualified">[]): void {
  try {
    localStorage.setItem(RANGE_UNLOCKED_BADGES_KEY, JSON.stringify(badges));
  } catch {
    // ignore
  }
}

/** Persist score + badge unlocks from a finished challenge attempt. */
export function persistChallengeQualification(
  score: number,
  badge: RangeBadgeId
): {
  bestScore: number;
  highestBadge: RangeBadgeId;
  unlockedBadges: Exclude<RangeBadgeId, "unqualified">[];
  newlyUnlocked: Exclude<RangeBadgeId, "unqualified">[];
} {
  const bestScore = saveBestChallengeScore(score);
  const highestBadge = saveHighestBadge(badge);
  const unlocked = [...loadUnlockedBadges()];
  const newlyUnlocked: Exclude<RangeBadgeId, "unqualified">[] = [];
  if (badge !== "unqualified") {
    // Unlock this badge and any lower tiers (ladder).
    const earnedRank = badgeRank(badge);
    for (const id of ["marksman", "sharpshooter", "expert"] as const) {
      if (badgeRank(id) <= earnedRank && !unlocked.includes(id)) {
        unlocked.push(id);
        newlyUnlocked.push(id);
      }
    }
    if (newlyUnlocked.length) saveUnlockedBadges(unlocked);
  }
  return { bestScore, highestBadge, unlockedBadges: unlocked, newlyUnlocked };
}

function mat(color: number, roughness = 0.85, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addCollider(colliders: THREE.Box3[], obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(obj));
}

function makeDistanceMarker(meters: number): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), mat(0x3a4038, 0.7, 0.35));
  post.position.y = 0.55;
  g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.06), mat(0xc9a227, 0.65, 0.15));
  board.position.set(0, 1.05, 0);
  g.add(board);
  // Painted hash marks read as distance without canvas text
  const hash = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.08, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x1a1c18, roughness: 0.9, metalness: 0.05 })
  );
  hash.position.set(0, 1.05, 0.04);
  g.add(hash);
  const stripeCount = meters >= 75 ? 4 : meters >= 50 ? 3 : meters >= 25 ? 2 : 1;
  for (let i = 0; i < stripeCount; i += 1) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x1a1c18, roughness: 0.9, metalness: 0.05 })
    );
    s.position.set(-0.22 + i * 0.22, 1.05, 0.04);
    g.add(s);
  }
  g.userData.distanceMeters = meters;
  return g;
}

function makeTextSign(
  text: string,
  width: number,
  height: number,
  background = "#d2bd72",
  foreground = "#171a16"
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = foreground;
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = foreground;
    ctx.font = "900 58px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  );
  sign.userData.canvasTexture = texture;
  return sign;
}

function makeSandbagLine(width: number): THREE.Group {
  const g = new THREE.Group();
  const bagMat = mat(0xb8a878, 0.95, 0.02);
  const cols = Math.max(3, Math.floor(width / 0.65));
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.4), bagMat);
      bag.position.set((c - (cols - 1) / 2) * 0.65 + (r % 2) * 0.18, 0.16 + r * 0.28, 0);
      bag.castShadow = true;
      bag.receiveShadow = true;
      g.add(bag);
    }
  }
  return g;
}

function tagTargetMesh(mesh: THREE.Mesh, id: string) {
  mesh.userData.target = true;
  mesh.userData.targetId = id;
  mesh.castShadow = true;
}

function makeSilhouettePlate(
  kind: RangeTargetKind,
  id: string
): {
  root: THREE.Group;
  hitMesh: THREE.Mesh;
  faceMat: THREE.MeshStandardMaterial;
  stateMat: THREE.MeshStandardMaterial;
  impactGroup: THREE.Group;
} {
  const root = new THREE.Group();
  root.name = `RangeTarget:${id}`;

  const standMat = mat(0x3c413b, 0.62, 0.5);
  const footMat = mat(0x252a27, 0.72, 0.42);
  const frameWidth = kind === "plate" ? 0.74 : 1.02;
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.65, 0.065), standMat);
    upright.position.set(side * frameWidth * 0.5, 0.92, -0.055);
    upright.castShadow = true;
    root.add(upright);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.65), footMat);
    foot.position.set(side * frameWidth * 0.5, 0.04, 0);
    foot.castShadow = true;
    root.add(foot);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(frameWidth + 0.12, 0.065, 0.07), standMat);
  crossbar.position.set(0, kind === "plate" ? 1.75 : 2.2, -0.055);
  root.add(crossbar);
  const lowerBrace = new THREE.Mesh(new THREE.BoxGeometry(frameWidth + 0.08, 0.06, 0.065), standMat);
  lowerBrace.position.set(0, 0.48, -0.055);
  root.add(lowerBrace);

  const faceMat = new THREE.MeshStandardMaterial({
    color: kind === "plate" ? 0xd7d1b8 : 0x20231f,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: kind === "plate" ? 0.58 : 0.92,
    metalness: kind === "plate" ? 0.58 : 0.03,
  });
  const stateMat = new THREE.MeshStandardMaterial({
    color: 0x9bb56a,
    roughness: 0.72,
    metalness: 0.12,
  });

  let hitMesh: THREE.Mesh;
  if (kind === "plate") {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.075, 24), mat(0x6e4a2d, 0.62, 0.6));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.48;
    rim.castShadow = true;
    root.add(rim);
    hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.085, 24), faceMat);
    hitMesh.rotation.x = Math.PI / 2;
    hitMesh.position.set(0, 1.48, 0.025);
    for (const radius of [0.1, 0.205]) {
      const scoringRing = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.008, radius, 24),
        new THREE.MeshBasicMaterial({ color: 0x4c4a40, side: THREE.DoubleSide })
      );
      scoringRing.position.set(0, 1.48, 0.074);
      root.add(scoringRing);
    }
  } else {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.54, 0.025),
      mat(0xc8c2a7, 0.97, 0)
    );
    paper.position.set(0, 1.42, -0.015);
    paper.receiveShadow = true;
    root.add(paper);

    // The visible silhouette is assembled from individually raycastable pieces,
    // so every successful hit corresponds to actual target artwork.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.82, 0.045), faceMat);
    torso.position.set(0, 1.35, 0.025);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.046), faceMat);
    shoulders.position.set(0, 1.66, 0.026);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.25, 0.046), faceMat);
    pelvis.position.set(0, 0.88, 0.026);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.165, 20), faceMat);
    head.position.set(0, 1.98, 0.03);
    hitMesh = torso;
    [torso, shoulders, pelvis, head].forEach((piece) => tagTargetMesh(piece, id));
    root.add(torso, shoulders, pelvis, head);

    for (const [radius, color] of [
      [0.16, 0xd8cfad],
      [0.105, 0x9a3828],
      [0.048, 0xd8cfad],
    ] as const) {
      const bull = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.012, radius, 20),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      bull.position.set(0, 1.38, 0.052);
      root.add(bull);
    }
  }

  tagTargetMesh(hitMesh, id);
  if (kind === "plate") root.add(hitMesh);

  const stateFlag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.035), stateMat);
  stateFlag.position.set(frameWidth * 0.5, 0.34, 0.035);
  root.add(stateFlag);

  const impactGroup = new THREE.Group();
  impactGroup.name = `TargetImpacts:${id}`;
  root.add(impactGroup);

  return { root, hitMesh, faceMat, stateMat, impactGroup };
}

function buildRangeGeometry(root: THREE.Group, colliders: THREE.Box3[]) {
  const concrete = mat(0x6a6558, 0.94, 0.03);
  const dark = mat(0x2e322c, 0.9, 0.05);
  const berm = mat(0x7a6a48, 0.96, 0.02);
  const bermDark = mat(0x5c5138, 0.97, 0.02);
  const metal = mat(0x555850, 0.55, 0.55);
  const paint = mat(0xc9a227, 0.65, 0.2);
  const asphalt = mat(0x1c2022, 0.96, 0.02);
  const safetyWhite = mat(0xd4d1bc, 0.82, 0.05);
  const laneRubber = mat(0x171a18, 0.92, 0.03);
  const rust = mat(0x6e4a2d, 0.7, 0.45);

  // Expanded bay: ~36m wide × ~90m deep with a 75m qualification line.
  const halfW = 17.5;
  const floorLen = 92;
  const floorZ = -38;
  const backZ = -82;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 4, floorLen), asphalt);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, floorZ);
  floor.receiveShadow = true;
  root.add(floor);

  // Terraced side berms — double thickness reads as a real containment wall.
  for (const side of [-1, 1]) {
    const outer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.4, floorLen - 4), berm);
    outer.position.set(side * (halfW + 0.6), 2.6, floorZ);
    outer.castShadow = true;
    outer.receiveShadow = true;
    root.add(outer);
    addCollider(colliders, outer);

    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.4, floorLen - 8), bermDark);
    mid.position.set(side * (halfW - 0.85), 1.65, floorZ + 1);
    mid.receiveShadow = true;
    root.add(mid);

    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, floorLen - 10), concrete);
    toe.position.set(side * (halfW - 1.55), 0.26, floorZ + 1);
    toe.receiveShadow = true;
    root.add(toe);

    for (let z = 4; z >= backZ + 4; z -= 6) {
      const fencePost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), metal);
      fencePost.position.set(side * (halfW - 1.35), 1.85, z);
      root.add(fencePost);
      if (z < 0) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 5.6), dark);
        rail.position.set(side * (halfW - 1.4), 1.45, z - 2.8);
        root.add(rail);
      }
    }
  }

  // Deep earthen backstop + sacrificial face + overhead baffles.
  const backstop = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 6, 8.2, 4.2), berm);
  backstop.position.set(0, 3.9, backZ);
  backstop.castShadow = true;
  root.add(backstop);
  addCollider(colliders, backstop);

  const backFace = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 2, 6.4, 0.4), dark);
  backFace.position.set(0, 3.2, backZ + 1.85);
  backFace.receiveShadow = true;
  root.add(backFace);
  const backstopCap = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 4, 0.55, 6.2), berm);
  backstopCap.position.set(0, 7.5, backZ - 0.4);
  backstopCap.rotation.x = -0.1;
  root.add(backstopCap);
  for (let i = -3; i <= 3; i += 1) {
    const absorber = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.24, 1.25), metal);
    absorber.position.set(i * 5.1, 5.8, backZ + 2.35);
    absorber.rotation.x = -0.45;
    root.add(absorber);
  }

  // Dual overhead shade / ricochet baffles over the firing line.
  for (const [z, w] of [
    [2.2, 32],
    [-2.5, 28],
  ] as const) {
    const baffle = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 5.2), metal);
    baffle.position.set(0, 3.85, z);
    baffle.castShadow = true;
    root.add(baffle);
    const liner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.08, 4.8), laneRubber);
    liner.position.set(0, 3.66, z);
    root.add(liner);
  }
  for (const x of [-14, -7, 0, 7, 14]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 3.9, 8), metal);
    post.position.set(x, 1.95, 2.2);
    root.add(post);
  }

  // Wide concrete firing deck + ready area.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 7.2), concrete);
  platform.position.set(0, 0.1, 3.8);
  platform.receiveShadow = true;
  root.add(platform);
  const readyPad = new THREE.Mesh(new THREE.BoxGeometry(30, 0.12, 3.4), asphalt);
  readyPad.position.set(0, 0.08, 8.2);
  readyPad.receiveShadow = true;
  root.add(readyPad);

  // Six firing stalls with benches, sandbags, and lane paint.
  const laneCenters = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
  for (let index = 0; index < laneCenters.length; index += 1) {
    const x = laneCenters[index];
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.78, 0.78), laneRubber);
    bench.position.set(x, 0.56, 2.15);
    bench.castShadow = true;
    root.add(bench);
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.12, 0.95), metal);
    benchTop.position.set(x, 1.0, 2.15);
    root.add(benchTop);
    const bags = makeSandbagLine(2.1);
    bags.position.set(x, 0, 0.78);
    root.add(bags);

    const laneNumber = makeTextSign(`LANE 0${index + 1}`, 1.75, 0.48, "#d0c58f", "#1d211c");
    laneNumber.position.set(x, 3.05, 5.35);
    root.add(laneNumber);

    for (let z = -1; z >= -78; z -= 2.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 1.35), safetyWhite);
      dash.position.set(x, 0.055, z);
      root.add(dash);
    }
  }
  for (const x of [-10, -5, 0, 5, 10]) {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 3.4), metal);
    divider.position.set(x, 1.48, 2.45);
    root.add(divider);
    const dividerInset = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.32, 2.9), laneRubber);
    dividerInset.position.set(x, 1.48, 2.42);
    root.add(dividerInset);
  }

  const fireLine = new THREE.Mesh(new THREE.BoxGeometry(30, 0.04, 0.24), paint);
  fireLine.position.set(0, 0.22, 1.2);
  root.add(fireLine);
  const readyLine = new THREE.Mesh(new THREE.BoxGeometry(30, 0.035, 0.1), safetyWhite);
  readyLine.position.set(0, 0.2, 5.35);
  root.add(readyLine);
  for (const x of laneCenters) {
    const toeMark = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.045, 0.55), paint);
    toeMark.position.set(x, 0.22, 1.58);
    root.add(toeMark);
  }

  // Distance markers: 10 / 25 / 50 / 75
  for (const dist of [10, 25, 50, 75]) {
    for (const side of [-1, 1]) {
      const marker = makeDistanceMarker(dist);
      marker.position.set(side * (halfW - 2.2), 0, -dist);
      root.add(marker);
      const distanceSign = makeTextSign(`${dist} M`, 1.15, 0.44, "#d2bd72", "#171a16");
      distanceSign.position.set(side * (halfW - 2.1), 1.68, -dist + 0.05);
      distanceSign.rotation.y = side < 0 ? 0.14 : -0.14;
      root.add(distanceSign);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 - 2, 0.03, 0.14), paint);
    stripe.position.set(0, 0.04, -dist);
    root.add(stripe);
    // Mid-lane yard boards for long-distance readability
    if (dist >= 50) {
      const board = makeTextSign(`${dist}M LINE`, 2.4, 0.5, "#2b332c", "#d8cf9a");
      board.position.set(0, 2.15, -dist + 0.4);
      root.add(board);
    }
  }

  // Range control booth (larger) + ammo shed
  const booth = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.9, 3.4), concrete);
  booth.position.set(-13.5, 1.45, 8.4);
  booth.castShadow = true;
  root.add(booth);
  addCollider(colliders, booth);
  const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.18, 3.9), metal);
  boothRoof.position.set(-13.5, 3.0, 8.4);
  root.add(boothRoof);
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.05, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xb8d8c8,
      emissive: 0x3a6a58,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.08,
    })
  );
  window.position.set(-13.5, 1.7, 6.65);
  root.add(window);
  const boothSign = makeTextSign("RANGE CONTROL", 3.1, 0.58, "#2b332c", "#d8cf9a");
  boothSign.position.set(-13.5, 2.55, 6.64);
  root.add(boothSign);

  // Observation / scoring desk opposite the booth
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 1.4), concrete);
  desk.position.set(13.2, 0.55, 7.8);
  desk.castShadow = true;
  root.add(desk);
  addCollider(colliders, desk);
  const deskSign = makeTextSign("SCORING", 2.2, 0.45, "#d0c58f", "#1d211c");
  deskSign.position.set(13.2, 1.55, 7.05);
  root.add(deskSign);

  // Ammo refill crate
  const crate = new THREE.Group();
  crate.name = "RangeRefill";
  const crateBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.82, 0.9), mat(0x8a6a38, 0.88, 0.05));
  crateBody.position.y = 0.42;
  crateBody.castShadow = true;
  crate.add(crateBody);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.94), metal);
  band.position.y = 0.42;
  crate.add(band);
  const stencil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.04), paint);
  stencil.position.set(0, 0.55, 0.48);
  crate.add(stencil);
  const glow = new THREE.PointLight(0xc9a227, 0.95, 6, 2);
  glow.position.set(0, 1.2, 0);
  crate.add(glow);
  crate.position.set(5.8, 0, 6.4);
  crate.userData.refill = true;
  root.add(crate);
  addCollider(colliders, crate);

  // Steel plate rack dressing near 25m (non-hittable props)
  for (const x of [-14, 14]) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 3.2), rust);
    rack.position.set(x, 1.2, -24);
    root.add(rack);
    for (let i = 0; i < 3; i += 1) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), rust);
      plate.rotation.x = Math.PI / 2;
      plate.position.set(x + (x < 0 ? 0.35 : -0.35), 0.7 + i * 0.55, -23.2 + i * 0.15);
      root.add(plate);
    }
  }

  // Wind sock poles for long-range atmosphere
  for (const [wx, wz] of [
    [-15.5, -40],
    [15.5, -40],
    [-15.5, -70],
    [15.5, -70],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), metal);
    pole.position.set(wx, 2.1, wz);
    root.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.1, 6, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, side: THREE.DoubleSide, roughness: 0.85 })
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(wx + 0.55, 3.85, wz);
    root.add(sock);
  }

  // Flood lights — fixtures on every mast, alternate real SpotLights for cost.
  let lightIndex = 0;
  for (const [lx, lz] of [
    [-14, 5],
    [14, 5],
    [-14, -18],
    [14, -18],
    [-14, -42],
    [14, -42],
    [-14, -68],
    [14, -68],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 6.2, 8), metal);
    pole.position.set(lx, 3.1, lz);
    root.add(pole);
    const lamp = new THREE.SpotLight(0xfff0d0, 34, 55, Math.PI / 4.8, 0.45, 1);
    lamp.position.set(lx, 6.0, lz);
    lamp.target.position.set(0, 0, lz - 10);
    root.add(lamp);
    root.add(lamp.target);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.6), metal);
    housing.position.set(lx, 6.05, lz);
    root.add(housing);
    if (lightIndex % 2 === 1) {
      root.remove(lamp);
      root.remove(lamp.target);
      lamp.dispose();
    }
    lightIndex += 1;
  }

  const fill = new THREE.HemisphereLight(0xd8e0c8, 0x3c3428, 0.62);
  fill.position.set(0, 8, -30);
  root.add(fill);

  const sign = makeTextSign("LIVE FIRE RANGE · 75M", 4.6, 0.95, "#c7ab45", "#191b17");
  sign.position.set(0, 2.65, 6.55);
  root.add(sign);
  const clearSign = makeTextSign("EYE + EAR PROTECTION REQUIRED", 3.6, 0.55, "#d7d1b8", "#252923");
  clearSign.position.set(10.5, 2.55, 6.5);
  root.add(clearSign);
  const liveLampMat = new THREE.MeshStandardMaterial({
    color: 0x7a1914,
    emissive: 0x7a1914,
    emissiveIntensity: 0.32,
    roughness: 0.48,
    metalness: 0.15,
  });
  const liveLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), liveLampMat);
  liveLamp.position.set(-2.6, 2.65, 6.48);
  root.add(liveLamp);
  const hotSign = makeTextSign("HOT RANGE", 1.8, 0.42, "#7a1914", "#f0e6c8");
  hotSign.position.set(-4.6, 2.65, 6.5);
  root.add(hotSign);

  return { refillLocal: new THREE.Vector3(5.8, 0, 6.4), laneCenters };
}

function createTarget(
  id: string,
  kind: RangeTargetKind,
  localX: number,
  localZ: number,
  scoreValue: number,
  opts?: { popupPeriod?: number; moveMin?: number; moveMax?: number; moveSpeed?: number }
): InternalTarget {
  const built = makeSilhouettePlate(kind === "moving" ? "silhouette" : kind === "popup" ? "silhouette" : kind, id);
  built.root.position.set(localX, 0, localZ);
  const distanceMeters = Math.round(Math.abs(localZ));
  const targetScale = distanceMeters >= 75 ? 0.82 : distanceMeters >= 50 ? 0.9 : distanceMeters <= 10 ? 1.06 : 1;
  built.root.scale.setScalar(targetScale);
  return {
    id,
    kind,
    distanceMeters,
    root: built.root,
    hitMesh: built.hitMesh,
    faceMat: built.faceMat,
    stateMat: built.stateMat,
    baseColor: built.faceMat.color.getHex(),
    impactGroup: built.impactGroup,
    impactMarks: [],
    hitFlash: 0,
    visualState: "ready",
    upright: true,
    knocked: false,
    resetIn: 0,
    scoreValue,
    popupPhase: Math.random() * Math.PI * 2,
    popupPeriod: opts?.popupPeriod ?? 3.2,
    moveMin: opts?.moveMin ?? localX - 2.2,
    moveMax: opts?.moveMax ?? localX + 2.2,
    moveSpeed: opts?.moveSpeed ?? 2.4,
    moveDir: Math.random() < 0.5 ? -1 : 1,
    baseLocalX: localX,
    baseLocalY: 0,
    baseLocalZ: localZ,
  };
}

function setTargetVisualState(target: InternalTarget, state: InternalTarget["visualState"]) {
  target.visualState = state;
  target.faceMat.emissive.setHex(0x000000);
  target.faceMat.emissiveIntensity = 0;
  if (target.hitFlash > 0) {
    target.faceMat.color.setHex(0xb74a2d);
    target.faceMat.emissive.setHex(0x5a160c);
    target.faceMat.emissiveIntensity = 0.34;
    target.stateMat.color.setHex(0xd5b148);
  } else if (state === "hit") {
    target.faceMat.color.setHex(0x5b5145);
    target.stateMat.color.setHex(0x8c2720);
  } else if (state === "inactive") {
    target.faceMat.color.setHex(0x69665a);
    target.stateMat.color.setHex(0xc38a35);
  } else {
    target.faceMat.color.setHex(target.baseColor);
    target.stateMat.color.setHex(0x9bb56a);
  }
}

function addImpactMark(target: InternalTarget, worldPoint: THREE.Vector3) {
  const local = target.root.worldToLocal(worldPoint.clone());
  const mark = new THREE.Mesh(
    new THREE.RingGeometry(0.014, 0.032, 10),
    new THREE.MeshBasicMaterial({
      color: 0x171411,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  mark.position.copy(local);
  mark.position.z += 0.055;
  mark.renderOrder = 2;
  target.impactGroup.add(mark);
  target.impactMarks.push(mark);
  while (target.impactMarks.length > 8) {
    const oldest = target.impactMarks.shift();
    if (!oldest) break;
    target.impactGroup.remove(oldest);
    oldest.geometry.dispose();
    if (oldest.material instanceof THREE.Material) oldest.material.dispose();
  }
}

function knockTarget(target: InternalTarget) {
  target.knocked = true;
  target.upright = false;
  target.resetIn = target.kind === "popup" ? 1.6 : 2.4;
  target.hitFlash = 0.12;
  setTargetVisualState(target, "hit");
  // Fall backward (away from shooter / +local toward backstop is -Z, fall rotates over +X)
  target.root.rotation.x = -1.15;
}

function resetTarget(target: InternalTarget) {
  target.knocked = false;
  target.upright = true;
  target.resetIn = 0;
  target.root.rotation.x = 0;
  target.root.position.y = target.baseLocalY;
  if (target.kind !== "moving") {
    target.root.position.x = target.baseLocalX;
  }
  setTargetVisualState(target, "ready");
}

export function createShootingRange(scene: THREE.Scene): ShootingRangeSession {
  const root = new THREE.Group();
  root.name = "ShootingRange";
  root.position.copy(RANGE_WORLD_ORIGIN);

  const colliders: THREE.Box3[] = [];
  const { refillLocal } = buildRangeGeometry(root, colliders);

  const targets: InternalTarget[] = [];

  // Static silhouettes / plates across 10 · 25 · 50 · 75m (keep s10 near -2 for QA aim).
  const staticLayout: Array<[string, RangeTargetKind, number, number, number]> = [
    ["s10a", "silhouette", -12.5, -10, 10],
    ["s10b", "silhouette", -7.5, -10, 10],
    ["s10c", "silhouette", -2, -10, 10],
    ["s10d", "silhouette", 2.5, -10, 10],
    ["p10a", "plate", 7.5, -10, 15],
    ["p10b", "plate", 12.5, -10, 15],
    ["s25a", "silhouette", -12.5, -25, 25],
    ["s25b", "silhouette", -7.5, -25, 25],
    ["s25c", "silhouette", -2, -25, 25],
    ["p25a", "plate", 2.5, -25, 35],
    ["p25b", "plate", 7.5, -25, 35],
    ["s25d", "silhouette", 12.5, -25, 25],
    ["s50a", "silhouette", -10, -50, 50],
    ["s50b", "silhouette", -5, -50, 50],
    ["p50a", "plate", 0, -50, 60],
    ["s50c", "silhouette", 5, -50, 50],
    ["p50b", "plate", 10, -50, 60],
    ["s75a", "silhouette", -7.5, -75, 80],
    ["p75a", "plate", 0, -75, 95],
    ["s75b", "silhouette", 7.5, -75, 80],
  ];
  for (const [id, kind, x, z, score] of staticLayout) {
    const t = createTarget(id, kind, x, z, score);
    targets.push(t);
    root.add(t.root);
  }

  // Pop-up pits at mid and long range
  const popupDefs: Array<[string, number, number, number, number]> = [
    ["pop25a", -2.5, -25, 45, 2.6],
    ["pop25b", 2.5, -25, 45, 3.1],
    ["pop50a", -5, -50, 75, 3.4],
    ["pop50b", 5, -50, 75, 3.8],
    ["pop75", 0, -75, 110, 4.2],
  ];
  const pitMat = mat(0x30342f, 0.7, 0.52);
  for (const [id, x, z, score, period] of popupDefs) {
    const popup = createTarget(id, "popup", x, z, score, { popupPeriod: period });
    targets.push(popup);
    root.add(popup.root);
    popup.root.position.y = -1.35;
    popup.upright = false;
    setTargetVisualState(popup, "inactive");

    const pit = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.3, 0.72), pitMat);
    pit.position.set(x, 0.15, z);
    pit.castShadow = true;
    root.add(pit);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.32), mat(0x121412, 0.95, 0.05));
    slot.position.set(x, 0.32, z + 0.02);
    root.add(slot);
  }

  // Dual moving rails — mid bay (25m) and long bay (50m)
  const moverLayouts: Array<[string, number, number, number, number, number, number]> = [
    ["move25", 0, -25, 55, -6, 6, 3.1],
    ["move50", 0, -50, 85, -5, 5, 2.4],
  ];
  for (const [id, x, z, score, moveMin, moveMax, moveSpeed] of moverLayouts) {
    const mover = createTarget(id, "moving", x, z, score, { moveMin, moveMax, moveSpeed });
    mover.baseLocalX = x;
    targets.push(mover);
    root.add(mover.root);
    const span = moveMax - moveMin + 1.2;
    const moverRail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.15, 0.24), mat(0x343936, 0.58, 0.6));
    moverRail.position.set((moveMin + moveMax) / 2, 0.18, z);
    root.add(moverRail);
    for (const stopX of [moveMin - 0.35, moveMax + 0.35]) {
      const railStop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.42), mat(0x8d7238, 0.68, 0.42));
      railStop.position.set(stopX, 0.3, z);
      root.add(railStop);
    }
  }

  scene.add(root);

  // Rebuild colliders in world space after the root is positioned.
  const worldColliders: THREE.Box3[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BoxGeometry) {
      const size = new THREE.Vector3();
      obj.geometry.computeBoundingBox();
      obj.geometry.boundingBox?.getSize(size);
      // Heavy statics only (walls / booth / backstop / platform)
      if (size.x > 1.2 || size.z > 1.2 || size.y > 2) {
        worldColliders.push(new THREE.Box3().setFromObject(obj));
      }
    }
  });
  // Drop local-space boxes collected during geometry build — worldColliders replace them.
  colliders.length = 0;
  colliders.push(...worldColliders);
  void populateShootingRangeWithEnvironmentAssets(root, colliders).catch((error) => {
    console.warn("[BDS] Imported range props failed to load", error);
  });

  const stats: RangeStats = {
    hits: 0,
    misses: 0,
    shots: 0,
    score: 0,
    accuracy: 0,
    challengeActive: false,
    challengeTimeLeft: 0,
    challengeScore: 0,
    challengeHits: 0,
    challengeMisses: 0,
    challengeShots: 0,
    challengeAccuracy: 0,
    bestChallengeScore: loadBestChallengeScore(),
    highestBadge: loadHighestBadge(),
    unlockedBadges: loadUnlockedBadges(),
    lastResult: null,
    lastHitDistance: 0,
  };

  // Spawn centered in a firing lane — NOT on a divider post (x=0 / ±5 / ±10).
  const spawnLocal = new THREE.Vector3(2.5, 0, 4.6);
  const spawnWorld = RANGE_WORLD_ORIGIN.clone().add(spawnLocal);
  const refillWorld = RANGE_WORLD_ORIGIN.clone().add(refillLocal);

  const raycaster = new THREE.Raycaster();
  const hitables: THREE.Object3D[] = [];
  for (const t of targets) {
    hitables.push(t.hitMesh);
    t.root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.target && child !== t.hitMesh) {
        hitables.push(child);
      }
    });
  }

  function recomputeAccuracy() {
    stats.accuracy = stats.shots > 0 ? (stats.hits / stats.shots) * 100 : 0;
  }

  function recomputeChallengeAccuracy() {
    stats.challengeAccuracy =
      stats.challengeShots > 0 ? (stats.challengeHits / stats.challengeShots) * 100 : 0;
  }

  function findTargetById(id: string) {
    return targets.find((t) => t.id === id);
  }

  const session: ShootingRangeSession = {
    root,
    colliders,
    stats,
    spawnLocal,
    spawnWorld,
    lookYaw: 0,
    refillWorld,
    update(dt: number) {
      if (stats.challengeActive) {
        stats.challengeTimeLeft = Math.max(0, stats.challengeTimeLeft - dt);
        if (stats.challengeTimeLeft <= 0) {
          session.endChallenge();
        }
      }

      for (const target of targets) {
        if (target.hitFlash > 0) {
          target.hitFlash = Math.max(0, target.hitFlash - dt);
        }
        if (target.knocked) {
          setTargetVisualState(target, "hit");
          target.resetIn -= dt;
          if (target.resetIn <= 0) resetTarget(target);
          continue;
        }

        if (target.kind === "popup") {
          target.popupPhase += dt * ((Math.PI * 2) / target.popupPeriod);
          const wave = Math.sin(target.popupPhase);
          // Up when sin > 0.15, down otherwise
          const up = wave > 0.2;
          target.upright = up;
          const desiredY = up ? 0 : -1.35;
          target.root.position.y = THREE.MathUtils.lerp(target.root.position.y, desiredY, Math.min(1, dt * 6));
          target.root.rotation.x = 0;
          setTargetVisualState(target, up ? "ready" : "inactive");
        } else {
          setTargetVisualState(target, "ready");
        }

        if (target.kind === "moving" && target.upright) {
          target.root.position.x += target.moveDir * target.moveSpeed * dt;
          if (target.root.position.x > target.moveMax) {
            target.root.position.x = target.moveMax;
            target.moveDir = -1;
          } else if (target.root.position.x < target.moveMin) {
            target.root.position.x = target.moveMin;
            target.moveDir = 1;
          }
        }
      }
    },
    tryHit(origin: THREE.Vector3, dir: THREE.Vector3) {
      raycaster.set(origin, dir.clone().normalize());
      raycaster.far = 120;
      const hits = raycaster.intersectObjects(hitables, false);
      if (!hits.length) return null;

      const first = hits[0];
      let targetId = first.object.userData.targetId as string | undefined;
      if (!targetId) {
        let p: THREE.Object3D | null = first.object;
        while (p) {
          if (p.userData.targetId) {
            targetId = p.userData.targetId;
            break;
          }
          p = p.parent;
        }
      }
      if (!targetId) return null;
      const target = findTargetById(targetId);
      if (!target || target.knocked || !target.upright) return null;
      // Pop-ups below ground are not hittable
      if (target.kind === "popup" && target.root.position.y < -0.4) return null;

      addImpactMark(target, first.point);
      knockTarget(target);
      stats.hits += 1;
      stats.shots += 1;
      stats.score += target.scoreValue;
      stats.lastHitDistance = target.distanceMeters;
      if (stats.challengeActive) {
        stats.challengeScore += target.scoreValue;
        stats.challengeHits += 1;
        stats.challengeShots += 1;
        recomputeChallengeAccuracy();
      }
      recomputeAccuracy();

      return {
        hit: true,
        distance: first.distance,
        point: first.point.clone(),
        score: target.scoreValue,
        targetId: target.id,
        kind: target.kind,
      };
    },
    registerMiss() {
      stats.misses += 1;
      stats.shots += 1;
      if (stats.challengeActive) {
        stats.challengeMisses += 1;
        stats.challengeShots += 1;
        recomputeChallengeAccuracy();
      }
      recomputeAccuracy();
    },
    startChallenge() {
      stats.challengeActive = true;
      stats.challengeTimeLeft = RANGE_CHALLENGE_SECONDS;
      stats.challengeScore = 0;
      stats.challengeHits = 0;
      stats.challengeMisses = 0;
      stats.challengeShots = 0;
      stats.challengeAccuracy = 0;
      stats.lastResult = null;
      // Reset targets for a clean run
      for (const t of targets) resetTarget(t);
      // Re-duck popups
      for (const t of targets) {
        if (t.kind === "popup") {
          t.root.position.y = -1.35;
          t.upright = false;
          t.popupPhase = Math.random() * Math.PI * 2;
          setTargetVisualState(t, "inactive");
        }
      }
    },
    endChallenge() {
      if (!stats.challengeActive && stats.lastResult) {
        return stats.lastResult;
      }
      stats.challengeActive = false;
      stats.challengeTimeLeft = 0;
      recomputeChallengeAccuracy();
      const badge = evaluateRangeBadge(stats.challengeScore, stats.challengeAccuracy);
      const persisted = persistChallengeQualification(stats.challengeScore, badge);
      stats.bestChallengeScore = persisted.bestScore;
      stats.highestBadge = persisted.highestBadge;
      stats.unlockedBadges = persisted.unlockedBadges;
      const result: RangeChallengeResult = {
        passed: badge !== "unqualified",
        badge,
        score: stats.challengeScore,
        accuracy: stats.challengeAccuracy,
        hits: stats.challengeHits,
        misses: stats.challengeMisses,
        shots: stats.challengeShots,
        bestScore: persisted.bestScore,
        highestBadge: persisted.highestBadge,
        unlockedBadges: persisted.unlockedBadges,
        newlyUnlocked: persisted.newlyUnlocked,
        endedAt: Date.now(),
      };
      stats.lastResult = result;
      return result;
    },
    clearLastResult() {
      stats.lastResult = null;
    },
    refillWeapons() {
      return { m4: 30, pistol: 15 };
    },
    nearRefill(playerWorld: THREE.Vector3) {
      return playerWorld.distanceTo(refillWorld) < 2.4;
    },
    dispose(sc: THREE.Scene) {
      sc.remove(root);
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !obj.userData.sharedEnvAsset) {
          if (obj.userData.canvasTexture instanceof THREE.Texture) {
            obj.userData.canvasTexture.dispose();
          }
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
        if (obj instanceof THREE.Light) {
          // lights have no geometry
        }
      });
    },
  };

  return session;
}
