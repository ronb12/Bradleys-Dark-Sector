/** Shared procedural geometry helpers for combat scenes. */

import * as THREE from "three";
import type { EnvTextures } from "../environment";

export type SceneBuilderContext = {
  root: THREE.Group;
  colliders: THREE.Box3[];
  textures: EnvTextures;
  mobile: boolean;
};

export function mat(color: number, roughness = 0.9, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function addStatic(ctx: SceneBuilderContext, mesh: THREE.Object3D, x: number, y: number, z: number, rotY = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  ctx.root.add(mesh);
  mesh.updateMatrixWorld(true);
  ctx.colliders.push(new THREE.Box3().setFromObject(mesh));
}

export function addVisual(ctx: SceneBuilderContext, mesh: THREE.Object3D, x: number, y: number, z: number, rotY = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  ctx.root.add(mesh);
}

export function addCover(ctx: SceneBuilderContext, obj: THREE.Object3D, x: number, z: number, rotY = 0) {
  addStatic(ctx, obj, x, 0, z, rotY);
}

export function makeWall(width: number, height: number, depth: number, color = 0x4a4a42) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeGroundPlane(
  ctx: SceneBuilderContext,
  size: number,
  color: number,
  segments = 24,
): THREE.Mesh {
  const segs = ctx.mobile ? 16 : segments;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, segs, segs),
    mat(color, 0.98, 0.02),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ctx.root.add(ground);
  return ground;
}

/** Perimeter barrier walls — keeps hostiles and player inside the AO. */
export function addBoundaryWalls(
  ctx: SceneBuilderContext,
  half: number,
  height = 4.5,
  thickness = 1.1,
  color = 0x3f423c,
) {
  const span = half * 2;
  addStatic(ctx, makeWall(span, height, thickness, color), 0, height / 2, -half);
  addStatic(ctx, makeWall(span, height, thickness, color), 0, height / 2, half);
  addStatic(ctx, makeWall(thickness, height, span, color), -half, height / 2, 0);
  addStatic(ctx, makeWall(thickness, height, span, color), half, height / 2, 0);
}

export function makeAsphaltStrip(width: number, length: number, color = 0x1c2022) {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat(color, 0.96, 0.02));
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.025;
  strip.receiveShadow = true;
  return strip;
}

export function disposeSceneRoot(root: THREE.Group) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => m.dispose());
    }
  });
  root.clear();
}

/** Scorch craters — visual only, cheap decals on the ground plane. */
export function addCraterScars(ctx: SceneBuilderContext, half: number, count: number) {
  const n = ctx.mobile ? Math.max(4, Math.floor(count * 0.5)) : count;
  for (let i = 0; i < n; i += 1) {
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(0.85 + Math.random() * 2.4, ctx.mobile ? 10 : 18),
      new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.54, depthWrite: false }),
    );
    crater.rotation.x = -Math.PI / 2;
    addVisual(
      ctx,
      crater,
      (Math.random() - 0.5) * half * 1.55,
      0.018,
      (Math.random() - 0.5) * half * 1.55,
    );
  }
}

/** Low battle haze — visual-only puffs, no colliders. */
export function addBattleSmoke(ctx: SceneBuilderContext, half: number, puffCount: number) {
  const count = ctx.mobile ? Math.max(1, Math.floor(puffCount * 0.45)) : puffCount;
  for (let i = 0; i < count; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(1 + Math.random() * 1.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x6a7068, transparent: true, opacity: 0.022, depthWrite: false }),
    );
    puff.scale.set(1.4 + Math.random(), 0.28 + Math.random() * 0.25, 1.1 + Math.random());
    addVisual(
      ctx,
      puff,
      (Math.random() - 0.5) * half * 1.35,
      2.8 + Math.random() * 3.5,
      (Math.random() - 0.5) * half * 1.35,
    );
  }
}

