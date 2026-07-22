/** Mountain radar outpost — ridge firebase AO. */

import * as THREE from "three";
import {
  makeAmmoCrate,
  makeAntennaMast,
  makeConcertinaWire,
  makeHescoBarrier,
  makeHescoWallLine,
  makeSandbagWall,
  makeShippingContainer,
} from "../environment";
import {
  addBattleSmoke,
  addBoundaryWalls,
  addCover,
  addCraterScars,
  addMortarPit,
  addSpentCasings,
  addStatic,
  addVisual,
  disposeSceneRoot,
  makeGroundPlane,
  makeWall,
  mat,
  type SceneBuilderContext,
} from "./helpers";
import type { CombatSceneSession, SceneBuildOptions } from "./types";

const SPAWN_HALF = 40;
const GROUND_SIZE = 200;

function buildRadarDish(ctx: SceneBuilderContext, x: number, z: number) {
  const group = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 5.5, 8), mat(0x5a6058, 0.55, 0.45));
  mast.position.y = 2.75;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.4, 0.35, 16), mat(0x6a7068, 0.45, 0.55));
  dish.position.set(0, 5.8, 0);
  dish.rotation.x = -0.55;
  group.add(dish);
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), mat(0x4a5048, 0.6, 0.4));
  support.position.set(0, 4.8, 0.6);
  group.add(support);
  // Comms shack at the base.
  const shack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.4), mat(0x4a4840, 0.9, 0.06));
  shack.position.set(2.4, 1, 0);
  group.add(shack);
  const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x20aa40, emissiveIntensity: 1.2 }),
  );
  blink.position.set(2.4, 2.2, 1.22);
  group.add(blink);
  addStatic(ctx, group, x, 0, z);
}

function buildBunker(ctx: SceneBuilderContext, x: number, z: number, rotY = 0) {
  const bunker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 4.5), mat(0x5a5648, 0.92, 0.06));
  body.position.y = 1.1;
  body.castShadow = true;
  bunker.add(body);
  const berm = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 5.5), mat(0x6a5a40, 0.98, 0.02));
  berm.position.y = 0.55;
  bunker.add(berm);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 4.8), mat(0x3a4038, 0.75, 0.35));
  roof.position.y = 2.35;
  bunker.add(roof);
  addStatic(ctx, bunker, x, 0, z, rotY);
}

function buildRockOutcrop(ctx: SceneBuilderContext, x: number, z: number, scale = 1) {
  const rock = new THREE.Group();
  for (let i = 0; i < (ctx.mobile ? 2 : 3); i += 1) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(2.2 * scale, 1.4 * scale, 1.8 * scale),
      mat(0x4a4840, 0.98, 0.02),
    );
    chunk.position.set(i * 0.6 - 0.3, 0.5 * scale + i * 0.2, (i - 1) * 0.4);
    chunk.rotation.y = i * 0.4;
    rock.add(chunk);
  }
  addStatic(ctx, rock, x, 0, z);
}

export function buildMountainOutpostScene(opts: SceneBuildOptions): CombatSceneSession {
  const root = new THREE.Group();
  root.name = "MountainOutpostMap";
  const colliders: THREE.Box3[] = [];
  const ctx: SceneBuilderContext = { root, colliders, textures: opts.textures, mobile: opts.mobile };

  makeGroundPlane(ctx, GROUND_SIZE, 0x4a5048);
  addBoundaryWalls(ctx, SPAWN_HALF + 2, 4.2, 1.3, 0x3a3830);

  buildRockOutcrop(ctx, -24, -18, 1.1);
  buildRockOutcrop(ctx, 26, -14, 0.9);
  buildRockOutcrop(ctx, -20, 22, 1);
  buildRockOutcrop(ctx, 22, 20, 1.15);

  buildBunker(ctx, -12, 0);
  buildBunker(ctx, 12, -6, Math.PI);
  buildBunker(ctx, -6, 18, Math.PI / 2);
  buildRadarDish(ctx, 0, -12);
  addCover(ctx, makeAntennaMast(opts.textures), 8, 16);
  addCover(ctx, makeAntennaMast(opts.textures), -10, -16);
  addCover(ctx, makeShippingContainer(opts.textures, 5.5, 2.4, 2.3), -16, 10, Math.PI / 2);
  addCover(ctx, makeShippingContainer(opts.textures, 5.5, 2.4, 2.3), 16, 8, -Math.PI / 2);
  addCover(ctx, makeShippingContainer(opts.textures, 4.8, 2.4, 2.3), 0, 24, 0);

  addCover(ctx, makeSandbagWall(opts.textures, 4.2), 0, 8, 0);
  addCover(ctx, makeSandbagWall(opts.textures, 3.6), -8, -8, Math.PI / 2);
  addCover(ctx, makeSandbagWall(opts.textures, 3.6), 8, -2, -Math.PI / 2);
  addCover(ctx, makeSandbagWall(opts.textures, 5), 0, 22, Math.PI);
  addCover(ctx, makeSandbagWall(opts.textures, 4), -14, 6, 0.4);
  addCover(ctx, makeSandbagWall(opts.textures, 3.8), 14, 2, -0.3);

  (
    [
      [-24, -8],
      [24, -8],
      [-24, 12],
      [24, 12],
      [-18, -18],
      [18, 16],
    ] as Array<[number, number]>
  ).forEach(([x, z]) => addCover(ctx, makeHescoBarrier(opts.textures), x, z));

  addCover(ctx, makeHescoWallLine(opts.textures, opts.mobile ? 3 : 4), -20, 20, Math.PI / 2);
  addCover(ctx, makeHescoWallLine(opts.textures, opts.mobile ? 3 : 4), 20, 20, -Math.PI / 2);

  addMortarPit(ctx, -4, 12);
  addMortarPit(ctx, 6, -10, Math.PI / 4);

  addCover(ctx, makeAmmoCrate(opts.textures), -6, 14);
  addCover(ctx, makeAmmoCrate(opts.textures), 6, 18);
  addCover(ctx, makeAmmoCrate(opts.textures), -2, -14);
  addCover(ctx, makeAmmoCrate(opts.textures), 10, 10);
  addCover(ctx, makeAmmoCrate(opts.textures), -10, -4);
  addStatic(ctx, makeWall(3, 1.8, 2.2, 0x5a5848), -4, 0.9, 24);

  addSpentCasings(ctx, [
    [0, 7],
    [-7, -7],
    [7, -1],
    [-3, 11],
    [5, 17],
  ]);

  const wireNorth = makeConcertinaWire(opts.mobile ? 12 : 16, opts.mobile ? 8 : 12);
  addVisual(ctx, wireNorth, 0, 4.2, -28);

  addCraterScars(ctx, SPAWN_HALF, opts.mobile ? 6 : 12);
  addBattleSmoke(ctx, SPAWN_HALF, opts.mobile ? 1 : 3);

  const ridge = new THREE.DirectionalLight(0xc8d0d8, 1.75);
  ridge.position.set(8, 32, -18);
  ridge.castShadow = !opts.mobile;
  root.add(ridge);
  root.add(new THREE.AmbientLight(0x5a6068, 0.52));

  return {
    id: "mountain",
    root,
    colliders,
    spawnHalf: SPAWN_HALF,
    groundSize: GROUND_SIZE,
    playerStart: { x: 0, z: 30, yaw: Math.PI },
    dispose: () => disposeSceneRoot(root),
  };
}
