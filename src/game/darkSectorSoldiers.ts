/**
 * Original Dark Sector soldiers — no external character meshes, textures or rigs.
 * Five recognizable combat silhouettes share one procedural animation contract.
 *
 * The renderer animates limb roots at fixed legacy pose coordinates so these
 * models plug into the existing cover, kneel, recoil, and locomotion systems.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type SoldierClass = "Rifleman" | "Scout" | "Heavy" | "Sniper" | "Commander";
type Mat = THREE.MeshStandardMaterial;

const uniformShades: Record<SoldierClass, number> = {
  Rifleman: 0x525c4c,
  Scout: 0x475e4e,
  Heavy: 0x5c5750,
  Sniper: 0x4b5148,
  Commander: 0x5e574c,
};
const accentShades: Record<SoldierClass, number> = {
  Rifleman: 0x9fbdad,
  Scout: 0x66c9a8,
  Heavy: 0xcd9e68,
  Sniper: 0x97aeb2,
  Commander: 0xe0b66b,
};
const SKIN_SHADES = [0xa87b60, 0x865e4a, 0x6c4938, 0xc29a78, 0x94694e];
// Wave-based games can spawn hundreds of enemies per session. Shared geometry
// prevents allocating new GPU buffers on every spawn and keeps Quest memory flat.
const boxGeometryCache = new Map<string, RoundedBoxGeometry>();
const sphereGeometryCache = new Map<string, THREE.SphereGeometry>();
const taperedGeometryCache = new Map<string, THREE.CylinderGeometry>();
const camouflageTextures = new Map<string, THREE.CanvasTexture>();

// A small, deterministic cloth atlas is reused for every soldier of a class.
// It avoids downloading texture files or generating unique canvases per spawn.
function camouflage(type: SoldierClass, lowPower: boolean) {
  const key = type + (lowPower ? "/mobile" : "/desktop");
  const existing = camouflageTextures.get(key);
  if (existing) return existing;
  const size = lowPower ? 64 : 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const seedBase = Object.keys(uniformShades).indexOf(type) + 7;
  let seed = seedBase * 7919;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = "#d5d8c7";
  ctx.fillRect(0, 0, size, size);
  for (let n = 0; n < (lowPower ? 40 : 100); n++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = (3 + rand() * 14) * (size / 128);
    const h = (2 + rand() * 12) * (size / 128);
    ctx.fillStyle = ["#9da99c", "#bbc4b4", "#e0dec9", "#87998a", "#b1b29d"][Math.floor(rand() * 5)];
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = "#35443c";
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + 4, size); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 1.5);
  map.anisotropy = lowPower ? 1 : 2;
  camouflageTextures.set(key, map);
  return map;
}

function taper(root: THREE.Object3D, name: string, top: number, bottom: number, height: number,
               pos: [number, number, number], mat: THREE.Material) {
  const key = [top, bottom, height].join("/");
  let geo = taperedGeometryCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(top, bottom, height, 10, 1);
    taperedGeometryCache.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.set(...pos);
  root.add(mesh);
  return mesh;
}

function material(color: number, roughness = 0.83, metalness = 0.09): Mat {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function box(
  root: THREE.Object3D, name: string, size: [number, number, number],
  pos: [number, number, number], mat: THREE.Material, radius = 0.025,
) {
  const roundedRadius = Math.min(radius, ...size.map(s => s * 0.28));
  const key = `${size.join("/")}:${roundedRadius}`;
  let geometry = boxGeometryCache.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(...size, 2, roundedRadius);
    boxGeometryCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.set(...pos);
  root.add(mesh);
  return mesh;
}
function sphere(
  root: THREE.Object3D, name: string, radius: number,
  pos: [number, number, number], mat: THREE.Material,
  scale: [number, number, number] = [1, 1, 1],
) {
  const key = String(radius);
  let geometry = sphereGeometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.SphereGeometry(radius, 12, 9);
    sphereGeometryCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  root.add(mesh);
  return mesh;
}
function limb(
  root: THREE.Object3D, name: string,
  pos: [number, number, number], length: number,
  uniform: Mat, armor: Mat, boots: Mat, isLeg: boolean,
) {
  // Hip/shoulder -> knee/elbow -> shin/forearm articulation. The legacy
  // animation still rotates the outer pivot; the inner joint adds follow-through.
  const joint = new THREE.Group();
  joint.name = name;
  joint.position.set(...pos);
  root.add(joint);
  const upper = isLeg ? length * 0.5 : length * 0.645;
  const lower = new THREE.Group();
  lower.name = isLeg ? name + "/KneeJoint" : name + "/ElbowJoint";
  lower.position.set(0, -upper, 0);
  joint.add(lower);
  joint.userData.lowerLimb = lower;

  if (isLeg) {
    taper(joint, name + "/ThighCloth", 0.154, 0.118, upper * 0.86,
      [0, -upper * 0.51, 0], uniform);
    sphere(joint, name + "/UpperThighContour", 0.135,
      [0, -0.07, 0], uniform, [1.1, 0.9, 1.04]);
    sphere(lower, name + "/KneeJointPadding", 0.115, [0, 0, 0], uniform);
    taper(lower, name + "/CalfCloth", 0.116, 0.078, 0.39,
      [0, -0.2, 0.01], uniform);
    box(lower, name + "/FloatingKneePlate", [0.23, 0.24, 0.11],
      [0, -0.032, -0.113], armor, 0.06);
    box(lower, name + "/ShinArmor", [0.186, 0.30, 0.075],
      [0, -0.21, -0.105], armor, 0.04);
    box(lower, name + "/CombatBoot", [0.216, 0.19, 0.31],
      [0, -0.43, -0.071], boots, 0.04);
    box(lower, name + "/BootSole", [0.235, 0.045, 0.34],
      [0, -0.532, -0.078], armor, 0.016);
    box(lower, name + "/BootLaces", [0.072, 0.07, 0.014],
      [0, -0.414, -0.238], armor, 0.007);
    box(joint, name + "/ThighPocket", [0.09, 0.19, 0.10],
      [name.startsWith("Left") ? -0.142 : 0.142, -0.18, -0.01], armor, 0.023);
  } else {
    sphere(joint, name + "/ShoulderShape", 0.155, [0, -0.075, 0],
      uniform, [1.06, 1.04, 0.97]);
    taper(joint, name + "/UpperArmCloth", 0.111, 0.087, upper * 0.75,
      [0, -upper * 0.48, 0], uniform);
    sphere(lower, name + "/ElbowJointPadding", 0.09, [0, 0, 0], uniform);
    taper(lower, name + "/ForearmCloth", 0.091, 0.069, 0.31,
      [0, -0.168, -0.01], uniform);
    box(lower, name + "/ElbowPad", [0.18, 0.16, 0.09],
      [0, -0.028, -0.07], armor, 0.035);
    box(lower, name + "/GloveCuff", [0.16, 0.095, 0.18],
      [0, -0.316, -0.015], armor, 0.023);
    sphere(lower, name + "/GlovedHand", 0.105,
      [0, -0.40, -0.024], boots, [0.91, 0.92, 0.8]);
    box(joint, name + "/ShoulderBallisticPad", [0.22, 0.25, 0.215],
      [0, -0.105, -0.005], armor, 0.08);
  }
  return joint;
}

/** Build a procedural soldier at ~1.9m after the common world scale of 0.83. */
export function createDarkSectorSoldier(type: SoldierClass, seed = 0, lowPower = false): THREE.Group {
  const body = new THREE.Group();
  body.name = "DS Enemy / " + type;
  const uniform = material(uniformShades[type]);
  const clothMap = camouflage(type, lowPower);
  if (clothMap) { uniform.map = clothMap; uniform.needsUpdate = true; }
  const armor = material(type === "Heavy" ? 0x384045 : 0x262f33, 0.68, 0.24);
  const plates = material(type === "Commander" ? 0x4d4639 : 0x333b3e, 0.63, 0.26);
  const webbing = material(0x252a27, 0.94, 0.03);
  const boots = material(0x181d21, 0.9, 0.05);
  const fabricAccent = material(accentShades[type], 0.72, 0.07);
  const skin = material(SKIN_SHADES[Math.abs(seed) % SKIN_SHADES.length], 0.89, 0);
  const glass = material(0x172f36, 0.2, 0.25);
  const lens = material(type === "Sniper" ? 0x306a70 : 0x263d46, 0.21, 0.31);

  // Animated hip and torso pivot positions remain compatible with animateSoldier.
  const hips = new THREE.Group(); hips.position.y = 0.95; hips.name = "HipsPivot"; body.add(hips);
  box(hips, "LoadBearingBelt", [0.62, 0.28, 0.4], [0, 0, 0], uniform, 0.07);
  box(hips, "FrontUtilityBuckle", [0.16, 0.11, 0.08], [0, 0.035, -0.235], plates, 0.023);
  for (const sign of [-1, 1]) {
    box(hips, "HipPouch", [0.16, 0.26, 0.22], [sign * 0.33, -0.04, 0], webbing, 0.04);
  }

  const torso = new THREE.Group(); torso.position.y = 1.55; torso.name = "ChestPivot"; body.add(torso);
  box(torso, "CombatJacket", [0.63, 0.73, 0.40], [0, 0, 0], uniform, 0.14);
  const vestThickness = type === "Heavy" ? 0.24 : 0.16;
  box(torso, "ChestPlateCarrier", [type === "Heavy" ? 0.71 : 0.62, 0.62, vestThickness],
    [0, -0.013, -0.275], armor, 0.09);
  box(torso, "UpperArmorPlate", [0.44, 0.28, 0.054], [0, 0.10, -0.37], plates, 0.06);
  box(torso, "RearPlateCarrier", [0.56, 0.63, 0.17], [0, 0.0, 0.30], armor, 0.07);

  // Front webbing, horizontal MOLLE rows, pouch silhouettes and body straps.
  for (let y = -0.23; y <= 0.04; y += 0.085) {
    box(torso, "PlateCarrierWebbing", [0.47, 0.016, 0.017],
      [0, y, -0.381], webbing, 0.004);
  }
  for (let n = 0; n < (type === "Scout" ? 2 : 3); n++) {
    box(torso, "MagazinePouch", [0.14, 0.20, 0.09],
      [-0.18 + n * 0.18, -0.22, -0.416], webbing, 0.028);
    box(torso, "MagazinePouchTab", [0.06, 0.035, 0.015],
      [-0.18 + n * 0.18, -0.14, -0.468], fabricAccent, 0.008);
  }
  for (const side of [-1, 1]) {
    const strap = box(torso, "HarnessStrap", [0.075, 0.62, 0.075],
      [side * 0.24, 0.05, -0.25], webbing, 0.02);
    strap.rotation.z = -side * 0.11;
  }

  // Profile-specific kit: five distinct silhouettes, not just recolored bodies.
  if (type === "Heavy") {
    for (const side of [-1, 1]) {
      const pauldron = box(torso, "HeavyBallisticPauldron",
        [0.32, 0.42, 0.36], [side * 0.47, 0.29, -0.01], plates, 0.085);
      pauldron.rotation.z = side * 0.16;
    }
    box(torso, "HeavyLowerChestArmor", [0.70, 0.28, 0.13], [0, -0.24, -0.37], plates, 0.05);
    box(torso, "HeavySupplyPack", [0.60, 0.64, 0.35], [0, 0.02, 0.43], armor, 0.09);
  } else if (type === "Sniper") {
    box(torso, "MarksmanRadioPack", [0.43, 0.65, 0.24], [0, -0.01, 0.43], webbing, 0.065);
    box(torso, "LongRangeOpticPouch", [0.16, 0.28, 0.17], [-0.41, 0.03, 0], fabricAccent, 0.04);
    for (let n = 0; n < 4; n++) {
      const strip = box(torso, "CamouflageShroud", [0.10, 0.28, 0.08],
        [-0.28 + n * 0.17, 0.20, 0.32], uniform, 0.025);
      strip.rotation.z = n % 2 ? -0.26 : 0.25;
    }
  } else if (type === "Commander") {
    box(torso, "CommandRadioPack", [0.50, 0.54, 0.30], [0, 0.07, 0.42], armor, 0.07);
    box(torso, "CommandInsignia", [0.18, 0.12, 0.018], [0.18, 0.18, -0.388], fabricAccent, 0.013);
    box(torso, "CommandTablet", [0.25, 0.19, 0.08], [-0.38, -0.13, -0.02], glass, 0.025);
  } else if (type === "Scout") {
    box(torso, "ScoutHydrationPack", [0.41, 0.52, 0.22], [0, 0.0, 0.37], webbing, 0.06);
    box(torso, "ScoutUnitPatch", [0.12, 0.08, 0.018], [0.25, 0.21, -0.255], fabricAccent, 0.01);
  } else {
    box(torso, "InfantryRucksack", [0.48, 0.60, 0.28], [0, 0, 0.41], webbing, 0.06);
  }

  taper(body, "NeckGaiter", 0.13, 0.153, 0.17, [0, 2.045, 0], uniform);
  box(torso, "MoralePatch", [0.18, 0.09, 0.018], [-0.19, 0.18, -0.389], fabricAccent, 0.012);
  box(torso, "PlateCarrierGrabHandle", [0.20, 0.045, 0.09], [0, 0.325, 0.31], webbing, 0.016);

  const head = new THREE.Group(); head.position.y = 2.23; head.name = "HeadPivot"; body.add(head);
  sphere(head, "HumanFace", 0.24, [0, -0.035, -0.02], skin, [0.94, 1.12, 0.89]);
  box(head, "LowerFaceCover", [0.31, 0.15, 0.09], [0, -0.138, -0.19], webbing, 0.05);
  // Eyes remain under the protective visor instead of uncanny bare face blobs.
  box(head, "TacticalGoggleBand", [0.49, 0.11, 0.07], [0, 0.018, 0.04], webbing, 0.028);
  box(head, "SealedGoggles", [0.37, 0.14, 0.09], [0, 0.025, -0.216], glass, 0.04);
  if (!lowPower) {
    box(head, "DualVisorLenses", [0.31, 0.074, 0.016], [0, 0.026, -0.269], lens, 0.022);
  }
  // Ballistic helmet with cheek guards, rail and top profile.
  sphere(head, "BallisticHelmetShell", type === "Heavy" ? 0.33 : 0.295,
    [0, 0.158, 0.015], armor, [1.13, 0.75, 1.03]);
  box(head, "HelmetFrontBrow", [0.50, 0.06, 0.15], [0, 0.126, -0.205], plates, 0.032);
  for (const side of [-1, 1]) {
    box(head, "HelmetSideRail", [0.055, 0.14, 0.30], [side * 0.315, 0.135, 0], plates, 0.022);
    box(head, "HelmetCheekPlate", [0.08, 0.21, 0.18], [side * 0.258, -0.035, -0.045], armor, 0.032);
  }
  if (!lowPower) {
    for (const side of [-1, 1]) {
      box(head, "HelmetCommsEarCup", [0.105, 0.18, 0.175],
        [side * 0.308, -0.055, 0.024], plates, 0.035);
    }
    const commsBoom = box(head, "CommsMicrophoneBoom", [0.19, 0.025, 0.025],
      [-0.23, -0.185, -0.128], webbing, 0.009);
    commsBoom.rotation.y = -0.34;
  }
  if (type === "Commander") {
    box(head, "CommandStripe", [0.28, 0.025, 0.026], [0, 0.337, -0.065], fabricAccent, 0.009);
    box(head, "CommandAntennaBase", [0.08, 0.12, 0.09], [-0.23, 0.238, 0.07], webbing, 0.015);
  } else if (type === "Sniper") {
    box(head, "MarksmanHood", [0.58, 0.14, 0.38], [0, 0.29, 0.03], uniform, 0.07);
  } else if (type === "Heavy") {
    box(head, "FullBallisticFaceShield", [0.49, 0.28, 0.08], [0, -0.075, -0.282], glass, 0.04);
  }

  const lArm = limb(body, "LeftArmPivot", [-0.48, 1.77, -0.03], 0.62, uniform, plates, boots, false);
  const rArm = limb(body, "RightArmPivot", [0.48, 1.77, -0.03], 0.62, uniform, plates, boots, false);
  const lLeg = limb(body, "LeftLegPivot", [-0.19, 1.0, 0], 0.92, uniform, armor, boots, true);
  const rLeg = limb(body, "RightLegPivot", [0.19, 1.0, 0], 0.92, uniform, armor, boots, true);

  // Attachment anchor is hidden when enemyWeapons.ts equips the visible gun.
  const rifle = new THREE.Group();
  rifle.name = "WeaponPoseAnchor";
  rifle.position.set(0.36, 1.52, -0.47);
  body.add(rifle);

  body.userData.modelType = "original-soldier";
  body.userData.darkSectorOriginal = true;
  body.userData.soldierClass = type;
  body.userData.soldierVariation = seed % 5;
  body.userData.limbs = {
    hips, torso, head, lArm, rArm, lLeg, rLeg, rifle,
    lElbow: lArm.userData.lowerLimb, rElbow: rArm.userData.lowerLimb,
    lKnee: lLeg.userData.lowerLimb, rKnee: rLeg.userData.lowerLimb,
  };
  body.userData.soldierRigVersion = 2;
  body.userData.alive = true;
  body.userData.walkTime = (seed % 5) * 1.4;
  body.userData.actionLock = 0;
  body.userData.shootRecoil = 0;
  body.userData.baseY = 0;
  body.scale.setScalar(0.83);
  body.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
  return body;
}
