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

/** NATO-style helipad H + approach ring — keep center clear for extract bird. */
export function makeHelipadMarking(lzRadius: number) {
  const group = new THREE.Group();
  group.name = "HelipadLZ";
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.82, metalness: 0.04 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd1b45c, side: THREE.DoubleSide });
  const dimYellow = new THREE.MeshStandardMaterial({ color: 0xb89840, roughness: 0.88, metalness: 0.05 });

  const pad = new THREE.Mesh(new THREE.CircleGeometry(lzRadius + 1.2, 48), dimYellow);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.032;
  pad.receiveShadow = true;
  group.add(pad);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(lzRadius + 0.35, lzRadius + 0.95, 48),
    yellow,
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.042;
  group.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(lzRadius - 0.95, lzRadius - 0.35, 48),
    yellow,
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.043;
  group.add(innerRing);

  const barW = lzRadius * 0.22;
  const barH = lzRadius * 0.78;
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.04, barH * 0.42), white);
  crossbar.position.set(0, 0.05, 0);
  group.add(crossbar);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.04, barH * 0.52), white);
    leg.position.set(side * barW * 0.95, 0.05, barH * 0.22);
    group.add(leg);
  }

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 1.4), white);
    tick.position.set(Math.sin(angle) * (lzRadius - 0.15), 0.048, Math.cos(angle) * (lzRadius - 0.15));
    tick.rotation.y = -angle;
    group.add(tick);
  }
  return group;
}

export function makeConcertinaWire(length = 8, coils = 14) {
  const group = new THREE.Group();
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x6a6e64, roughness: 0.35, metalness: 0.72 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4e48, roughness: 0.55, metalness: 0.55 });
  for (const x of [-length / 2, length / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.15, 6), postMat);
    post.position.set(x, 0.58, 0);
    group.add(post);
  }
  for (let i = 0; i < coils; i += 1) {
    const t = i / Math.max(1, coils - 1);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 6, 12), wireMat);
    coil.position.set(-length / 2 + t * length, 0.72 + Math.sin(i * 0.9) * 0.04, 0);
    coil.rotation.y = Math.PI / 2;
    coil.rotation.x = 0.15 + (i % 2) * 0.08;
    group.add(coil);
  }
  group.userData.surfaceKind = "metal";
  return group;
}

export function makeHescoWallLine(textures: EnvTextures, count = 4, spacing = 1.55) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const unit = makeHescoBarrier(textures);
    unit.position.set((i - (count - 1) / 2) * spacing, 0, 0);
    unit.rotation.y = (i % 2) * 0.04;
    group.add(unit);
  }
  group.userData.coverHeight = 1.4;
  return group;
}

export function makeAmmoBunker(textures: EnvTextures) {
  const concrete = matFromTex(textures.concrete, 0.94, 0.03, 0x8a8478);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.35, 2.8), concrete);
  body.position.y = 0.68;
  body.castShadow = true;
  group.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, 3.1), matFromTex(textures.corrugated, 0.75, 0.35, 0x3a4038));
  roof.position.y = 1.42;
  roof.castShadow = true;
  group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.05, 0.12), matFromTex(textures.metal, 0.55, 0.5, 0x3a4038));
  door.position.set(0, 0.62, -1.46);
  group.add(door);
  const stencil = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.22, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.65, metalness: 0.1 }),
  );
  stencil.position.set(-1.1, 1.05, -1.42);
  group.add(stencil);
  group.userData.coverHeight = 1.35;
  return group;
}

export function makeVehicleHardstand(textures: EnvTextures, width = 10, depth = 7) {
  const group = new THREE.Group();
  const asphalt = matFromTex(cloneMap(textures.asphalt, 4, 3), 0.96, 0.02, 0x3a3a38);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), asphalt);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.038;
  pad.receiveShadow = true;
  group.add(pad);
  const chalkMat = new THREE.MeshBasicMaterial({
    color: 0xc8c0a8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const border = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.4, depth - 0.4), chalkMat);
  border.rotation.x = -Math.PI / 2;
  border.position.y = 0.041;
  group.add(border);
  for (let i = -1; i <= 1; i += 2) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, depth - 1.2), chalkMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * (width * 0.28), 0.042, 0);
    group.add(line);
  }
  return group;
}

