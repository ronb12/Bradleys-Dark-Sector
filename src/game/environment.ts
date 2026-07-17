/** Textured compound upgrade — Poly Haven materials + military props. */

import * as THREE from "three";

export type EnvTextures = {
  concrete: THREE.Texture;
  asphalt: THREE.Texture;
  brick: THREE.Texture;
  metal: THREE.Texture;
  plaster: THREE.Texture;
  wood: THREE.Texture;
  corrugated: THREE.Texture;
  paint: THREE.Texture;
  patternedBrick: THREE.Texture;
};

const TEX_URLS = {
  concrete: "/textures/concrete.jpg",
  asphalt: "/textures/asphalt.jpg",
  brick: "/textures/brick.jpg",
  metal: "/textures/metal.jpg",
  plaster: "/textures/plaster.jpg",
  wood: "/textures/wood.jpg",
  corrugated: "/textures/corrugated.jpg",
  paint: "/textures/paint.jpg",
  patternedBrick: "/textures/patterned-brick.jpg",
};

function prepTexture(tex: THREE.Texture, repeatX: number, repeatY: number) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

export function loadEnvironmentTextures(): Promise<EnvTextures> {
  const loader = new THREE.TextureLoader();
  const load = (url: string, rx: number, ry: number) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(url, (tex) => resolve(prepTexture(tex, rx, ry)), undefined, reject);
    });

  return Promise.all([
    load(TEX_URLS.concrete, 4, 4),
    load(TEX_URLS.asphalt, 6, 6),
    load(TEX_URLS.brick, 3, 2),
    load(TEX_URLS.metal, 2, 2),
    load(TEX_URLS.plaster, 3, 2),
    load(TEX_URLS.wood, 2, 2),
    load(TEX_URLS.corrugated, 3, 2),
    load(TEX_URLS.paint, 2, 2),
    load(TEX_URLS.patternedBrick, 2.5, 2),
  ]).then(([concrete, asphalt, brick, metal, plaster, wood, corrugated, paint, patternedBrick]) => ({
    concrete,
    asphalt,
    brick,
    metal,
    plaster,
    wood,
    corrugated,
    paint,
    patternedBrick,
  }));
}

/** Immediate solid-color stand-ins so combat cover exists before texture IO finishes. */
export function createFallbackEnvTextures(): EnvTextures {
  const solid = (hex: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 4, 4);
    }
    return prepTexture(new THREE.CanvasTexture(canvas), 1, 1);
  };
  return {
    concrete: solid("#9a8f78"),
    asphalt: solid("#3a3a3a"),
    brick: solid("#7a5a48"),
    metal: solid("#6a6e68"),
    plaster: solid("#b8b0a0"),
    wood: solid("#8a6a40"),
    corrugated: solid("#4a5048"),
    paint: solid("#5a6a58"),
    patternedBrick: solid("#6a5040"),
  };
}

function matFromTex(map: THREE.Texture, roughness: number, metalness: number, tint = 0xffffff) {
  return new THREE.MeshStandardMaterial({ map, color: tint, roughness, metalness });
}

function cloneMap(tex: THREE.Texture, rx: number, ry: number) {
  const map = tex.clone();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(rx, ry);
  map.needsUpdate = true;
  return map;
}

export function makeSandbagWall(textures: EnvTextures, width = 3.2, height = 1.1) {
  const group = new THREE.Group();
  const bagMat = matFromTex(textures.concrete, 0.95, 0.02, 0xb8a878);
  const rows = 3;
  const cols = Math.max(2, Math.floor(width / 0.7));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.32, 0.42), bagMat);
      bag.position.set((c - (cols - 1) / 2) * 0.7 + (r % 2) * 0.2, 0.18 + r * 0.3, 0);
      bag.rotation.y = (Math.random() - 0.5) * 0.08;
      bag.castShadow = true;
      bag.receiveShadow = true;
      group.add(bag);
    }
  }
  group.userData.coverHeight = height;
  return group;
}

