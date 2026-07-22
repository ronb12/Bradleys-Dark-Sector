import * as THREE from "three";
import { spawnDestructionBurst, type AtmosphereState } from "./atmosphere";

export type DamageableProp = {
  mesh: THREE.Mesh;
  collider: THREE.Box3 | null;
  health: number;
  kind: "window" | "light" | "crate";
  light?: THREE.Light;
  destroyed: boolean;
};

export class DestructionSystem {
  readonly props: DamageableProp[] = [];
  private scene: THREE.Scene;
  private colliders: THREE.Box3[];
  atmosphere: AtmosphereState | null = null;

  constructor(scene: THREE.Scene, colliders: THREE.Box3[]) {
    this.scene = scene;
    this.colliders = colliders;
  }

  setColliders(colliders: THREE.Box3[]) {
    this.colliders = colliders;
  }

  register(prop: Omit<DamageableProp, "destroyed">) {
    const entry: DamageableProp = { ...prop, destroyed: false };
    this.props.push(entry);
    return entry;
  }

  damageAt(point: THREE.Vector3, amount: number, radius = 0.45) {
    for (const prop of this.props) {
      if (prop.destroyed || prop.mesh.position.distanceTo(point) > radius + 2) continue;
      const bounds = new THREE.Box3().setFromObject(prop.mesh).expandByScalar(radius);
      if (!bounds.containsPoint(point)) continue;
      prop.health -= amount;
      if (prop.health <= 0) this.destroy(prop);
    }
  }

  destroy(prop: DamageableProp) {
    if (prop.destroyed) return;
    prop.destroyed = true;
    prop.mesh.visible = false;
    if (prop.light) prop.light.visible = false;
    if (prop.collider) {
      const index = this.colliders.indexOf(prop.collider);
      if (index >= 0) this.colliders.splice(index, 1);
    }
    const p = prop.mesh.getWorldPosition(new THREE.Vector3());
    spawnDestructionBurst(this.scene, p.x, p.z, this.atmosphere ?? undefined);
  }
}
