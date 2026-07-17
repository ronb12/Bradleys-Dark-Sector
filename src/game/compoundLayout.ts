/** Solo compound footprint + combat cover layout constants. */

/** Half-extent of the perimeter wall centers (was 42 → ~84×84 yard). */
export const COMPOUND_WALL = 60;
/** Inner playable spawn clamp so enemies stay inside walls with clearance. */
export const COMPOUND_SPAWN_HALF = 50;
/** Visual ground plane size (was 160). */
export const COMPOUND_GROUND_SIZE = 220;

export const COMPOUND_BEFORE = {
  wall: 42,
  spawnHalf: 34,
  enclosed: 84,
} as const;

export const COMPOUND_AFTER = {
  wall: COMPOUND_WALL,
  spawnHalf: COMPOUND_SPAWN_HALF,
  enclosed: COMPOUND_WALL * 2,
} as const;
