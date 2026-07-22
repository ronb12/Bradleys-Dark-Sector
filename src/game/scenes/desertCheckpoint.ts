/** Desert convoy checkpoint — open road ambush AO. */

import * as THREE from "three";
import {
  makeAmmoCrate,
  makeConcertinaWire,
  makeFuelTank,
  makeHescoBarrier,
  makeHescoWallLine,
  makeJerseyBarrier,
  makeSandbagWall,
  makeWatchTower,
} from "../environment";
import {
  addBattleSmoke,
  addBoundaryWalls,
  addCover,
  addCraterScars,
  addSpentCasings,
  addStatic,
  addVehicleWreck,
  addVisual,
  disposeSceneRoot,
  makeAsphaltStrip,
  makeGroundPlane,
  makeWall,
  mat,
  type SceneBuilderContext,
} from "./helpers";
import type { CombatSceneSession, SceneBuildOptions } from "./types";

const SPAWN_HALF = 42;
const GROUND_SIZE = 200;

function buildCheckpointBooth(ctx: SceneBuilderContext, x: number, z: number) {
  const booth = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 2.2), mat(0x8a8478, 0.9, 0.05));
  base.position.y = 1.2;
  base.castShadow = true;
  booth.add(base);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 2.6), mat(0x3a4038, 0.7, 0.35));
  roof.position.y = 2.55;
  booth.add(roof);
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x6a9088, emissive: 0x2a5048, emissiveIntensity: 0.8, roughness: 0.35 }),
  );
  window.position.set(0, 1.35, -1.14);
  booth.add(window);
  addStatic(ctx, booth, x, 0, z);
}

export function buildDesertCheckpointScene(opts: SceneBuildOptions): CombatSceneSession {
  const root = new THREE.Group();
  root.name = "DesertCheckpointMap";
  const colliders: THREE.Box3[] = [];
  const ctx: SceneBuilderContext = { root, colliders, textures: opts.textures, mobile: opts.mobile };

  makeGroundPlane(ctx, GROUND_SIZE, 0xc4a878);
  addBoundaryWalls(ctx, SPAWN_HALF + 2, 3.8, 1.2, 0x9a8868);

  addVisual(ctx, makeAsphaltStrip(10, SPAWN_HALF * 1.6), 0, 0, 0);
  addVisual(ctx, makeAsphaltStrip(14, 22, 0x252820), 0, -18, 0);
  addVisual(ctx, makeAsphaltStrip(8, 18, 0x2a2820), -16, 8, Math.PI / 2);

  buildCheckpointBooth(ctx, 0, -8);

  // Convoy ambush — multiple burning wrecks blocking the kill zone.
  addVehicleWreck(ctx, -12, 6, 0.35);
  addVehicleWreck(ctx, 14, 10, -0.5);
  addVehicleWreck(ctx, -8, 22, 1.1);
  addVehicleWreck(ctx, 6, -4, -0.2, { scale: 0.92 });
  addVehicleWreck(ctx, -20, -6, 0.8);
  addVehicleWreck(ctx, 18, 24, -0.65, { burning: false });

  addCraterScars(ctx, SPAWN_HALF, opts.mobile ? 14 : 26);

  // Fighting positions along the road and flanks.
  addCover(ctx, makeSandbagWall(opts.textures, 4.5), -6, 2, 0);
  addCover(ctx, makeSandbagWall(opts.textures, 3.8), 8, 4, Math.PI);
  addCover(ctx, makeSandbagWall(opts.textures, 4), -10, 16, Math.PI / 2);
  addCover(ctx, makeSandbagWall(opts.textures, 3.6), 10, 18, -Math.PI / 2);
  addCover(ctx, makeSandbagWall(opts.textures, 5.2), 0, 12, 0);
  addCover(ctx, makeSandbagWall(opts.textures, 4.4), -4, -16, Math.PI);
  addCover(ctx, makeSandbagWall(opts.textures, 3.8), 12, -8, -Math.PI / 2);
  addCover(ctx, makeJerseyBarrier(opts.textures), -4, -14);
  addCover(ctx, makeJerseyBarrier(opts.textures), 4, -14);
  addCover(ctx, makeJerseyBarrier(opts.textures), 0, 28);
  addCover(ctx, makeJerseyBarrier(opts.textures), -14, 0);
  addCover(ctx, makeJerseyBarrier(opts.textures), 14, 4);

  (
    [
      [-28, -24],
      [28, -24],
      [-28, 24],
      [28, 24],
      [-18, 0],
      [18, 0],
      [-22, 14],
      [22, -12],
      [0, -22],
    ] as Array<[number, number]>
  ).forEach(([x, z]) => addCover(ctx, makeHescoBarrier(opts.textures), x, z));

  // HESCO berms sealing the checkpoint lane.
  addCover(ctx, makeHescoWallLine(opts.textures, opts.mobile ? 3 : 5), -10, -10, Math.PI / 2);
  addCover(ctx, makeHescoWallLine(opts.textures, opts.mobile ? 3 : 4), 10, -10, -Math.PI / 2);

  if (!opts.mobile) {
    addCover(ctx, makeWatchTower(opts.textures), -32, -10);
    addCover(ctx, makeWatchTower(opts.textures), 32, 12);
  } else {
    addStatic(ctx, makeWall(2.2, 5.5, 2.2, 0x6a6358), -32, 2.75, -10);
    addStatic(ctx, makeWall(2.2, 5.5, 2.2, 0x6a6358), 32, 2.75, 12);
  }

  addCover(ctx, makeFuelTank(opts.textures), -22, -12);
  addCover(ctx, makeFuelTank(opts.textures), 22, -8);
  addCover(ctx, makeAmmoCrate(opts.textures), -14, -20);
  addCover(ctx, makeAmmoCrate(opts.textures), 16, 20);
  addCover(ctx, makeAmmoCrate(opts.textures), -6, 18);
  addCover(ctx, makeAmmoCrate(opts.textures), 8, -18);

  addSpentCasings(ctx, [
    [-5, 3],
    [7, 5],
    [0, 11],
    [-9, 15],
    [11, -6],
    [-16, -4],
  ]);

  // Concertina at the checkpoint mouth (visual).
  const wire = makeConcertinaWire(opts.mobile ? 10 : 14, opts.mobile ? 8 : 12);
  addVisual(ctx, wire, 0, 5.1, -12, 0);

  addBattleSmoke(ctx, SPAWN_HALF, opts.mobile ? 2 : 4);

  const sun = new THREE.DirectionalLight(0xffe8c8, 2.4);
  sun.position.set(22, 38, 14);
  sun.castShadow = !opts.mobile;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
  }
  root.add(sun);
  root.add(new THREE.AmbientLight(0xc8b898, 0.55));

  return {
    id: "desert",
    root,
    colliders,
    spawnHalf: SPAWN_HALF,
    groundSize: GROUND_SIZE,
    playerStart: { x: 0, z: 32, yaw: Math.PI },
    dispose: () => disposeSceneRoot(root),
  };
}