export function makeJerseyBarrier(textures: EnvTextures) {
  const mat = matFromTex(textures.concrete, 0.92, 0.04, 0xd0c8b0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.05, 0.55), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.35), mat);
  top.position.y = 0.55;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 0.08, 0.56),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7, metalness: 0.1 })
  );
  stripe.position.y = 0.35;
  const group = new THREE.Group();
  mesh.position.y = 0.52;
  group.add(mesh, top, stripe);
  return group;
}

export function makeWatchTower(textures: EnvTextures) {
  const metal = matFromTex(textures.metal, 0.55, 0.55, 0x6a736c);
  const wood = matFromTex(textures.wood, 0.9, 0.05, 0x8a7350);
  const paint = matFromTex(textures.paint, 0.7, 0.35, 0x5a6a58);
  const group = new THREE.Group();
  for (const lx of [-1.2, 1.2]) {
    for (const lz of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7.2, 0.18), metal);
      leg.position.set(lx, 3.6, lz);
      leg.castShadow = true;
      group.add(leg);
      // Cross bracing
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.5), metal);
      brace.position.set(lx * 0.5, 3.2, 0);
      brace.rotation.y = lz > 0 ? 0.4 : -0.4;
      group.add(brace);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 3.4), wood);
  deck.position.y = 7.1;
  deck.castShadow = true;
  group.add(deck);
  // Railings
  for (const [dx, dz] of [
    [0, 1.55],
    [0, -1.55],
    [1.55, 0],
    [-1.55, 0],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(dz === 0 ? 0.1 : 3.2, 0.55, dx === 0 ? 0.1 : 3.2), metal);
    rail.position.set(dx, 7.45, dz);
    group.add(rail);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.6), paint);
  cabin.position.y = 8.15;
  cabin.castShadow = true;
  group.add(cabin);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xc8e8ff,
    emissive: 0x4a7a90,
    emissiveIntensity: 0.85,
    roughness: 0.35,
    metalness: 0.1,
  });
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), windowMat);
    win.position.set(side * 0.7, 8.2, -1.35);
    group.add(win);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 3.1), matFromTex(textures.corrugated, 0.7, 0.4, 0x3a4038));
  roof.position.y = 9.15;
  group.add(roof);
  const light = new THREE.SpotLight(0xfff2d0, 14, 55, Math.PI / 5.5, 0.4, 1);
  light.position.set(0, 9.4, 0);
  group.add(light);
  group.userData.spot = light;
  return group;
}

export function makeAmmoCrate(textures: EnvTextures) {
  const wood = matFromTex(textures.wood, 0.88, 0.05, 0x8a6a38);
  const metal = matFromTex(textures.metal, 0.5, 0.6, 0x555555);
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7), wood);
  box.position.y = 0.35;
  box.castShadow = true;
  group.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.08, 0.74), metal);
  band.position.y = 0.35;
  group.add(band);
  const stencil = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.6, metalness: 0.1 })
  );
  stencil.position.set(0, 0.42, 0.36);
  group.add(stencil);
  return group;
}

export function makeHescoBarrier(textures: EnvTextures) {
  const mat = matFromTex(textures.concrete, 0.96, 0.02, 0x9a8a62);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), mat);
  mesh.position.y = 0.7;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.68, 1.45, 1.68),
    new THREE.MeshStandardMaterial({ color: 0x4a5038, wireframe: false, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.35 })
  );
  frame.position.y = 0.72;
  const group = new THREE.Group();
  group.add(mesh, frame);
  return group;
}

export function makeAntennaMast(textures: EnvTextures) {
  const metal = matFromTex(textures.metal, 0.4, 0.75, 0x888888);
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 9, 8), metal);
  pole.position.y = 4.5;
  pole.castShadow = true;
  group.add(pole);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), metal);
  dish.position.set(0.4, 8.2, 0);
  dish.rotation.z = 0.5;
  group.add(dish);
  const light = new THREE.PointLight(0xff2200, 1.2, 18, 2);
  light.position.set(0, 9.1, 0);
  group.add(light);
  return group;
}

