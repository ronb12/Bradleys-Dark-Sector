import * as THREE from "three";
import { DestructionSystem } from "./destruction";
import { decorateCompoundInteriors } from "./interiors";
import { createFallbackEnvTextures } from "./environment";

export const WAREHOUSE_ALPHA = {
  id: "warehouse_alpha",
  center: new THREE.Vector3(48, 0, -12),
  rooms: {
    loading: { x: 48, z: -18, radius: 5.5 },
    intel: { x: 48, z: -7, radius: 4.5 },
  },
};

/**
 * Decorate every compound interior for CQB. Warehouse Alpha (east) gets the
 * intel / loading layout; other buildings get warehouse, hangar, or annex kits.
 */
export function createWarehouseInterior(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
) {
  decorateCompoundInteriors(scene, colliders, destruction, createFallbackEnvTextures());
}

export function warehouseRoomAt(x: number, z: number): "loading" | "intel" | null {
  for (const [name, room] of Object.entries(WAREHOUSE_ALPHA.rooms)) {
    if (Math.hypot(x - room.x, z - room.z) <= room.radius) return name as "loading" | "intel";
  }
  return null;
}
