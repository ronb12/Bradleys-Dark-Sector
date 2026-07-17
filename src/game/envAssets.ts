import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ENV_MODEL_URLS = {
  barrier: "/models/env/concrete_road_barrier_02.glb",
  ammoBox: "/models/env/ammo_box.glb",
  militaryCrate: "/models/env/wooden_military_crate.glb",
  jerrycan: "/models/env/metal_jerrycan_green.glb",
  compressor: "/models/env/old_military_compressor.glb",
  barrel: "/models/env/barrel_03.glb",
  rollerDoor: "/models/env/rollershutter_door.glb",
} as const;

type EnvAssetKey = keyof typeof ENV_MODEL_URLS;
type EnvTemplates = Record<EnvAssetKey, THREE.Object3D>;

let templatesPromise: Promise<EnvTemplates> | null = null;

function loadTemplates() {
  if (templatesPromise) return templatesPromise;
  const loader = new GLTFLoader();
  templatesPromise = Promise.all(
    (Object.entries(ENV_MODEL_URLS) as Array<[EnvAssetKey, string]>).map(async ([key, url]) => {
      const gltf = await loader.loadAsync(url);
      gltf.scene.name = `EnvTemplate:${key}`;
      return [key, gltf.scene] as const;
    })
  ).then((entries) => Object.fromEntries(entries) as unknown as EnvTemplates);
  return templatesPromise;
}

function makeGroundedClone(
  template: THREE.Object3D,
  targetLongestSide: number,
  name: string
) {
  const model = template.clone(true);
  model.traverse((child) => {
    child.userData.sharedEnvAsset = true;
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  model.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const scale = targetLongestSide / Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -scaledBox.min.y, -center.z);

  const root = new THREE.Group();
  root.name = name;
  root.userData.importedEnvironmentAsset = true;
  root.add(model);
  return root;
}

function addAsset(
  parent: THREE.Object3D,
  colliders: THREE.Box3[],
  templates: EnvTemplates,
  key: EnvAssetKey,
  targetLongestSide: number,
  x: number,
  z: number,
  rotationY = 0,
  collider = true
) {
  const root = makeGroundedClone(templates[key], targetLongestSide, `ImportedEnv:${key}`);
  root.position.set(x, 0, z);
  root.rotation.y = rotationY;
  parent.add(root);
  root.updateMatrixWorld(true);
  if (collider) colliders.push(new THREE.Box3().setFromObject(root));
  return root;
}

export async function populateCompoundWithEnvironmentAssets(
  scene: THREE.Scene,
  colliders: THREE.Box3[]
) {
  const templates = await loadTemplates();
  const root = new THREE.Group();
  root.name = "ImportedMilitaryEnvironment";
  scene.add(root);

  const barriers: Array<[number, number, number]> = [
    [-14, -8, Math.PI / 2],
    [14, -8, Math.PI / 2],
    [-8, -24, 0],
    [8, -24, 0],
    [-24, 26, Math.PI / 2],
    [24, 26, Math.PI / 2],
    [-18, 2, Math.PI / 5],
    [18, 2, -Math.PI / 5],
    // Expanded-yard flanking cover
    [-32, -8, Math.PI / 2],
    [32, -8, Math.PI / 2],
    [-10, 40, 0],
    [10, 40, 0],
    [-36, 20, 0.2],
    [36, 20, -0.2],
    [0, -36, 0],
    [-20, -40, Math.PI / 2],
    [20, -40, Math.PI / 2],
  ];
  barriers.forEach(([x, z, rotation]) =>
    addAsset(root, colliders, templates, "barrier", 3.25, x, z, rotation)
  );

  const crates: Array<[number, number, number]> = [
    [-27, -3, 0.15],
    [-25.5, -3.2, -0.25],
    [25, 8, 0.4],
    [27, 8.4, -0.15],
    [-24, 30, 0.5],
    [25, -27, -0.4],
    [-40, -20, 0.2],
    [-38.5, -20.4, -0.3],
    [40, -18, 0.35],
    [38.2, -17.6, -0.2],
    [-42, 30, 0.4],
    [42, 28, -0.25],
    [-8, -50, 0.15],
    [8, -50, -0.2],
  ];
  crates.forEach(([x, z, rotation]) =>
    addAsset(root, colliders, templates, "militaryCrate", 1.45, x, z, rotation)
  );

  const ammoBoxes: Array<[number, number, number]> = [
    [-27.2, -1.8, 0],
    [26.5, 7.1, 0.5],
    [24.8, -26, -0.3],
    [-39, -19, 0.2],
    [39, -16.5, -0.4],
    [0, -49, 0.1],
  ];
  ammoBoxes.forEach(([x, z, rotation]) =>
    addAsset(root, colliders, templates, "ammoBox", 0.72, x, z, rotation)
  );

  (
    [
      [-29, -25],
      [28, 22],
      [-46, -30],
      [46, 12],
    ] as Array<[number, number]>
  ).forEach(([x, z], index) =>
    addAsset(root, colliders, templates, "compressor", 3.1, x, z, index % 2 ? Math.PI : 0)
  );

  (
    [
      [-23, -18],
      [-21.8, -18],
      [23, -18],
      [21.8, -18],
      [-34, 6],
      [-32.8, 6.2],
      [34, 6],
      [32.8, 5.8],
    ] as Array<[number, number]>
  ).forEach(([x, z], index) =>
    addAsset(root, colliders, templates, "barrel", 1.05, x, z, index * 0.35)
  );

  (
    [
      [-22.5, -17],
      [22.5, -17],
      [-26, -2.2],
      [26, 6.8],
      [-41, -19.5],
      [41, -17],
    ] as Array<[number, number]>
  ).forEach(([x, z], index) =>
    addAsset(root, colliders, templates, "jerrycan", 0.58, x, z, index * 0.6)
  );

  // Facades match expanded warehouse / hangar footprints.
  const facadeDoors: Array<[number, number, number]> = [
    [-48, -24.28, 0],
    [48, -23.28, 0],
    [-48, 24.72, 0],
    [48, 24.22, 0],
    [0, -54.28, 0],
    [-48, 2.72, 0],
    [48, 2.72, 0],
  ];
  facadeDoors.forEach(([x, z, rotation]) =>
    addAsset(root, colliders, templates, "rollerDoor", 4.4, x, z, rotation, false)
  );

  root.userData.loadedAssetUrls = Object.values(ENV_MODEL_URLS);
  root.userData.importedInstanceCount =
    barriers.length + crates.length + ammoBoxes.length + 4 + 8 + 6 + facadeDoors.length;
  return root;
}

export async function populateShootingRangeWithEnvironmentAssets(
  rangeRoot: THREE.Group,
  colliders: THREE.Box3[]
) {
  const templates = await loadTemplates();
  if (!rangeRoot.parent) return;

  const root = new THREE.Group();
  root.name = "ImportedRangeProps";
  rangeRoot.add(root);
  addAsset(root, colliders, templates, "barrier", 3.25, -7.4, -5, Math.PI / 2);
  addAsset(root, colliders, templates, "barrier", 3.25, 7.4, -5, Math.PI / 2);
  addAsset(root, colliders, templates, "militaryCrate", 1.35, -7.5, 4.8, 0.2);
  addAsset(root, colliders, templates, "ammoBox", 0.72, -6.8, 4.6, -0.15);
  addAsset(root, colliders, templates, "barrel", 1.05, -8.1, -14, 0.4);
  addAsset(root, colliders, templates, "jerrycan", 0.58, 8.1, -13.5, -0.3);
}
