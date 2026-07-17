import * as THREE from "three";
import { DestructionSystem } from "./destruction";

export const WAREHOUSE_ALPHA = {
  id: "warehouse_alpha",
  center: new THREE.Vector3(48, 0, -12),
  rooms: {
    loading: { x: 48, z: -18, radius: 5.5 },
    intel: { x: 48, z: -7, radius: 4.5 },
  },
};

function wall(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  size: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push(new THREE.Box3().setFromObject(mesh));
  return mesh;
}

/** A compact, navigable combat interior with a clear doorway and central cover. */
export function createWarehouseInterior(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x373a35, roughness: 0.92 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6c5636, roughness: 0.86 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fc4bf,
    emissive: 0x315e58,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.66,
  });

  // The procedural east warehouse supplies the shell and open south roller door.
  // This divider leaves passages at both sides for indoor flanking.
  wall(scene, colliders, new THREE.Vector3(7, 3.4, 0.3), new THREE.Vector3(48, 1.7, -12), concrete);

  for (const [x, z] of [[45, -17], [51, -7], [45, -7]] as const) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.5), crateMat);
    mesh.position.set(x, 0.625, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const collider = new THREE.Box3().setFromObject(mesh);
    colliders.push(collider);
    destruction.register({ mesh, collider, health: 70, kind: "crate" });
  }

  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 0.08), glassMat);
  windowMesh.position.set(48, 2.5, -1.22);
  scene.add(windowMesh);
  const windowCollider = new THREE.Box3().setFromObject(windowMesh);
  colliders.push(windowCollider);
  destruction.register({ mesh: windowMesh, collider: windowCollider, health: 25, kind: "window" });

  const light = new THREE.PointLight(0xc9f5e8, 4.2, 13, 1.7);
  light.position.set(48, 3.8, -8);
  scene.add(light);
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), glassMat);
  fixture.position.copy(light.position);
  scene.add(fixture);
  destruction.register({ mesh: fixture, collider: null, health: 18, kind: "light", light });
}

export function warehouseRoomAt(x: number, z: number): "loading" | "intel" | null {
  for (const [name, room] of Object.entries(WAREHOUSE_ALPHA.rooms)) {
    if (Math.hypot(x - room.x, z - room.z) <= room.radius) return name as "loading" | "intel";
  }
  return null;
}
