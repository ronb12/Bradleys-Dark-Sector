/** Urban night village — tight street fight AO. */

import * as THREE from "three";
import {
  makeAmmoCrate,
  makeBuildingShell,
  makeConcertinaWire,
  makeJerseyBarrier,
  makeSandbagWall,
} from "../environment";
import {
  addBattleSmoke,
  addBoundaryWalls,
  addBurnedCar,
  addCover,
  addCraterScars,
  addSpentCasings,
  addStatic,
  addVisual,
  disposeSceneRoot,
  makeAsphaltStrip,
  makeGroundPlane,
  mat,
  type SceneBuilderContext,
} from "./helpers";
import type { CombatSceneSession, SceneBuildOptions } from "./types";

const SPAWN_HALF = 38;
const GROUND_SIZE = 180;

function addStreetBuilding(
  ctx: SceneBuilderContext,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  rotY = 0,
) {
  const shell = makeBuildingShell(ctx.textures, w, d, h, { plaster: true });
  addStatic(ctx, shell, x, 0, z, rotY);
}

function addBulletPocks(ctx: SceneBuilderContext, x: number, z: number, count: number) {
  const pockMat = mat(0x1a1816, 0.98, 0.02);
  for (let i = 0; i < count; i += 1) {
    const pock = new THREE.Mesh(new THREE.CircleGeometry(0.06 + Math.random() * 0.08, 6), pockMat);
    addVisual(
      ctx,
      pock,
      x + (Math.random() - 0.5) * 2.4,
      0.8 + Math.random() * 2.2,
      z + (Math.random() - 0.5) * 1.8,
      Math.random() * Math.PI,
    );
  }
}

function addStreetLamp(ctx: SceneBuilderContext, x: number, z: number, withLight = true) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), mat(0x3a4038, 0.65, 0.4));
  pole.position.y = 2.1;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), mat(0x3a4038, 0.65, 0.4));
  arm.position.set(0.35, 4, 0);
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.28), mat(0xd8d0b8, 0.4, 0.2));
  fixture.position.set(0.75, 3.85, 0);
  const group = new THREE.Group();
  group.add(pole, arm, fixture);
  if (withLight) {
    const light = new THREE.PointLight(0xf0d8a8, ctx.mobile ? 2.4 : 2.8, ctx.mobile ? 18 : 22, 1.5);
    light.position.set(0.75, 3.6, 0);
    group.add(light);
  }
  addVisual(ctx, group, x, 0, z);
}

function addRubblePile(ctx: SceneBuilderContext, x: number, z: number) {
  const pile = new THREE.Group();
  for (let i = 0; i < (ctx.mobile ? 4 : 7); i += 1) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 + Math.random() * 0.8, 0.35 + Math.random() * 0.5, 0.5 + Math.random() * 0.7),
      mat(0x5a5248, 0.95, 0.02),
    );
    chunk.position.set((Math.random() - 0.5) * 1.4, 0.2 + i * 0.12, (Math.random() - 0.5) * 1.4);
    chunk.rotation.y = Math.random() * Math.PI;
    chunk.castShadow = !ctx.mobile;
    pile.add(chunk);
  }
  addStatic(ctx, pile, x, 0, z);
}

function addMarketStall(ctx: SceneBuilderContext, x: number, z: number, rotY: number, destroyed = false) {
  const stall = new THREE.Group();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, destroyed ? 0.35 : 0.9, 1.2),
    mat(destroyed ? 0x3a3028 : 0x6a5038, 0.88, 0.05),
  );
  table.position.y = destroyed ? 0.18 : 0.45;
  table.rotation.z = destroyed ? 0.25 : 0;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.6), mat(0x4a4030, 0.9, 0.02));
  awning.position.y = destroyed ? 0.55 : 1.65;
  awning.rotation.z = destroyed ? -0.35 : 0;
  stall.add(table, awning);
  addStatic(ctx, stall, x, 0, z, rotY);
}

