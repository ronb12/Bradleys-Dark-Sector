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
  const stripeCount = meters >= 50 ? 3 : meters >= 25 ? 2 : 1;
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
  const metal = mat(0x555850, 0.55, 0.55);
  const paint = mat(0xc9a227, 0.65, 0.2);
  const asphalt = mat(0x1c2022, 0.96, 0.02);
  const safetyWhite = mat(0xd4d1bc, 0.82, 0.05);
  const laneRubber = mat(0x171a18, 0.92, 0.03);

  // Bay floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 68), asphalt);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, -26);
  floor.receiveShadow = true;
  root.add(floor);

  // Layered side berms with concrete toes make the bay feel contained without
  // relying on a single featureless wall.
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 62), berm);
    wall.position.set(side * 10.2, 2.1, -26);
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
    addCollider(colliders, wall);

    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 61), concrete);
    toe.position.set(side * 9.18, 0.24, -26);
    toe.receiveShadow = true;
    root.add(toe);
    for (let z = 2; z >= -53; z -= 5) {
      const fencePost = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.2, 0.09), metal);
      fencePost.position.set(side * 9.3, 1.58, z);
      root.add(fencePost);
      const bermBand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 4.85), dark);
      bermBand.position.set(side * 9.22, 1.25, z - 2.4);
      root.add(bermBand);
    }
  }

  // Deep earthen backstop, dark sacrificial face, and overhead ricochet baffles.
  const backstop = new THREE.Mesh(new THREE.BoxGeometry(22, 6.5, 2.8), berm);
  backstop.position.set(0, 3.2, -56);
  backstop.castShadow = true;
  root.add(backstop);
  addCollider(colliders, backstop);

  const backFace = new THREE.Mesh(new THREE.BoxGeometry(20, 5.2, 0.35), dark);
  backFace.position.set(0, 2.8, -54.4);
  backFace.receiveShadow = true;
  root.add(backFace);
  const backstopCap = new THREE.Mesh(new THREE.BoxGeometry(20.8, 0.45, 4.8), berm);
  backstopCap.position.set(0, 6.08, -56.2);
  backstopCap.rotation.x = -0.08;
  root.add(backstopCap);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    const absorber = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.22, 1.1), metal);
    absorber.position.set(x, 4.9, -53.65);
    absorber.rotation.x = -0.42;
    root.add(absorber);
  }

  // Overhead baffle / sun shade over firing line
  const baffle = new THREE.Mesh(new THREE.BoxGeometry(18, 0.25, 6), metal);
  baffle.position.set(0, 3.6, 2);
  baffle.castShadow = true;
  root.add(baffle);
  const baffleLiner = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.08, 5.6), laneRubber);
  baffleLiner.position.set(0, 3.43, 2);
  root.add(baffleLiner);

  for (const x of [-8, -2.5, 2.5, 8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 8), metal);
    post.position.set(x, 1.8, 2);
    root.add(post);
  }

  // Firing line platform
  const platform = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 4.5), concrete);
  platform.position.set(0, 0.09, 3.5);
  platform.receiveShadow = true;
  root.add(platform);

  // Four proper firing stalls: rubber benches, side screens, number boards,
  // and lane centerlines that remain readable all the way to the berm.
  const laneCenters = [-6, -2, 2, 6];
  for (let index = 0; index < laneCenters.length; index += 1) {
    const x = laneCenters[index];
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.78, 0.72), laneRubber);
    bench.position.set(x, 0.56, 2.05);
    bench.castShadow = true;
    root.add(bench);
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 0.9), metal);
    benchTop.position.set(x, 1.0, 2.05);
    root.add(benchTop);
    const bags = makeSandbagLine(1.9);
    bags.position.set(x, 0, 0.72);
    root.add(bags);

    const laneNumber = makeTextSign(`LANE 0${index + 1}`, 1.7, 0.48, "#d0c58f", "#1d211c");
    laneNumber.position.set(x, 2.95, 4.96);
    root.add(laneNumber);

    for (let z = -1; z >= -51; z -= 2.4) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 1.3), safetyWhite);
      dash.position.set(x, 0.055, z);
      root.add(dash);
    }
  }
  for (const x of [-4, 4]) {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.62, 3.25), metal);
    divider.position.set(x, 1.43, 2.35);
    root.add(divider);
    const dividerInset = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.28, 2.72), laneRubber);
    dividerInset.position.set(x, 1.43, 2.32);
    root.add(dividerInset);
  }
  const centerLaneBreak = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 3.25), safetyWhite);
  centerLaneBreak.position.set(0, 0.205, 2.35);
  root.add(centerLaneBreak);

  // Double firing line with no-step stencil blocks.
  const fireLine = new THREE.Mesh(new THREE.BoxGeometry(16, 0.04, 0.22), paint);
  fireLine.position.set(0, 0.2, 1.15);
  root.add(fireLine);
  const readyLine = new THREE.Mesh(new THREE.BoxGeometry(16, 0.035, 0.1), safetyWhite);
  readyLine.position.set(0, 0.195, 4.85);
  root.add(readyLine);
  for (const x of laneCenters) {
    const toeMark = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.045, 0.55), paint);
    toeMark.position.set(x, 0.205, 1.52);
    root.add(toeMark);
  }

  // Distance markers at 10 / 25 / 50
  for (const dist of [10, 25, 50]) {
    for (const side of [-1, 1]) {
      const marker = makeDistanceMarker(dist);
      marker.position.set(side * 8.6, 0, -dist);
      root.add(marker);
      const distanceSign = makeTextSign(`${dist} M`, 1.05, 0.42, "#d2bd72", "#171a16");
      distanceSign.position.set(side * 8.52, 1.62, -dist + 0.05);
      distanceSign.rotation.y = side < 0 ? 0.12 : -0.12;
      root.add(distanceSign);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(18, 0.03, 0.12), paint);
    stripe.position.set(0, 0.04, -dist);
    root.add(stripe);
  }

  // Control booth
  const booth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 2.8), concrete);
  booth.position.set(-7.5, 1.3, 6.5);
  booth.castShadow = true;
  root.add(booth);
  addCollider(colliders, booth);
  const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 3.2), metal);
  boothRoof.position.set(-7.5, 2.7, 6.5);
  root.add(boothRoof);
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xb8d8c8,
      emissive: 0x3a6a58,
      emissiveIntensity: 0.18,
      roughness: 0.3,
      metalness: 0.08,
    })
  );
  window.position.set(-7.5, 1.55, 5.05);
  root.add(window);
  const boothSign = makeTextSign("RANGE CONTROL", 2.45, 0.55, "#2b332c", "#d8cf9a");
  boothSign.position.set(-7.5, 2.25, 5.04);
  root.add(boothSign);

  // Ammo refill crate (interact / proximity)
  const crate = new THREE.Group();
  crate.name = "RangeRefill";
  const crateBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.8), mat(0x8a6a38, 0.88, 0.05));
  crateBody.position.y = 0.38;
  crateBody.castShadow = true;
  crate.add(crateBody);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 0.84), metal);
  band.position.y = 0.38;
  crate.add(band);
  const stencil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.04), paint);
  stencil.position.set(0, 0.5, 0.42);
  crate.add(stencil);
  const glow = new THREE.PointLight(0xc9a227, 0.8, 5, 2);
  glow.position.set(0, 1.1, 0);
  crate.add(glow);
  crate.position.set(5.5, 0, 5.2);
  crate.userData.refill = true;
  root.add(crate);
  addCollider(colliders, crate);

  // Flood lights: visible fixtures on every pole, with only three real lights
  // to keep mobile draw and lighting cost bounded.
  let lightIndex = 0;
  for (const [lx, lz] of [
    [-8, 4],
    [8, 4],
    [-8, -20],
    [8, -20],
    [-8, -45],
    [8, -45],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.5, 8), metal);
    pole.position.set(lx, 2.75, lz);
    root.add(pole);
    const lamp = new THREE.SpotLight(0xfff0d0, 28, 42, Math.PI / 5, 0.45, 1);
    lamp.position.set(lx, 5.3, lz);
    lamp.target.position.set(0, 0, lz - 8);
    root.add(lamp);
    root.add(lamp.target);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.55), metal);
    housing.position.set(lx, 5.35, lz);
    root.add(housing);
    if (lightIndex % 2 === 1) {
      root.remove(lamp);
      root.remove(lamp.target);
      lamp.dispose();
    }
    lightIndex += 1;
  }

  // Ambient bay fill
  const fill = new THREE.HemisphereLight(0xd8e0c8, 0x3c3428, 0.55);
  fill.position.set(0, 6, -15);
  root.add(fill);

  // Readable safety signage and a restrained red live-fire lamp.
  const sign = makeTextSign("LIVE FIRE RANGE", 3.4, 0.85, "#c7ab45", "#191b17");
  sign.position.set(0, 2.45, 5.91);
  root.add(sign);
  const clearSign = makeTextSign("EYE + EAR PROTECTION", 3.0, 0.55, "#d7d1b8", "#252923");
  clearSign.position.set(6.85, 2.45, 5.9);
  root.add(clearSign);
  const liveLampMat = new THREE.MeshStandardMaterial({
    color: 0x7a1914,
    emissive: 0x7a1914,
    emissiveIntensity: 0.28,
    roughness: 0.48,
    metalness: 0.15,
  });
  const liveLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), liveLampMat);
  liveLamp.position.set(-2.05, 2.45, 5.88);
  root.add(liveLamp);

  return { refillLocal: new THREE.Vector3(5.5, 0, 5.2) };
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
  const targetScale = distanceMeters >= 50 ? 0.9 : distanceMeters <= 10 ? 1.06 : 1;
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

  // Static silhouettes at 10 / 25 / 50 across lanes
  const staticLayout: Array<[string, RangeTargetKind, number, number, number]> = [
    ["s10a", "silhouette", -6, -10, 10],
    ["s10b", "silhouette", -2, -10, 10],
    ["s10c", "silhouette", 2, -10, 10],
    ["p10", "plate", 6, -10, 15],
    ["s25a", "silhouette", -6, -25, 25],
    ["s25b", "silhouette", 0, -25, 25],
    ["p25", "plate", 6, -25, 35],
    ["s50a", "silhouette", -4, -50, 50],
    ["s50b", "silhouette", 4, -50, 50],
    ["p50", "plate", 0, -50, 60],
  ];
  for (const [id, kind, x, z, score] of staticLayout) {
    const t = createTarget(id, kind, x, z, score);
    targets.push(t);
    root.add(t.root);
  }

  // Pop-up lane (center-left, mid range)
  const popupA = createTarget("pop25", "popup", -2, -25, 40, { popupPeriod: 2.8 });
  const popupB = createTarget("pop50", "popup", 2, -50, 70, { popupPeriod: 3.6 });
  targets.push(popupA, popupB);
  root.add(popupA.root, popupB.root);
  // Start ducked
  popupA.root.position.y = -1.35;
  popupA.upright = false;
  setTargetVisualState(popupA, "inactive");
  popupB.root.position.y = -1.35;
  popupB.upright = false;
  setTargetVisualState(popupB, "inactive");

  const pitMat = mat(0x30342f, 0.7, 0.52);
  for (const [x, z] of [
    [-2, -25],
    [2, -50],
  ] as const) {
    const pit = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.3, 0.72), pitMat);
    pit.position.set(x, 0.15, z);
    pit.castShadow = true;
    root.add(pit);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.32), mat(0x121412, 0.95, 0.05));
    slot.position.set(x, 0.32, z + 0.02);
    root.add(slot);
  }

  // Moving target lane (right rail at 25m)
  const mover = createTarget("move25", "moving", 0, -25, 55, {
    moveMin: -3.5,
    moveMax: 3.5,
    moveSpeed: 2.8,
  });
  mover.baseLocalX = 0;
  targets.push(mover);
  root.add(mover.root);
  const moverRail = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.15, 0.24), mat(0x343936, 0.58, 0.6));
  moverRail.position.set(0, 0.18, -25);
  root.add(moverRail);
  for (const x of [-3.8, 3.8]) {
    const railStop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.42), mat(0x8d7238, 0.68, 0.42));
    railStop.position.set(x, 0.3, -25);
    root.add(railStop);
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

  const spawnLocal = new THREE.Vector3(0, 0, 4.2);
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
      raycaster.far = 90;
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