export function makeFuelTank(textures: EnvTextures) {
  const metal = matFromTex(textures.paint, 0.45, 0.65, 0x6a5040);
  const group = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 20), metal);
  tank.position.y = 1.7;
  tank.castShadow = true;
  group.add(tank);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(1.42, 0.06, 8, 24),
    matFromTex(textures.metal, 0.4, 0.8, 0x444444)
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.7;
  group.add(band);
  const hazard = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.35, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.55, metalness: 0.15 })
  );
  hazard.position.set(0, 2.2, 1.42);
  group.add(hazard);
  return group;
}

export function makeCheckpointGate(textures: EnvTextures) {
  const metal = matFromTex(textures.metal, 0.5, 0.7, 0x555850);
  const group = new THREE.Group();
  for (const x of [-3.2, 3.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), metal);
    post.position.set(x, 2.1, 0);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.25, 0.25), metal);
  beam.position.y = 4.1;
  group.add(beam);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 0.18), matFromTex(textures.paint, 0.55, 0.4, 0xb8860b));
  arm.position.set(0, 2.4, 0.2);
  arm.rotation.z = -0.15;
  group.add(arm);
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), matFromTex(textures.plaster, 0.88, 0.05, 0xc4b8a0));
  booth.position.set(-5.5, 1.2, 0);
  booth.castShadow = true;
  group.add(booth);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 2.6), matFromTex(textures.corrugated, 0.65, 0.45, 0x3a4038));
  roof.position.set(-5.5, 2.5, 0);
  group.add(roof);
  return group;
}

export function makeBuildingShell(
  textures: EnvTextures,
  w: number,
  d: number,
  h: number,
  opts?: { plaster?: boolean }
) {
  const group = new THREE.Group();
  const wallMap = opts?.plaster ? textures.plaster : textures.patternedBrick;
  const wall = matFromTex(cloneMap(wallMap, Math.max(1, w / 4), Math.max(1, h / 3)), 0.9, 0.05, 0xd0c8b8);
  const trim = matFromTex(textures.concrete, 0.92, 0.04, 0x8a8478);
  const roofMat = matFromTex(textures.corrugated, 0.75, 0.35, 0x3e453c);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.22, d + 0.6), roofMat);
  roof.position.y = h + 0.12;
  roof.castShadow = true;
  group.add(roof);

  const fascia = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.25, 0.18), trim);
  fascia.position.set(0, h * 0.92, -d / 2 - 0.2);
  group.add(fascia);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.1, 0.12),
    matFromTex(textures.metal, 0.55, 0.55, 0x3a4038)
  );
  door.position.set(0, 1.05, -d / 2 - 0.08);
  group.add(door);

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xb8d8c8,
    emissive: 0x3a6a58,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.08,
  });
  for (const side of [-1, 1]) {
    for (const row of [0.4, 0.7]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.08), windowMat);
      win.position.set(side * w * 0.28, h * row, -d / 2 - 0.06);
      group.add(win);
    }
  }

  return group;
}

