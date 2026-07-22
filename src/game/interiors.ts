/**
 * Combat-ready building interiors — CQB cover, workbenches, racks, and
 * hazard marking inside every compound shell. Relies on emissive fixtures
 * (not extra PointLights) so Quest/medium graphics stay within the light budget.
 */

import * as THREE from "three";
import { DestructionSystem } from "./destruction";
import {
  createFallbackEnvTextures,
  makeAmmoCrate,
  makeHescoBarrier,
  makeSandbagWall,
  type EnvTextures,
} from "./environment";

export type BuildingFootprint = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: "warehouse" | "hangar" | "annex" | "intel";
};

/** Same footprints as addEnvironment shells — doorway faces -Z. */
export const COMPOUND_BUILDINGS: BuildingFootprint[] = [
  { x: -48, z: -14, w: 12, d: 20, h: 8, kind: "warehouse" },
  { x: 48, z: -12, w: 13, d: 22, h: 9, kind: "intel" }, // Warehouse Alpha
  { x: -48, z: 34, w: 13, d: 18, h: 7, kind: "warehouse" },
  { x: 48, z: 34, w: 12, d: 19, h: 8, kind: "warehouse" },
  { x: 0, z: -48, w: 20, d: 12, h: 6, kind: "hangar" },
  { x: -48, z: 8, w: 10, d: 10, h: 6, kind: "annex" },
  { x: 48, z: 8, w: 10, d: 10, h: 6, kind: "annex" },
  { x: -28, z: -46, w: 9, d: 10, h: 5, kind: "annex" },
  { x: 28, z: -46, w: 9, d: 10, h: 5, kind: "annex" },
];

function mat(color: number, roughness = 0.88, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addCollider(colliders: THREE.Box3[], obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(obj));
}

function place(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  obj: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  collide = true,
) {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  scene.add(obj);
  if (collide) addCollider(colliders, obj);
  return obj;
}

function makeFloorMarkings(w: number, d: number, tint: number, textures: EnvTextures) {
  const group = new THREE.Group();
  const floorMap = textures.concrete.clone();
  floorMap.wrapS = THREE.RepeatWrapping;
  floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(Math.max(2, w / 3), Math.max(2, d / 3));
  floorMap.needsUpdate = true;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.6, 0.04, d - 0.6),
    new THREE.MeshStandardMaterial({ map: floorMap, color: tint, roughness: 0.96, metalness: 0.02 }),
  );
  floor.position.y = 0.24;
  floor.receiveShadow = true;
  group.add(floor);

  const hazard = mat(0xd4a017, 0.72, 0.12);
  // Doorway threshold stripes
  for (let i = -2; i <= 2; i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.9), hazard);
    stripe.position.set(i * 0.55, 0.27, -d / 2 + 1.1);
    group.add(stripe);
  }
  // Center aisle dashed line
  const dashes = Math.max(3, Math.floor(d / 2.4));
  for (let i = 0; i < dashes; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.7), hazard);
    dash.position.set(0, 0.265, -d / 2 + 2.2 + i * 2.2);
    group.add(dash);
  }
  return group;
}

function makeCeilingFixture(color: number, emissive: number) {
  const group = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 0.42), mat(0x2a2e2a, 0.55, 0.45));
  // MeshBasic so fixtures still read after PointLights are culled.
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.32),
    new THREE.MeshBasicMaterial({ color: emissive }),
  );
  lens.position.y = -0.09;
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.1),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  spill.rotation.x = Math.PI / 2;
  spill.position.y = -0.55;
  group.add(housing, lens, spill);
  return group;
}

/** Large unlit ceiling wash — primary indoor illumination without PointLights. */
function makeCeilingWash(w: number, d: number, color: number, opacity = 0.14) {
  const group = new THREE.Group();
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.72, d * 0.72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  wash.rotation.x = Math.PI / 2;
  group.add(wash);
  // Pair of industrial lamp housings for silhouette.
  for (const ox of [-w * 0.18, w * 0.18]) {
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), mat(0x303430, 0.5, 0.5));
    cage.position.set(ox, -0.12, 0);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    bulb.position.set(ox, -0.28, 0);
    group.add(cage, bulb);
  }
  return group;
}