export function buildUrbanNightScene(opts: SceneBuildOptions): CombatSceneSession {
  const root = new THREE.Group();
  root.name = "UrbanNightMap";
  const colliders: THREE.Box3[] = [];
  const ctx: SceneBuilderContext = { root, colliders, textures: opts.textures, mobile: opts.mobile };

  makeGroundPlane(ctx, GROUND_SIZE, 0x2a2824);
  addBoundaryWalls(ctx, SPAWN_HALF + 2, 5, 1.4, 0x4a4840);

  addVisual(ctx, makeAsphaltStrip(8, SPAWN_HALF * 1.7), 0, 0, 0);
  addVisual(ctx, makeAsphaltStrip(6, 28, 0x222018), -14, -4, Math.PI / 2);
  addVisual(ctx, makeAsphaltStrip(6, 24, 0x222018), 14, 6, Math.PI / 2);

  addStreetBuilding(ctx, -18, -10, 10, 8, 7);
  addStreetBuilding(ctx, 18, -8, 9, 7, 8);
  addStreetBuilding(ctx, -20, 12, 11, 9, 6);
  addStreetBuilding(ctx, 20, 14, 10, 8, 7.5);
  addStreetBuilding(ctx, -12, 24, 8, 7, 5.5);
  addStreetBuilding(ctx, 12, -22, 9, 8, 6);
  addStreetBuilding(ctx, 0, -28, 14, 6, 5);

  addBulletPocks(ctx, -18, -10, opts.mobile ? 4 : 8);
  addBulletPocks(ctx, 18, -8, opts.mobile ? 4 : 7);
  addBulletPocks(ctx, -20, 12, opts.mobile ? 3 : 6);

  addMarketStall(ctx, -6, 4, 0.2, true);
  addMarketStall(ctx, 7, -2, -0.15);
  addMarketStall(ctx, -8, -18, Math.PI / 2, true);

  addRubblePile(ctx, 4, 8);
  addRubblePile(ctx, -5, -6);
  addRubblePile(ctx, 10, 18);
  addRubblePile(ctx, -10, 20);
  addRubblePile(ctx, 2, -14);
  addRubblePile(ctx, -14, 6);

  addBurnedCar(ctx, 6, 6, 0.15);
  addBurnedCar(ctx, -9, -14, Math.PI / 2);
  addBurnedCar(ctx, 11, -20, -0.4);

  addCraterScars(ctx, SPAWN_HALF, opts.mobile ? 8 : 14);

  // Sandbag checkpoints and lane control.
  addCover(ctx, makeSandbagWall(opts.textures, 3.2), 0, 10, 0);
  addCover(ctx, makeSandbagWall(opts.textures, 2.8), -3, -12, Math.PI / 2);
  addCover(ctx, makeSandbagWall(opts.textures, 3), 5, 14, Math.PI);
  addCover(ctx, makeSandbagWall(opts.textures, 4.2), 0, -20, 0);
  addCover(ctx, makeSandbagWall(opts.textures, 3.4), -8, 2, Math.PI / 4);
  addCover(ctx, makeJerseyBarrier(opts.textures), -2, 22);
  addCover(ctx, makeJerseyBarrier(opts.textures), 2, -24);
  addCover(ctx, makeJerseyBarrier(opts.textures), -6, -22);
  addCover(ctx, makeJerseyBarrier(opts.textures), 6, 18);
  addCover(ctx, makeAmmoCrate(opts.textures), -14, 2);
  addCover(ctx, makeAmmoCrate(opts.textures), 15, -14);
  addCover(ctx, makeAmmoCrate(opts.textures), -4, 16);

  addSpentCasings(ctx, [
    [0, 9],
    [-2, -11],
    [4, 13],
    [-7, 1],
  ]);

  const wire = makeConcertinaWire(opts.mobile ? 8 : 10, opts.mobile ? 6 : 10);
  addVisual(ctx, wire, 0, 4.8, 20, 0);

  const lampPositions: Array<[number, number]> = opts.mobile
    ? [
        [-4, 0],
        [4, -8],
        [0, -16],
        [-6, 16],
        [6, 12],
      ]
    : [
        [-4, 0],
        [4, -8],
        [-6, 16],
        [6, 12],
        [0, -16],
        [-8, -12],
        [8, 8],
        [0, 14],
      ];
  lampPositions.forEach(([x, z]) => addStreetLamp(ctx, x, z, true));

  addBattleSmoke(ctx, SPAWN_HALF, opts.mobile ? 2 : 3);

  const moon = new THREE.DirectionalLight(0xb8c8e0, 2.15);
  moon.position.set(-16, 28, 10);
  moon.castShadow = !opts.mobile;
  root.add(moon);
  const fill = new THREE.DirectionalLight(0x607080, 0.55);
  fill.position.set(14, 18, -8);
  root.add(fill);
  root.add(new THREE.AmbientLight(0x5a6068, 0.82));
  const streetGlow = new THREE.PointLight(0xc8b890, opts.mobile ? 1.6 : 2.2, 42, 1.4);
  streetGlow.position.set(0, 6, 0);
  root.add(streetGlow);

  return {
    id: "urban",
    root,
    colliders,
    spawnHalf: SPAWN_HALF,
    groundSize: GROUND_SIZE,
    playerStart: { x: 0, z: 28, yaw: Math.PI },
    dispose: () => disposeSceneRoot(root),
  };
}