/** Add textured overlay props into an existing compound without wiping legacy geometry. */
export function upgradeCompoundWithAssets(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  textures: EnvTextures
) {
  const add = (obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(obj));
  };

  const bagLines: Array<[number, number, number]> = [
    [-8, 4, 0],
    [8, 4, Math.PI],
    [-10, -6, 0.4],
    [10, -6, -0.4],
    [-6, 18, 0],
    [6, 18, Math.PI],
    [-14, 12, Math.PI / 2],
    [14, 12, -Math.PI / 2],
  ];
  bagLines.forEach(([x, z, rot]) => add(makeSandbagWall(textures), x, 0, z, rot));

  [[-4, 30], [4, 30], [-12, 0], [12, 0], [0, -20], [-8, -14], [8, -14]].forEach(([x, z]) => {
    add(makeJerseyBarrier(textures), x, 0, z);
  });

  [[-20, -20], [20, -20], [-20, 20], [20, 20], [-15, 8], [15, 8], [0, 24]].forEach(([x, z]) => {
    add(makeHescoBarrier(textures), x, 0, z);
  });

  [[-26, 6], [-24, 7], [24, -4], [26, -5], [4, -30], [-3, -28], [22, 14]].forEach(([x, z], i) => {
    add(makeAmmoCrate(textures), x, 0, z, i * 0.4);
  });

  const towerA = makeWatchTower(textures);
  add(towerA, -28, 0, 0);
  if (towerA.userData.spot) {
    (towerA.userData.spot as THREE.SpotLight).target.position.set(0, 0, 0);
    scene.add((towerA.userData.spot as THREE.SpotLight).target);
  }
  const towerB = makeWatchTower(textures);
  add(towerB, 28, 0, 8);
  if (towerB.userData.spot) {
    (towerB.userData.spot as THREE.SpotLight).target.position.set(0, 0, 0);
    scene.add((towerB.userData.spot as THREE.SpotLight).target);
  }

  add(makeAntennaMast(textures), -30, 0, -28);
  add(makeFuelTank(textures), -18, 0, -18);
  add(makeFuelTank(textures), 18, 0, -18);
  add(makeCheckpointGate(textures), 0, 0, 38);

  // Facade shells over legacy footprints — read as warehouses, not cubes
  add(makeBuildingShell(textures, 10, 14, 6), -34, 0, -12, 0);
  add(makeBuildingShell(textures, 11, 16, 7, { plaster: true }), 34, 0, -10, Math.PI);
  add(makeBuildingShell(textures, 14, 8, 5), 0, 0, -33, 0);

  const asphaltMat = matFromTex(cloneMap(textures.asphalt, 8, 10), 0.96, 0.02);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11, 74), asphaltMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.04, 0);
  road.receiveShadow = true;
  scene.add(road);

  const cross = new THREE.Mesh(new THREE.PlaneGeometry(64, 8), asphaltMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(0, 0.042, -12);
  cross.receiveShadow = true;
  scene.add(cross);

  // Perimeter wall skin
  const wallSkin = matFromTex(cloneMap(textures.concrete, 12, 2), 0.94, 0.03, 0xb0a898);
  for (const [x, z, w, d] of [
    [0, -42.4, 80, 0.35],
    [0, 42.4, 80, 0.35],
    [-42.4, 0, 0.35, 84],
    [42.4, 0, 0.35, 84],
  ] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 4.6, d), wallSkin);
    panel.position.set(x, 2.4, z);
    panel.castShadow = true;
    scene.add(panel);
  }
}

export function applyTexturedGround(ground: THREE.Mesh, textures: EnvTextures) {
  const map = textures.concrete.clone();
  map.repeat.set(24, 24);
  map.needsUpdate = true;
  if (ground.material instanceof THREE.MeshStandardMaterial) {
    ground.material.map = map;
    ground.material.needsUpdate = true;
  }
}

/** ISO-style shipping container — solid cover for flanking lanes. */
export function makeShippingContainer(textures: EnvTextures, length = 6.2, height = 2.55, width = 2.45) {
  const group = new THREE.Group();
  const shell = matFromTex(cloneMap(textures.corrugated, Math.max(1, length / 3), 1.2), 0.72, 0.45, 0x3d5a4a);
  const frame = matFromTex(textures.metal, 0.45, 0.7, 0x2a302c);
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), shell);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, height * 0.92, width * 0.92), frame);
  door.position.set(length / 2 + 0.02, height / 2, 0);
  group.add(door);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, 0.08, width + 0.08), frame);
  ridge.position.y = height + 0.02;
  group.add(ridge);
  group.userData.coverHeight = height;
  group.userData.surfaceKind = "metal";
  return group;
}

/**
 * Tactical cover for the expanded Solo compound — sandbags, Hesco, Jersey,
 * and container stacks that create flanking lanes without duplicating warehouses/towers.
 */
