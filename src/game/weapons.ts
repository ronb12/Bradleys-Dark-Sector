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