function makeWallPanels(w: number, d: number, h: number, tint: number, textures: EnvTextures) {
  const group = new THREE.Group();
  const wallMap = textures.plaster.clone();
  wallMap.wrapS = THREE.RepeatWrapping;
  wallMap.wrapT = THREE.RepeatWrapping;
  wallMap.repeat.set(Math.max(1.5, w / 4), Math.max(1.2, h / 3));
  wallMap.needsUpdate = true;
  const panelMat = new THREE.MeshStandardMaterial({
    map: wallMap,
    color: tint,
    roughness: 0.92,
    metalness: 0.04,
  });
  const bandMat = mat(0x3a3e38, 0.85, 0.15);
  // Back wall lining (north)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.0, h * 0.75), panelMat);
  back.position.set(0, h * 0.42, d / 2 - 0.55);
  back.rotation.y = Math.PI;
  group.add(back);
  // Side linings
  for (const side of [-1, 1]) {
    const sideMap = wallMap.clone();
    sideMap.repeat.set(Math.max(1.5, d / 4), Math.max(1.2, h / 3));
    sideMap.needsUpdate = true;
    const sideMat = panelMat.clone();
    sideMat.map = sideMap;
    const sidePanel = new THREE.Mesh(new THREE.PlaneGeometry(d - 1.2, h * 0.7), sideMat);
    sidePanel.position.set(side * (w / 2 - 0.55), h * 0.4, 0);
    sidePanel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(sidePanel);
  }
  // Perimeter wainscot only — not a solid room-filling slab.
  const strips: Array<[number, number, number, number, number]> = [
    [w - 1.0, 0.4, 0.18, 0, d / 2 - 0.62],
    [w - 1.0, 0.4, 0.18, 0, -d / 2 + 0.62],
    [0.18, 0.4, d - 1.4, -w / 2 + 0.55, 0],
    [0.18, 0.4, d - 1.4, w / 2 - 0.55, 0],
  ];
  for (const [bw, bh, bd, bx, bz] of strips) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bandMat);
    band.position.set(bx, 0.45, bz);
    group.add(band);
  }
  // Hazard stencil on back wall
  const stencil = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xd4a017 }),
  );
  stencil.position.set(0, h * 0.55, d / 2 - 0.56);
  stencil.rotation.y = Math.PI;
  group.add(stencil);
  return group;
}

function makeWorkBench() {
  const group = new THREE.Group();
  const metal = mat(0x3a403c, 0.55, 0.55);
  const wood = mat(0x5a4630, 0.9, 0.05);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.85), wood);
  top.position.y = 0.92;
  top.castShadow = true;
  group.add(top);
  for (const lx of [-0.95, 0.95]) {
    for (const lz of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), metal);
      leg.position.set(lx, 0.45, lz);
      group.add(leg);
    }
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.7), metal);
  shelf.position.y = 0.38;
  group.add(shelf);
  const tool = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.22), mat(0x6a7058, 0.7, 0.3));
  tool.position.set(0.4, 1.02, 0.1);
  group.add(tool);
  return group;
}

function makeServerRack() {
  const group = new THREE.Group();
  const frame = mat(0x2a3034, 0.5, 0.55);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.05, 0.85), frame);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  for (let i = 0; i < 5; i += 1) {
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, 0.78),
      mat(i % 2 === 0 ? 0x1e2428 : 0x243038, 0.45, 0.4),
    );
    tray.position.set(0, 0.35 + i * 0.35, 0);
    group.add(tray);
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x6dffb0,
        emissive: 0x2a8a58,
        emissiveIntensity: 1.6,
        roughness: 0.4,
      }),
    );
    led.position.set(0.28, 0.35 + i * 0.35, 0.42);
    group.add(led);
  }
  return group;
}

function makeMetalDesk() {
  const group = new THREE.Group();
  const metal = mat(0x4a5048, 0.6, 0.45);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.75), metal);
  top.position.y = 0.78;
  top.castShadow = true;
  group.add(top);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.65), mat(0x353a36, 0.7, 0.25));
  pedestal.position.set(-0.5, 0.35, 0);
  group.add(pedestal);
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.06), mat(0x1a1e22, 0.4, 0.3));
  monitor.position.set(0.2, 1.05, -0.1);
  group.add(monitor);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.32, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x6ad4c0,
      emissive: 0x1a5a4a,
      emissiveIntensity: 1.1,
      roughness: 0.35,
    }),
  );
  screen.position.set(0.2, 1.05, -0.06);
  group.add(screen);
  return group;
}

