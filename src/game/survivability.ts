/** Player survivability tuning — medkits, damage pacing, wave bonuses. */

export const BASE_MAX_HEALTH = 110;
export const MEDKIT_HEAL = 62;
export const ARMOR_PLATE_HEAL = 38;
export const PLAYER_DAMAGE_COOLDOWN = 1.08;
export const WAVE_CLEAR_ARMOR_BONUS = 48;
export const MAX_GRENADES = 4;
export const MAX_MEDKITS = 4;

export function maxHealthForDifficulty(playerHpMul: number): number {
  return Math.round(BASE_MAX_HEALTH * playerHpMul);
}

export function canUseMedkit(medkits: number, health: number, maxHealth: number): boolean {
  return medkits > 0 && health < maxHealth;
}

export function applyMedkitHeal(health: number, maxHealth: number): number {
  return Math.min(maxHealth, health + MEDKIT_HEAL);
}

export function applyArmorPlate(health: number, maxHealth: number): number {
  return Math.min(maxHealth, health + ARMOR_PLATE_HEAL);
}

export function healthPercent(health: number, maxHealth: number): number {
  return Math.round((health / Math.max(1, maxHealth)) * 100);
}