/** Spent brass clusters — visual debris near fighting positions. */
export function addSpentCasings(ctx: SceneBuilderContext, points: Array<[number, number]>) {
  const brass = mat(0xb89840, 0.55, 0.65);
  for (const [x, z] of points) {
    const pile = new THREE.Group();
    const n = ctx.mobile ? 4 : 8;
    for (let i = 0; i < n; i += 1) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 5), brass);
      shell.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.6);
      shell.position.set((Math.random() - 0.5) * 0.55, 0.025 + Math.random() * 0.04, (Math.random() - 0.5) * 0.55);
      pile.add(shell);
    }
    addVisual(ctx, pile, x, 0, z);
  }
}

/** Destroyed vehicle wreck — collidable hard cover. */
export function addVehicleWreck(
  ctx: SceneBuilderContext,
  x: number,
  z: number,
  rotY: number,
  options?: { burning?: boolean; scale?: number },
) {
  const scale = options?.scale ?? 1;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2 * scale, 1.5 * scale, 2.1 * scale),
    mat(0x3a3530, 0.9, 0.1),
  );
  body.position.y = 1.05 * scale;
  body.rotation.z = (Math.random() - 0.5) * 0.12;
  group.add(body);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.7 * scale, 1.3 * scale, 1.85 * scale),
    mat(0x2a2520, 0.92, 0.08),
  );
  cab.position.set(-2 * scale, 0.95 * scale, 0);
  group.add(cab);
  if (options?.burning !== false) {
    const burn = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * scale, 0.45 * scale, 0.55 * scale),
      mat(0x1a1510, 0.95, 0),
    );
    burn.position.set(0.6 * scale, 1.45 * scale, 0.35 * scale);
    group.add(burn);
    if (!ctx.mobile) {
      const light = new THREE.PointLight(0xff6a20, 1.2, 9, 1.8);
      light.position.copy(burn.position);
      light.position.y += 0.4;
      group.add(light);
    }
  }
  addStatic(ctx, group, x, 0, z, rotY);
}

/** Burned-out civilian car — tight urban AO wreck. */
export function addBurnedCar(ctx: SceneBuilderContext, x: number, z: number, rotY = 0) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 1.75), mat(0x1a1816, 0.95, 0.04));
  body.position.y = 0.72;
  body.rotation.z = 0.08;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 1.55), mat(0x121010, 0.98, 0.02));
  cabin.position.set(-0.35, 1.15, 0);
  group.add(cabin);
  const wheelMat = mat(0x0a0a0a, 0.9, 0.05);
  for (const [wx, wz] of [
    [-1.1, 0.72],
    [1.1, 0.72],
    [-1.1, -0.72],
    [1.1, -0.72],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.28, wz);
    group.add(wheel);
  }
  if (!ctx.mobile) {
    const ember = new THREE.PointLight(0xff5a18, 0.9, 7, 2);
    ember.position.set(0.2, 1.1, 0.3);
    group.add(ember);
  }
  addStatic(ctx, group, x, 0, z, rotY);
}

/** Mortar pit with sandbag revetment — ridge firebase cue. */
export function addMortarPit(ctx: SceneBuilderContext, x: number, z: number, rotY = 0) {
  const pit = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.12, 14), mat(0x2a2824, 0.98, 0.02));
  floor.position.y = 0.06;
  pit.add(floor);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), mat(0x3a4038, 0.55, 0.45));
  tube.rotation.z = -0.55;
  tube.position.set(0.15, 0.55, 0);
  pit.add(tube);
  for (let i = 0; i < (ctx.mobile ? 4 : 6); i += 1) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), mat(0x7a6848, 0.94, 0.02));
    const angle = (i / (ctx.mobile ? 4 : 6)) * Math.PI * 2;
    bag.position.set(Math.cos(angle) * 1.05, 0.18, Math.sin(angle) * 1.05);
    bag.rotation.y = angle;
    pit.add(bag);
  }
  addStatic(ctx, pit, x, 0, z, rotY);
}