function makeBarrel() {
  const group = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.38, 1.05, 12),
    mat(0x4a5a38, 0.55, 0.35),
  );
  drum.position.y = 0.55;
  drum.castShadow = true;
  group.add(drum);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.035, 6, 16),
    mat(0x888880, 0.4, 0.7),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.55;
  group.add(band);
  const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.04), mat(0xd4a017, 0.65, 0.15));
  hazard.position.set(0, 0.75, 0.37);
  group.add(hazard);
  return group;
}

function makeCrateStack(textures: EnvTextures, tiers = 2) {
  const group = new THREE.Group();
  for (let t = 0; t < tiers; t += 1) {
    const crate = makeAmmoCrate(textures);
    crate.position.y = t * 0.72;
    crate.rotation.y = t * 0.15;
    group.add(crate);
  }
  return group;
}

function makePalletLoad() {
  const group = new THREE.Group();
  const wood = mat(0x6a5638, 0.92, 0.04);
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.1), wood);
  pallet.position.y = 0.08;
  pallet.castShadow = true;
  group.add(pallet);
  for (let i = 0; i < 3; i += 1) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.9), mat(0x5a4a32, 0.88, 0.05));
    box.position.set((i - 1) * 0.08, 0.42 + i * 0.55, (i % 2) * 0.05);
    box.castShadow = true;
    group.add(box);
  }
  return group;
}

function makePartialWall(w: number, h: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.28), mat(0x4a4740, 0.94, 0.03));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeWallSkirt(w: number, d: number) {
  const group = new THREE.Group();
  const trim = mat(0x2e322c, 0.9, 0.08);
  const strips: Array<[number, number, number, number]> = [
    [w - 0.9, 0.28, 0, d / 2 - 0.55],
    [w - 0.9, 0.28, 0, -d / 2 + 0.55],
    [0.22, 0.28, -w / 2 + 0.45, 0],
    [0.22, 0.28, w / 2 - 0.45, 0],
  ];
  for (const [sw, sh, sx, sz] of strips) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sw === 0.22 ? 0.22 : sw, sh, sw === 0.22 ? d - 1.2 : 0.22),
      trim,
    );
    mesh.position.set(sx, 0.35, sz);
    group.add(mesh);
  }
  return group;
}

function registerCrate(
  destruction: DestructionSystem,
  colliders: THREE.Box3[],
  mesh: THREE.Object3D,
  health = 70,
) {
  mesh.updateMatrixWorld(true);
  const collider = new THREE.Box3().setFromObject(mesh);
  colliders.push(collider);
  // Prefer registering a Mesh leaf for destruction FX.
  let target: THREE.Mesh | null = null;
  mesh.traverse((c) => {
    if (!target && c instanceof THREE.Mesh) target = c;
  });
  if (target) destruction.register({ mesh: target, collider, health, kind: "crate" });
}

function decorateSharedBase(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures,
  b: BuildingFootprint,
  floorTint: number,
  fixtureColor: number,
  fixtureEmissive: number,
  wallTint = 0x5a564c,
) {
  const { x, z, w, d, h } = b;
  place(scene, colliders, makeFloorMarkings(w, d, floorTint, textures), x, 0, z, 0, false);
  place(scene, colliders, makeWallSkirt(w, d), x, 0, z, 0, false);
  place(scene, colliders, makeWallPanels(w, d, h, wallTint, textures), x, 0, z, 0, false);
  place(scene, colliders, makeCeilingWash(w, d, fixtureColor, 0.16), x, h * 0.78, z, 0, false);

  // Ceiling fixtures — emissive / MeshBasic only (no new PointLights).
  const fixtureCount = h >= 7 ? 3 : 2;
  for (let i = 0; i < fixtureCount; i += 1) {
    const fz = z - d * 0.28 + i * (d * 0.28);
    const fixture = makeCeilingFixture(fixtureColor, fixtureEmissive);
    place(scene, colliders, fixture, x, h * 0.82, fz, 0, false);
    if (i === 1) {
      destruction.register({
        mesh: fixture.children[0] as THREE.Mesh,
        collider: null,
        health: 16,
        kind: "light",
      });
    }
  }

  // Doorway sandbag fighting positions (flanking the open entrance).
  place(
    scene,
    colliders,
    makeSandbagWall(textures, Math.min(2.6, w * 0.28)),
    x - w * 0.28,
    0,
    z - d / 2 + 1.6,
    0.15,
  );
  place(
    scene,
    colliders,
    makeSandbagWall(textures, Math.min(2.6, w * 0.28)),
    x + w * 0.28,
    0,
    z - d / 2 + 1.6,
    -0.15,
  );

  // Low crate cover near entrance.
  const leftCrate = makeCrateStack(textures, 1);
  place(scene, colliders, leftCrate, x - w * 0.22, 0, z - d / 2 + 3.2, 0.2, false);
  registerCrate(destruction, colliders, leftCrate, 65);
  const rightCrate = makeAmmoCrate(textures);
  place(scene, colliders, rightCrate, x + w * 0.2, 0, z - d / 2 + 2.8, -0.35, false);
  registerCrate(destruction, colliders, rightCrate, 60);
}

