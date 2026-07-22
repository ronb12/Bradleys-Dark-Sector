export type WeaponId = "m4" | "smg" | "pistol";

export type WeaponConfig = {
  name: string;
  shortName: string;
  slot: 1 | 2 | 3;
  maxAmmo: number;
  damage: number;
  pellets: number;
  fireInterval: number;
  reloadTime: number;
  recoil: number;
  baseSpread: number;
  sustainedSpread: number;
  automatic: boolean;
};

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  m4: {
    name: "M4A1 CARBINE",
    shortName: "M4",
    slot: 1,
    maxAmmo: 30,
    damage: 34,
    pellets: 1,
    fireInterval: 0.085,
    reloadTime: 1.45,
    recoil: 0.065,
    baseSpread: 0.0025,
    sustainedSpread: 0.012,
    automatic: true,
  },
  smg: {
    name: "VX-9 SMG",
    shortName: "VX9",
    slot: 2,
    maxAmmo: 36,
    damage: 22,
    pellets: 1,
    fireInterval: 0.065,
    reloadTime: 1.3,
    recoil: 0.052,
    baseSpread: 0.004,
    sustainedSpread: 0.018,
    automatic: true,
  },
  pistol: {
    name: "9MM PISTOL",
    shortName: "PST",
    slot: 3,
    maxAmmo: 15,
    damage: 27,
    pellets: 1,
    fireInterval: 0.24,
    reloadTime: 1.05,
    recoil: 0.095,
    baseSpread: 0.003,
    sustainedSpread: 0,
    automatic: false,
  },
};

export const WEAPON_ORDER: WeaponId[] = ["m4", "smg", "pistol"];

export function nextWeapon(current: WeaponId): WeaponId {
  return WEAPON_ORDER[(WEAPON_ORDER.indexOf(current) + 1) % WEAPON_ORDER.length];
}

/** Per-weapon kick: vertical climb, horizontal drift, and camera shake. ADS tightens all three. */
export function weaponRecoilKick(
  weapon: WeaponId,
  recoilAmount: number,
  adsBlend: number,
): { pitch: number; yaw: number; shake: number } {
  const adsMul = 1 - adsBlend * 0.38;
  const jitter = (Math.random() - 0.5) * 2;
  switch (weapon) {
    case "m4":
      return {
        pitch: recoilAmount * adsMul,
        yaw: recoilAmount * 0.18 * adsMul * jitter,
        shake: recoilAmount * 2.1 * adsMul,
      };
    case "smg":
      return {
        pitch: recoilAmount * 0.82 * adsMul,
        yaw: recoilAmount * 0.35 * adsMul * jitter,
        shake: recoilAmount * 1.7 * adsMul,
      };
    case "pistol":
      return {
        pitch: recoilAmount * 1.15 * adsMul,
        yaw: recoilAmount * 0.1 * adsMul * jitter,
        shake: recoilAmount * 2.5 * adsMul,
      };
  }
}

/** Solo PvE falloff — full damage inside 18m, ~68% at 72m+. PvP uses flat damage. */
export function damageAtRange(baseDamage: number, distanceM: number, armored = false): number {
  let scaled = baseDamage;
  if (distanceM > 18) {
    const t = Math.min(1, (distanceM - 18) / 54);
    scaled = Math.round(baseDamage * (1 - t * 0.32));
  }
  if (armored) scaled = Math.round(scaled * 0.88);
  return Math.max(1, scaled);
}

/** Normalized 0–1 spread ring for the combat crosshair (bloom + movement + ADS). */
export function computeSpreadVisual(
  weapon: WeaponConfig,
  fireHeat: number,
  adsBlend: number,
  opts?: { moving?: boolean; sprinting?: boolean; accuracyBonus?: number },
): number {
  const adsSpreadMultiplier = 1 - adsBlend * 0.52;
  const moveSpread = opts?.sprinting ? 0.0042 : opts?.moving ? 0.002 : 0;
  const accuracyMultiplier = Math.max(0.65, 1 - (opts?.accuracyBonus ?? 0));
  const spread =
    (weapon.baseSpread + weapon.sustainedSpread * fireHeat + moveSpread) *
    adsSpreadMultiplier *
    accuracyMultiplier;
  return Math.min(1, spread / 0.034);
}
