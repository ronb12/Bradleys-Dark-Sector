/** Loadouts, unlocks, ranks, and persistent stats (localStorage). */
import type { WeaponId } from "./weapons";

export type DifficultyId = "recruit" | "operator" | "veteran" | "nightmare";

export type AttachmentId = "redDot" | "suppressor" | "extendedMag" | "grip" | "laser";

export type LoadoutWeapon = {
  weapon: WeaponId;
  attachments: AttachmentId[];
};

export type PersistentStats = {
  totalKills: number;
  totalDeaths: number;
  missionsCompleted: number;
  bestWave: number;
  bestScore: number;
  playTimeSec: number;
  xp: number;
  unlockedAttachments: AttachmentId[];
  unlockedDifficulties: DifficultyId[];
  loadout: LoadoutWeapon[];
  preferredDifficulty: DifficultyId;
};

const STORAGE_KEY = "bds-progression-v1";

export const DIFFICULTY: Record<
  DifficultyId,
  { label: string; enemyHpMul: number; enemyDmgMul: number; enemyCountMul: number; playerHpMul: number; xpMul: number }
> = {
  recruit: { label: "Recruit", enemyHpMul: 0.75, enemyDmgMul: 0.48, enemyCountMul: 0.8, playerHpMul: 1.3, xpMul: 0.7 },
  operator: { label: "Operator", enemyHpMul: 1, enemyDmgMul: 0.64, enemyCountMul: 1, playerHpMul: 1.22, xpMul: 1 },
  veteran: { label: "Veteran", enemyHpMul: 1.25, enemyDmgMul: 0.92, enemyCountMul: 1.15, playerHpMul: 1.05, xpMul: 1.35 },
  nightmare: { label: "Nightmare", enemyHpMul: 1.55, enemyDmgMul: 1.18, enemyCountMul: 1.35, playerHpMul: 0.88, xpMul: 1.8 },
};

export const ATTACHMENTS: Record<
  AttachmentId,
  { name: string; unlockXp: number; effects: Partial<{ damage: number; recoil: number; fireInterval: number; maxAmmo: number; accuracy: number }> }
> = {
  redDot: { name: "Red Dot", unlockXp: 0, effects: { accuracy: 0.08 } },
  suppressor: { name: "Suppressor", unlockXp: 400, effects: { recoil: -0.012, damage: -2 } },
  extendedMag: { name: "Extended Mag", unlockXp: 800, effects: { maxAmmo: 10 } },
  grip: { name: "Foregrip", unlockXp: 1200, effects: { recoil: -0.02 } },
  laser: { name: "Laser Sight", unlockXp: 1800, effects: { accuracy: 0.12, fireInterval: -0.01 } },
};

export const DEFAULT_STATS: PersistentStats = {
  totalKills: 0,
  totalDeaths: 0,
  missionsCompleted: 0,
  bestWave: 0,
  bestScore: 0,
  playTimeSec: 0,
  xp: 0,
  unlockedAttachments: ["redDot"],
  unlockedDifficulties: ["recruit", "operator"],
  loadout: [
    { weapon: "m4", attachments: ["redDot"] },
    { weapon: "smg", attachments: ["grip"] },
    { weapon: "pistol", attachments: [] },
  ],
  preferredDifficulty: "operator",
};

export function loadProgression(): PersistentStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATS);
    const parsed = JSON.parse(raw) as Partial<PersistentStats>;
    return { ...structuredClone(DEFAULT_STATS), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATS);
  }
}