function decorateWarehouse(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures,
  b: BuildingFootprint,
) {
  decorateSharedBase(scene, colliders, destruction, textures, b, 0x6a6458, 0xc9e8dc, 0x6a9a80, 0x8a8478);
  const { x, z, w, d } = b;

  // Mid-bay divider with flanking gaps (CQB lanes).
  const divider = makePartialWall(w * 0.48, 2.8);
  place(scene, colliders, divider, x, 1.4, z + d * 0.05, 0);
  place(scene, colliders, makeSandbagWall(textures, 2.2), x, 0, z - 0.8, 0);

  // Pallet stacks along back wall.
  place(scene, colliders, makePalletLoad(), x - w * 0.28, 0, z + d / 2 - 2.0, 0.1);
  place(scene, colliders, makePalletLoad(), x + w * 0.22, 0, z + d / 2 - 2.2, -0.2);
  const bayStack = makeCrateStack(textures, 2);
  place(scene, colliders, bayStack, x + w * 0.3, 0, z + 0.5, 0.4, false);
  registerCrate(destruction, colliders, bayStack, 80);

  place(scene, colliders, makeWorkBench(), x - w * 0.25, 0, z - 1.5, Math.PI / 2);
  place(scene, colliders, makeBarrel(), x + w * 0.32, 0, z - d * 0.15, 0.3);
  place(scene, colliders, makeBarrel(), x + w * 0.32, 0, z - d * 0.15 + 0.85, -0.2);
  place(scene, colliders, makeHescoBarrier(textures), x - w * 0.3, 0, z + d * 0.22, 0.1);
}

function decorateIntelWarehouse(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures,
  b: BuildingFootprint,
) {
  decorateSharedBase(scene, colliders, destruction, textures, b, 0x626058, 0xb8f0e0, 0x4a8a70, 0x7a7870);
  const { x, z, w, d } = b;

  // Loading bay ↔ intel room divider (matches mission room markers).
  // Keep ~2.5m flanking gaps on both sides for CQB pathing.
  const divider = makePartialWall(w * 0.48, 3.2);
  place(scene, colliders, divider, x, 1.6, z, 0);

  // Loading bay (south / toward door).
  place(scene, colliders, makePalletLoad(), x - w * 0.28, 0, z - d * 0.28, 0.12);
  place(scene, colliders, makePalletLoad(), x + w * 0.25, 0, z - d * 0.32, -0.18);
  place(scene, colliders, makeWorkBench(), x - w * 0.2, 0, z - d * 0.12, Math.PI / 2);
  place(scene, colliders, makeBarrel(), x + w * 0.3, 0, z - d * 0.18, 0.4);
  // Cover on the south side of the divider — does not seal flanks.
  place(scene, colliders, makeSandbagWall(textures, 2.2), x, 0, z - 1.4, 0);

  // Intel room (north).
  place(scene, colliders, makeServerRack(), x - w * 0.28, 0, z + d * 0.22, 0.05);
  place(scene, colliders, makeServerRack(), x - w * 0.28 + 0.85, 0, z + d * 0.22, -0.05);
  place(scene, colliders, makeMetalDesk(), x + w * 0.18, 0, z + d * 0.18, Math.PI);
  place(scene, colliders, makeMetalDesk(), x + w * 0.18, 0, z + d * 0.32, Math.PI);
  const intelCrate = makeCrateStack(textures, 1);
  place(scene, colliders, intelCrate, x + w * 0.3, 0, z + d * 0.08, 0.5, false);
  registerCrate(destruction, colliders, intelCrate, 55);

  // Extra intel status glow (MeshBasic — survives light culling).
  const status = makeCeilingFixture(0x9dffd0, 0x2a8a68);
  place(scene, colliders, status, x, 3.75, z + d * 0.2, 0, false);
  destruction.register({
    mesh: status.children[0] as THREE.Mesh,
    collider: null,
    health: 18,
    kind: "light",
  });
  const intelWash = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 4.5),
    new THREE.MeshBasicMaterial({
      color: 0x6ad4b0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  intelWash.rotation.x = Math.PI / 2;
  place(scene, colliders, intelWash, x, 3.5, z + d * 0.2, 0, false);

  // North window pane (breakable).
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fc4bf,
    emissive: 0x315e58,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.66,
  });
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 0.08), glassMat);
  windowMesh.position.set(x, 2.5, z + d / 2 - 0.35);
  scene.add(windowMesh);
  const windowCollider = new THREE.Box3().setFromObject(windowMesh);
  colliders.push(windowCollider);
  destruction.register({ mesh: windowMesh, collider: windowCollider, health: 25, kind: "window" });
}