export function makeFloodlightMast(textures: EnvTextures, mobile = false) {
  const metal = matFromTex(textures.metal, 0.48, 0.62, 0x5a5e58);
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.2, 10), metal);
  pole.position.y = 3.6;
  pole.castShadow = !mobile;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), metal);
  arm.position.set(0.65, 6.8, 0);
  group.add(arm);
  const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.55), metal);
  lampHousing.position.set(1.45, 6.65, 0);
  group.add(lampHousing);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.28, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xf0f8ff,
      emissive: 0xb8d8f0,
      emissiveIntensity: mobile ? 1.1 : 1.6,
      roughness: 0.25,
      metalness: 0.08,
    }),
  );
  lens.position.set(1.45, 6.62, 0.28);
  group.add(lens);
  if (!mobile) {
    const spot = new THREE.SpotLight(0xe8f4ff, 22, 68, Math.PI / 5.8, 0.42, 0.95);
    spot.position.set(1.45, 6.5, 0);
    spot.target.position.set(1.45, 0, 8);
    group.add(spot);
    group.add(spot.target);
    group.userData.spot = spot;
  }
  return group;
}

export function makeCamoNetDrape(width = 8, depth = 6) {
  const group = new THREE.Group();
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x4a5a3a,
    roughness: 0.95,
    metalness: 0.02,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const segments = 6;
  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width / segments + 0.2, depth * 0.55), netMat);
    panel.position.set(-width / 2 + t * width, 0.35 - Math.sin(t * Math.PI) * 0.25, depth * 0.08);
    panel.rotation.x = -0.35 - Math.sin(t * Math.PI) * 0.15;
    panel.rotation.y = (t - 0.5) * 0.12;
    group.add(panel);
  }
  for (let i = 0; i < 8; i += 1) {
    const tie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.8, metalness: 0.1 }),
    );
    tie.position.set(-width / 2 + (i / 7) * width, 0.55, -depth * 0.05);
    tie.rotation.z = 0.4;
    group.add(tie);
  }
  return group;
}

export function makeFuelBladder(textures: EnvTextures) {
  const rubber = matFromTex(textures.paint, 0.88, 0.08, 0x3a4038);
  const group = new THREE.Group();
  const bladder = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 1.8), rubber);
  bladder.position.y = 0.42;
  bladder.castShadow = true;
  group.add(bladder);
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 2.1), matFromTex(textures.wood, 0.9, 0.05, 0x6a5a40));
  cradle.position.y = 0.12;
  group.add(cradle);
  const hazard = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.18, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.6, metalness: 0.12 }),
  );
  hazard.position.set(0, 0.62, 0.92);
  group.add(hazard);
  return group;
}

export function makeTocSignage(textures: EnvTextures) {
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.9, 0.08),
    matFromTex(textures.paint, 0.72, 0.25, 0x3a4a38),
  );
  board.position.y = 2.6;
  group.add(board);
  const label = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.35, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.75, metalness: 0.08 }),
  );
  label.position.set(0, 2.65, -0.05);
  group.add(label);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.08, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.65, metalness: 0.1 }),
  );
  stripe.position.set(0, 2.95, -0.04);
  group.add(stripe);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), matFromTex(textures.metal, 0.5, 0.6, 0x555850));
  mast.position.y = 1.2;
  group.add(mast);
  return group;
}

export function makeGuardTowerEnhanced(textures: EnvTextures, mobile = false) {
  const tower = makeWatchTower(textures);
  const sandbags = makeSandbagWall(textures, 3.6, 1.0);
  sandbags.position.y = 0;
  tower.add(sandbags);
  const wire = makeConcertinaWire(2.8, mobile ? 8 : 12);
  wire.position.set(0, 6.8, 1.6);
  tower.add(wire);
  return tower;
}