export function saveProgression(stats: PersistentStats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export function rankFromXp(xp: number): { rank: string; level: number; nextAt: number; progress: number } {
  const brackets = [
    [0, "Private"],
    [200, "Corporal"],
    [500, "Sergeant"],
    [1000, "Lieutenant"],
    [2000, "Captain"],
    [3500, "Major"],
    [5500, "Colonel"],
    [8000, "Commander"],
  ] as const;
  let level = 0;
  let rank = "Private";
  let nextAt = 200;
  for (let i = 0; i < brackets.length; i += 1) {
    if (xp >= brackets[i][0]) {
      level = i + 1;
      rank = brackets[i][1];
      nextAt = brackets[i + 1]?.[0] ?? brackets[i][0] + 2500;
    }
  }
  const prev = brackets[Math.max(0, level - 1)][0];
  const span = Math.max(1, nextAt - prev);
  const progress = Math.min(1, (xp - prev) / span);
  return { rank, level, nextAt, progress };
}

export function applyAttachmentMods(
  base: { damage: number; recoil: number; fireInterval: number; maxAmmo: number },
  attachments: AttachmentId[]
) {
  const out = { ...base, accuracyBonus: 0 };
  for (const id of attachments) {
    const fx = ATTACHMENTS[id]?.effects;
    if (!fx) continue;
    if (fx.damage) out.damage += fx.damage;
    if (fx.recoil) out.recoil = Math.max(0.02, out.recoil + fx.recoil);
    if (fx.fireInterval) out.fireInterval = Math.max(0.05, out.fireInterval + fx.fireInterval);
    if (fx.maxAmmo) out.maxAmmo += fx.maxAmmo;
    if (fx.accuracy) out.accuracyBonus += fx.accuracy;
  }
  return out;
}

export function recordMissionEnd(
  stats: PersistentStats,
  result: { kills: number; score: number; wave: number; won: boolean; playSec: number; difficulty: DifficultyId }
): PersistentStats {
  const xpGain = Math.floor(
    (result.kills * 12 + result.score * 0.05 + (result.won ? 150 : 40) + result.wave * 25) * DIFFICULTY[result.difficulty].xpMul
  );
  const next: PersistentStats = {
    ...stats,
    totalKills: stats.totalKills + result.kills,
    totalDeaths: stats.totalDeaths + (result.won ? 0 : 1),
    missionsCompleted: stats.missionsCompleted + (result.won ? 1 : 0),
    bestWave: Math.max(stats.bestWave, result.wave),
    bestScore: Math.max(stats.bestScore, result.score),
    playTimeSec: stats.playTimeSec + result.playSec,
    xp: stats.xp + xpGain,
  };

  for (const [id, def] of Object.entries(ATTACHMENTS) as [AttachmentId, (typeof ATTACHMENTS)[AttachmentId]][]) {
    if (next.xp >= def.unlockXp && !next.unlockedAttachments.includes(id)) {
      next.unlockedAttachments = [...next.unlockedAttachments, id];
    }
  }
  if (next.xp >= 500 && !next.unlockedDifficulties.includes("veteran")) {
    next.unlockedDifficulties = [...next.unlockedDifficulties, "veteran"];
  }
  if (next.xp >= 2000 && !next.unlockedDifficulties.includes("nightmare")) {
    next.unlockedDifficulties = [...next.unlockedDifficulties, "nightmare"];
  }

  saveProgression(next);
  return next;
}

/** Award XP the first time each range qualification badge is unlocked. */
export function awardRangeBadgeXp(
  stats: PersistentStats,
  newlyUnlocked: Array<"marksman" | "sharpshooter" | "expert">,
  xpByBadge: Record<"marksman" | "sharpshooter" | "expert", number>
): { stats: PersistentStats; xpGained: number } {
  let xpGained = 0;
  for (const id of newlyUnlocked) {
    xpGained += xpByBadge[id] ?? 0;
  }
  if (xpGained <= 0) return { stats, xpGained: 0 };
  const next: PersistentStats = { ...stats, xp: stats.xp + xpGained };
  for (const [id, def] of Object.entries(ATTACHMENTS) as [AttachmentId, (typeof ATTACHMENTS)[AttachmentId]][]) {
    if (next.xp >= def.unlockXp && !next.unlockedAttachments.includes(id)) {
      next.unlockedAttachments = [...next.unlockedAttachments, id];
    }
  }
  if (next.xp >= 500 && !next.unlockedDifficulties.includes("veteran")) {
    next.unlockedDifficulties = [...next.unlockedDifficulties, "veteran"];
  }
  if (next.xp >= 2000 && !next.unlockedDifficulties.includes("nightmare")) {
    next.unlockedDifficulties = [...next.unlockedDifficulties, "nightmare"];
  }
  saveProgression(next);
  return { stats: next, xpGained };
}