export function addCombatCoverToCompound(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  textures: EnvTextures
) {
  const add = (obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(obj));
  };

  // Sandbag fighting positions along the main yard and approaches.
  const bagLines: Array<[number, number, number, number?]> = [
    [-10, 6, 0, 4.2],
    [10, 6, Math.PI, 4.2],
    [-12, -8, 0.35, 3.6],
    [12, -8, -0.35, 3.6],
    [-8, 22, 0, 3.8],
    [8, 22, Math.PI, 3.8],
    [-20, 14, Math.PI / 2, 3.4],
    [20, 14, -Math.PI / 2, 3.4],
    [0, -42, 0, 5],
    [-38, 0, Math.PI / 2, 4],
    [38, 0, -Math.PI / 2, 4],
  ];
  bagLines.forEach(([x, z, rot, width]) => add(makeSandbagWall(textures, width ?? 3.2), x, 0, z, rot));

  // Jersey barriers define approach lanes without sealing them.
  (
    [
      [-5, 44],
      [5, 44],
      [-16, -2],
      [16, -2],
      [0, -24],
      [-22, -30],
      [22, -30],
      [-6, 32],
      [6, 32],
    ] as Array<[number, number]>
  ).forEach(([x, z], i) => add(makeJerseyBarrier(textures), x, 0, z, (i % 3) * 0.08));

  // Hesco clusters at yard corners and mid-flank choke points.
  (
    [
      [-30, -28],
      [30, -28],
      [-30, 28],
      [30, 28],
      [-18, 8],
      [18, 8],
      [0, 28],
      [-42, -40],
      [42, -40],
    ] as Array<[number, number]>
  ).forEach(([x, z]) => add(makeHescoBarrier(textures), x, 0, z));

  // Shipping-container corridors — west / east flanking routes.
  const containerLane: Array<[number, number, number, number?, number?, number?]> = [
    [-16, -18, Math.PI / 2],
    [-16, -11, Math.PI / 2],
    [-16, 18, Math.PI / 2],
    [16, -18, Math.PI / 2],
    [16, -11, Math.PI / 2],
    [16, 18, Math.PI / 2],
    [-44, -6, 0],
    [44, -6, 0],
    [-44, 18, 0],
    [44, 18, 0],
    [0, -52, 0, 5.4, 2.4, 2.35],
    [-52, 40, Math.PI / 2],
    [52, 40, -Math.PI / 2],
  ];
  containerLane.forEach(([x, z, rot, length, height, width]) => {
    add(makeShippingContainer(textures, length ?? 6.2, height ?? 2.55, width ?? 2.45), x, 0, z, rot);
  });

  // Stacked containers for elevated sightlines / hard cover.
  const stack = makeShippingContainer(textures, 5.8, 2.4, 2.35);
  add(stack, -16, 0, 4, Math.PI / 2);
  const upper = makeShippingContainer(textures, 5.8, 2.4, 2.35);
  add(upper, -16, 2.45, 4, Math.PI / 2);

  const stackE = makeShippingContainer(textures, 5.8, 2.4, 2.35);
  add(stackE, 16, 0, 4, Math.PI / 2);
  const upperE = makeShippingContainer(textures, 5.8, 2.4, 2.35);
  add(upperE, 16, 2.45, 4, Math.PI / 2);

  // Ammo crates as low cover near fighting positions.
  (
    [
      [-11, 5],
      [-9.5, 5.4],
      [11, 5],
      [9.5, 5.3],
      [-25, -16],
      [25, -16],
      [3, -43],
      [-3, -43],
      [-40, 12],
      [40, 12],
    ] as Array<[number, number]>
  ).forEach(([x, z], i) => add(makeAmmoCrate(textures), x, 0, z, i * 0.35));

  add(makeFuelTank(textures), -18, 0, -18);
  add(makeFuelTank(textures), 18, 0, -18);
  add(makeAntennaMast(textures), -50, 0, -48);
}