/**
 * FOB dressing — perimeter wire, bunkers, hardstands, floodlights, HQ cues.
 * Visual-only props skip colliders where noted so extract LZ and doorways stay open.
 */
export function addMilitaryFobDressing(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  textures: EnvTextures,
  mobile = false,
) {
  const add = (obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0, collide = true) => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    if (collide) colliders.push(new THREE.Box3().setFromObject(obj));
  };
  const decor = (obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0) =>
    add(obj, x, y, z, rotY, false);

  const wall = 60;
  const wireCoils = mobile ? 8 : 14;

  // Concertina on perimeter wall crests (visual — no collider).
  for (const [x, z, rot] of [
    [0, -wall + 0.4, 0],
    [0, wall - 0.4, 0],
    [-wall + 0.4, 0, Math.PI / 2],
    [wall - 0.4, 0, Math.PI / 2],
  ] as const) {
    const span = mobile ? 18 : 28;
    for (let i = -1; i <= 1; i += 1) {
      const wire = makeConcertinaWire(span, wireCoils);
      const wx = x + (rot === 0 ? i * (span * 0.85) : 0);
      const wz = z + (rot !== 0 ? i * (span * 0.85) : 0);
      decor(wire, wx, 5.05, wz, rot);
    }
  }

  // Inner HESCO berm line — breaks sightlines without sealing the yard.
  (
    [
      [-wall + 4, -wall + 4, 0],
      [wall - 4, -wall + 4, Math.PI],
      [-wall + 4, wall - 8, Math.PI / 2],
      [wall - 4, wall - 8, -Math.PI / 2],
    ] as Array<[number, number, number]>
  ).forEach(([x, z, rot]) => {
    const line = makeHescoWallLine(textures, mobile ? 3 : 5);
    add(line, x, 0, z, rot);
  });

  // Ammo bunkers flanking the south approach.
  add(makeAmmoBunker(textures), -22, 0, -34, Math.PI / 2);
  add(makeAmmoBunker(textures), 22, 0, -34, -Math.PI / 2);

  // Vehicle hardstands near hangar and warehouses.
  decor(makeVehicleHardstand(textures, 12, 8), -34, 0, -22, 0);
  decor(makeVehicleHardstand(textures, 11, 7), 34, 0, -20, Math.PI);
  decor(makeVehicleHardstand(textures, 14, 9), 0, 0, -38, 0);

  // Fuel bladders at POL point.
  add(makeFuelBladder(textures), -24, 0, -22);
  add(makeFuelBladder(textures), -26, 0, -20, 0.3);
  if (!mobile) add(makeFuelBladder(textures), 24, 0, -20, -0.2);

  // HQ / TOC signage at intel warehouse (east).
  decor(makeTocSignage(textures), 48, 0, -18, -Math.PI / 2);

  // Camo net on west warehouse roofline.
  decor(makeCamoNetDrape(11, 5), -48, 7.8, -14);

  // Perimeter floodlight masts — alternate with road lamps.
  const floodPositions: Array<[number, number, number]> = mobile
    ? [
        [-wall + 8, 0, -wall + 10],
        [wall - 8, 0, wall - 14],
      ]
    : [
        [-wall + 8, 0, -wall + 10],
        [wall - 8, 0, -wall + 10],
        [-wall + 8, 0, wall - 14],
        [wall - 8, 0, wall - 14],
        [0, 0, -wall + 6],
      ];
  floodPositions.forEach(([x, z, rot]) => {
    const mast = makeFloodlightMast(textures, mobile);
    decor(mast, x, 0, z, rot);
    if (mast.userData.spot) {
      const spot = mast.userData.spot as THREE.SpotLight;
      spot.target.position.set(x + Math.sin(rot) * 12, 0, z + Math.cos(rot) * 12);
      scene.add(spot.target);
    }
  });

  // Checkpoint lane markers at north gate.
  for (const x of [-4.5, 4.5]) {
    decor(makeJerseyBarrier(textures), x, 0, wall - 3.5, x > 0 ? -0.08 : 0.08);
  }
}