function decorateHangar(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures,
  b: BuildingFootprint,
) {
  decorateSharedBase(scene, colliders, destruction, textures, b, 0x6a5e48, 0xf0d4a0, 0xd49840, 0x8a7a60);
  const { x, z, w, d } = b;

  // Wide bay feel — crates along both long walls, center clear for escort path.
  place(scene, colliders, makePalletLoad(), x - w * 0.35, 0, z - 1.5, 0.1);
  place(scene, colliders, makePalletLoad(), x - w * 0.35, 0, z + 1.8, -0.15);
  place(scene, colliders, makePalletLoad(), x + w * 0.32, 0, z - 0.5, 0.2);
  const hangarStack = makeCrateStack(textures, 2);
  place(scene, colliders, hangarStack, x + w * 0.35, 0, z + 2.0, -0.3, false);
  registerCrate(destruction, colliders, hangarStack, 75);

  place(scene, colliders, makeSandbagWall(textures, 3.4), x - 3.5, 0, z + d / 2 - 2.2, Math.PI / 2);
  place(scene, colliders, makeSandbagWall(textures, 3.4), x + 3.5, 0, z + d / 2 - 2.2, -Math.PI / 2);
  place(scene, colliders, makeWorkBench(), x + w * 0.28, 0, z - d * 0.15, -Math.PI / 2);
  place(scene, colliders, makeBarrel(), x - w * 0.38, 0, z + 0.2, 0.2);
  place(scene, colliders, makeBarrel(), x - w * 0.38, 0, z + 1.0, -0.4);
  place(scene, colliders, makeHescoBarrier(textures), x, 0, z + d / 2 - 2.5, 0);

  // Warm bay accent without PointLights.
  const fixture = makeCeilingFixture(0xffd090, 0xb86820);
  place(scene, colliders, fixture, x, 3.35, z, 0, false);
  destruction.register({
    mesh: fixture.children[0] as THREE.Mesh,
    collider: null,
    health: 16,
    kind: "light",
  });
  const bayWash = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 5),
    new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  bayWash.rotation.x = Math.PI / 2;
  place(scene, colliders, bayWash, x, 3.2, z, 0, false);
}

function decorateAnnex(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures,
  b: BuildingFootprint,
) {
  decorateSharedBase(scene, colliders, destruction, textures, b, 0x5a5650, 0xd0e8e0, 0x5a8070, 0x7a766c);
  const { x, z, w, d } = b;

  place(scene, colliders, makeMetalDesk(), x - w * 0.2, 0, z + d * 0.15, Math.PI);
  place(scene, colliders, makeWorkBench(), x + w * 0.18, 0, z - d * 0.05, -Math.PI / 2);
  place(scene, colliders, makeBarrel(), x + w * 0.28, 0, z + d * 0.2, 0.25);
  const stack = makeCrateStack(textures, 2);
  place(scene, colliders, stack, x - w * 0.25, 0, z - d * 0.15, 0.35, false);
  registerCrate(destruction, colliders, stack, 70);
  place(scene, colliders, makeSandbagWall(textures, 2.0), x, 0, z + d * 0.05, 0.1);
}

/**
 * Fill every compound building with combat interiors.
 * Safe to call once after shells exist. Does not seal doorways.
 */
export function decorateCompoundInteriors(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  destruction: DestructionSystem,
  textures: EnvTextures = createFallbackEnvTextures(),
) {
  for (const b of COMPOUND_BUILDINGS) {
    switch (b.kind) {
      case "intel":
        decorateIntelWarehouse(scene, colliders, destruction, textures, b);
        break;
      case "hangar":
        decorateHangar(scene, colliders, destruction, textures, b);
        break;
      case "annex":
        decorateAnnex(scene, colliders, destruction, textures, b);
        break;
      default:
        decorateWarehouse(scene, colliders, destruction, textures, b);
        break;
    }
  }
}
