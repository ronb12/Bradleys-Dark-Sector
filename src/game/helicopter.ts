/** Procedural / GLB extract helicopter — approach, hover, depart + wash FX. */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** North yard pad — kept clear of flank warehouses (was -22,12 → ~21m to nearest wall). */
export const EXTRACT_LZ = { x: 0, z: 40, radius: 8 } as const;
/** Seconds the player must remain inside the LZ (progress pauses when leaving). */
export const EXTRACT_HOLD_SEC = 20;

export const UH60_GLB_URL = "/models/uh60-extract.glb";

export type HeliPhase = "hidden" | "inbound" | "hover" | "land" | "board" | "depart";
export type HeliVisualMode = "procedural" | "glb";

export type ExtractionHelicopter = {
  root: THREE.Group;
  /** Visual body parent — procedural mesh or loaded GLB. */
  body: THREE.Group;
  mainRotor: THREE.Object3D;
  tailRotor: THREE.Object3D;
  /** Semi-transparent spinning disc for blade motion blur. */
  rotorDisc: THREE.Mesh;
  cabinLight: THREE.PointLight;
  navLights: THREE.PointLight[];
  dustWash: THREE.Points;
  grassWash: THREE.Points;
  washRing: THREE.Mesh;
  phase: HeliPhase;
  /** 0–1 within current phase. */
  phaseT: number;
  lzX: number;
  lzZ: number;
  approachFrom: THREE.Vector3;
  hoverY: number;
  /** Skids-near-ground altitude during land / board. */
  landY: number;
  visualMode: HeliVisualMode;
  glbLoaded: boolean;
};

type WashUserData = {
  base: Float32Array;
  velocities: Float32Array;
};

function mat(
  color: number,
  opts?: { metal?: number; rough?: number; emissive?: number; emissiveIntensity?: number },
) {
  // Never pass `emissive: undefined` — Three r185 warns and treats it as an explicit param.
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts?.metal ?? 0.55,
    roughness: opts?.rough ?? 0.42,
    emissive: new THREE.Color(opts?.emissive ?? 0x000000),
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
  });
}

function makeWashPoints(
  count: number,
  color: number,
  size: number,
  opacity: number,
): THREE.Points {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.8 + Math.random() * 5.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.08 + Math.random() * 0.35;
    positions[i * 3 + 2] = z;
    base[i * 3] = x;
    base[i * 3 + 1] = positions[i * 3 + 1];
    base[i * 3 + 2] = z;
    velocities[i * 3] = Math.cos(a) * (1.2 + Math.random() * 2.4);
    velocities[i * 3 + 1] = 0.4 + Math.random() * 1.8;
    velocities[i * 3 + 2] = Math.sin(a) * (1.2 + Math.random() * 2.4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, material);
  points.visible = false;
  points.frustumCulled = false;
  (points.userData as WashUserData).base = base;
  (points.userData as WashUserData).velocities = velocities;
  return points;
}

function makeWashRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(1.4, 7.8, 48);
  const material = new THREE.MeshBasicMaterial({
    color: 0xc4a574,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  return ring;
}

/** Cabin seat / cinematic camera offset (local to heli root — nose +Z). */
export const HELI_CABIN_CAMERA_OFFSET = new THREE.Vector3(0.15, 1.55, 0.35);

/** Build troop/pilot cabin — used by procedural body and injected into GLB. */
export function buildHeliCabinInterior(): THREE.Group {
  const cabin = new THREE.Group();
  cabin.name = "HeliCabinInterior";

  const olive = mat(0x3a4234, { metal: 0.35, rough: 0.7 });
  const dark = mat(0x1a1e1a, { metal: 0.4, rough: 0.55 });
  const seat = mat(0x2a3228, { metal: 0.15, rough: 0.85 });
  const seatPad = mat(0x4a5438, { metal: 0.08, rough: 0.9 });
  const dash = mat(0x121612, { metal: 0.55, rough: 0.35 });
  const glow = mat(0x6ad4a0, { metal: 0.1, rough: 0.4, emissive: 0x1a6a48, emissiveIntensity: 1.1 });
  const amber = mat(0xd4a017, { metal: 0.2, rough: 0.45, emissive: 0x664400, emissiveIntensity: 0.55 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x7ab0c0,
    metalness: 0.15,
    roughness: 0.12,
    emissive: new THREE.Color(0x1a3040),
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const fabric = mat(0x5a4830, { metal: 0.05, rough: 0.92 });

  // Cabin volume — open sides for doorways; walls only where needed.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 3.6), dark);
  floor.position.set(0, 0.72, 0.15);
  floor.receiveShadow = true;
  cabin.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 3.4), olive);
  ceiling.position.set(0, 2.35, 0.1);
  cabin.add(ceiling);

  // Forward bulkhead + windshield frame
  const bulkhead = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.55, 0.08), olive);
  bulkhead.position.set(0, 1.5, 2.05);
  cabin.add(bulkhead);
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), glass);
  windshield.name = "CabinWindshield";
  windshield.position.set(0, 1.85, 2.02);
  cabin.add(windshield);

  // Side window strips (open door mid-cabin)
  for (const x of [-1.05, 1.05]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 3.5), olive);
    frame.position.set(x, 1.5, 0.1);
    cabin.add(frame);
    const winF = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), glass);
    winF.position.set(x * 0.99, 1.85, 1.35);
    winF.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    cabin.add(winF);
    const winR = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), glass);
    winR.position.set(x * 0.99, 1.85, -0.85);
    winR.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    cabin.add(winR);
  }

  // Instrument dash
  const console = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.35, 0.55), dash);
  console.name = "Dash";
  console.position.set(0, 1.15, 1.65);
  cabin.add(console);
  for (let i = 0; i < 4; i += 1) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.02), i % 2 === 0 ? glow : amber);
    screen.position.set(-0.5 + i * 0.35, 1.28, 1.4);
    cabin.add(screen);
  }
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 8), dark);
  stick.position.set(-0.35, 1.0, 1.35);
  cabin.add(stick);
  const stickR = stick.clone();
  stickR.position.x = 0.35;
  cabin.add(stickR);

  const makeSeat = (x: number, z: number, rotY = 0) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), seat);
    base.position.y = 0.9;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.1), seatPad);
    back.position.set(0, 1.2, -0.2);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.42), seatPad);
    cushion.position.y = 0.98;
    g.add(base, back, cushion);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    cabin.add(g);
  };

  // Pilot / co-pilot
  makeSeat(-0.42, 1.15);
  makeSeat(0.42, 1.15);
  // Troop benches along sides (face inward)
  makeSeat(-0.72, 0.15, Math.PI / 2);
  makeSeat(-0.72, -0.65, Math.PI / 2);
  makeSeat(0.72, 0.15, -Math.PI / 2);
  makeSeat(0.72, -0.65, -Math.PI / 2);

  // Rear cargo bench
  const troopBench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.45), fabric);
  troopBench.position.set(0, 0.95, -1.35);
  cabin.add(troopBench);
  const troopBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.08), seat);
  troopBack.position.set(0, 1.25, -1.55);
  cabin.add(troopBack);

  // Overhead grab rail + cabin dome light mesh
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8, 8), dark);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 2.15, 0.1);
  cabin.add(rail);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe0a0,
      emissive: new THREE.Color(0xffc878),
      emissiveIntensity: 1.4,
      roughness: 0.35,
    }),
  );
  dome.name = "CabinDome";
  dome.position.set(0, 2.22, 0.2);
  cabin.add(dome);

  // Door threshold chevrons
  for (const x of [-1.02, 1.02]) {
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.1), amber);
    chevron.position.set(x, 0.78, 0.25);
    cabin.add(chevron);
  }

  return cabin;
}

/** Curved UH-60-style extract bird — exterior + hollow cabin. */
function buildProceduralBody(): {
  body: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  rotorDisc: THREE.Mesh;
} {
  const body = new THREE.Group();
  body.name = "heliProceduralBody";

  const bodyMat = mat(0x3a4634, { metal: 0.62, rough: 0.38 });
  const darkMat = mat(0x141914, { metal: 0.48, rough: 0.5 });
  const panelMat = mat(0x2a3428, { metal: 0.55, rough: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6a9aaa,
    metalness: 0.12,
    roughness: 0.1,
    emissive: new THREE.Color(0x1a3040),
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.55,
  });
  const rotorMat = mat(0x0c100c, { metal: 0.3, rough: 0.65 });
  const accentMat = mat(0xb89a3a, { metal: 0.4, rough: 0.45, emissive: 0x664400, emissiveIntensity: 0.18 });
  const tireMat = mat(0x0a0a0a, { metal: 0.15, rough: 0.9 });
  const exhaustMat = mat(0x3a3028, { metal: 0.72, rough: 0.32 });

  // Fuselage shell — curved ends + open mid-cabin for boarding POV.
  const rearHull = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), bodyMat);
  rearHull.scale.set(1.0, 0.85, 1.15);
  rearHull.position.set(0, 1.55, -1.55);
  rearHull.castShadow = true;
  body.add(rearHull);
  const roof = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 2.4, 6, 14), bodyMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, 2.35, 0.1);
  roof.scale.set(1, 0.55, 1.05);
  roof.castShadow = true;
  body.add(roof);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.8, 6, 12), panelMat);
  belly.rotation.z = Math.PI / 2;
  belly.rotation.y = Math.PI / 2;
  belly.position.set(0, 0.78, 0.15);
  belly.scale.set(1, 0.45, 1.0);
  body.add(belly);
  // Side skins (outward only) leave door cutouts open
  for (const x of [-1.1, 1.1]) {
    const skinF = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), bodyMat);
    skinF.position.set(x, 1.55, 1.35);
    skinF.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    body.add(skinF);
    const skinR = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), bodyMat);
    skinR.position.set(x, 1.55, -1.15);
    skinR.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    body.add(skinR);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 4.2), panelMat);
    rail.position.set(x * 0.98, 2.15, 0.05);
    body.add(rail);
  }

  // Cockpit nose blister
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), bodyMat);
  nose.scale.set(1.05, 0.85, 1.35);
  nose.position.set(0, 1.55, 2.85);
  nose.castShadow = true;
  body.add(nose);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), darkMat);
  chin.scale.set(1.2, 0.55, 1.1);
  chin.position.set(0, 0.95, 3.15);
  body.add(chin);

  // Angled windshield panes
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.95, 0.06), glassMat);
  windshield.position.set(0, 1.95, 3.45);
  windshield.rotation.x = -0.35;
  body.add(windshield);
  for (const x of [-0.88, 0.88]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 1.15), glassMat);
    sideGlass.position.set(x, 1.85, 2.65);
    sideGlass.rotation.y = x > 0 ? 0.12 : -0.12;
    body.add(sideGlass);
  }

  // Twin engine nacelles with IR suppressors
  for (const x of [-0.78, 0.78]) {
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.55, 6, 12), darkMat);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.rotation.y = Math.PI / 2;
    nacelle.position.set(x, 2.55, 0.05);
    nacelle.castShadow = true;
    body.add(nacelle);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.22, 12), exhaustMat);
    intake.rotation.x = Math.PI / 2;
    intake.position.set(x, 2.55, 1.0);
    body.add(intake);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.55, 10), exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(x, 2.62, -0.95);
    body.add(exhaust);
  }

  // ESSS stub wings + pylons (UH-60 silhouette cue)
  for (const x of [-1.55, 1.55]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.55), panelMat);
    stub.position.set(x * 0.55, 1.35, 0.15);
    stub.rotation.z = x > 0 ? -0.08 : 0.08;
    body.add(stub);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.18), darkMat);
    pylon.position.set(x * 0.95, 1.05, 0.15);
    body.add(pylon);
  }

  // Sliding cabin doors (right door slid aft for boarding)
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.35, 1.65), accentMat);
  doorL.position.set(-1.12, 1.45, 0.15);
  body.add(doorL);
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.35, 1.05), accentMat);
  doorR.position.set(1.12, 1.45, -0.45);
  body.add(doorR);
  const doorOpen = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.35, 0.55), panelMat);
  doorOpen.position.set(1.12, 1.45, 0.95);
  body.add(doorOpen);

  // Sills under door openings
  for (const x of [-1.08, 1.08]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 3.6), darkMat);
    sill.position.set(x, 0.82, 0.1);
    body.add(sill);
  }

  // Tapered tail boom + empennage
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.38, 5.4, 12), darkMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 1.95, -4.55);
  boom.castShadow = true;
  body.add(boom);
  const boomFairing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.9), panelMat);
  boomFairing.position.set(0, 2.05, -2.55);
  body.add(boomFairing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.05, 1.45), darkMat);
  fin.position.set(0, 2.85, -6.75);
  body.add(fin);
  const stabL = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.09, 0.75), darkMat);
  stabL.position.set(-1.05, 2.15, -6.35);
  stabL.rotation.z = 0.14;
  body.add(stabL);
  const stabR = stabL.clone();
  stabR.position.x = 1.05;
  stabR.rotation.z = -0.14;
  body.add(stabR);

  // Wheeled landing gear
  for (const x of [-0.95, 0.95]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.95, 8), darkMat);
    strut.position.set(x, 0.85, 0.35);
    body.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 14), tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.32, 0.35);
    body.add(wheel);
  }
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), darkMat);
  noseStrut.position.set(0, 0.8, 2.55);
  body.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), tireMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, 0.38, 2.55);
  body.add(noseWheel);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), darkMat);
  mast.position.set(0.35, 2.85, 1.8);
  body.add(mast);
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), darkMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(-0.55, 1.55, 3.55);
  body.add(pitot);

  const navRed = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 1.2 }),
  );
  navRed.position.set(-1.25, 1.55, 0.9);
  body.add(navRed);
  const navGreen = navRed.clone();
  (navGreen.material as THREE.MeshStandardMaterial).color.setHex(0x22ff66);
  (navGreen.material as THREE.MeshStandardMaterial).emissive.setHex(0x008833);
  navGreen.position.set(1.25, 1.55, 0.9);
  body.add(navGreen);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.42, 14), darkMat);
  hub.position.set(0, 2.95, 0.1);
  hub.name = "Hub";
  body.add(hub);

  const mainRotor = new THREE.Group();
  mainRotor.name = "mainRotor";
  mainRotor.position.set(0, 3.18, 0.1);
  const bladeGeo = new THREE.BoxGeometry(0.38, 0.045, 8.2);
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, rotorMat);
    blade.name = `Blade${i}`;
    blade.rotation.y = (i * Math.PI) / 2;
    blade.rotation.z = i % 2 === 0 ? 0.04 : -0.04;
    blade.castShadow = true;
    mainRotor.add(blade);
  }
  body.add(mainRotor);

  const rotorDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 48),
    new THREE.MeshBasicMaterial({
      color: 0x1a1e1a,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  rotorDisc.rotation.x = -Math.PI / 2;
  rotorDisc.position.set(0, 3.15, 0.1);
  rotorDisc.visible = false;
  body.add(rotorDisc);

  const tailRotor = new THREE.Group();
  tailRotor.name = "tailRotor";
  tailRotor.position.set(0.58, 2.65, -7.05);
  const tBladeGeo = new THREE.BoxGeometry(0.08, 1.5, 0.2);
  for (let i = 0; i < 4; i += 1) {
    const tBlade = new THREE.Mesh(tBladeGeo, rotorMat);
    tBlade.name = `TailBlade${i}`;
    tBlade.rotation.x = (i * Math.PI) / 2;
    tailRotor.add(tBlade);
  }
  const trHub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), darkMat);
  trHub.name = "TailRotorHub";
  trHub.rotation.z = Math.PI / 2;
  tailRotor.add(trHub);
  body.add(tailRotor);

  body.add(buildHeliCabinInterior());

  return { body, mainRotor, tailRotor, rotorDisc };
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

/** Build a lightweight UH-60 / Huey-ready extract bird suitable for mobile / XR. */
export function createExtractionHelicopter(lzX = EXTRACT_LZ.x, lzZ = EXTRACT_LZ.z): ExtractionHelicopter {
  const root = new THREE.Group();
  root.name = "extractionHelicopter";
  root.visible = false;

  const { body, mainRotor, tailRotor, rotorDisc } = buildProceduralBody();
  root.add(body);

  const cabinLight = new THREE.PointLight(0xe8c56a, 0, 18, 1.8);
  cabinLight.position.set(0, 1.4, 0.4);
  root.add(cabinLight);

  const navL = new THREE.PointLight(0xff3333, 0, 10, 2);
  navL.position.set(-1.3, 1.6, 0.5);
  const navR = new THREE.PointLight(0x33ff66, 0, 10, 2);
  navR.position.set(1.3, 1.6, 0.5);
  root.add(navL, navR);

  const dustWash = makeWashPoints(48, 0xc2a882, 0.22, 0.55);
  const grassWash = makeWashPoints(36, 0x6a8a4a, 0.16, 0.45);
  const washRing = makeWashRing();
  // World-anchored wash FX (parented under root but repositioned to LZ ground).
  root.add(dustWash, grassWash, washRing);

  const approachFrom = new THREE.Vector3(lzX - 48, 30, lzZ - 52);
  root.position.copy(approachFrom);

  return {
    root,
    body,
    mainRotor,
    tailRotor,
    rotorDisc,
    cabinLight,
    navLights: [navL, navR],
    dustWash,
    grassWash,
    washRing,
    phase: "hidden",
    phaseT: 0,
    lzX,
    lzZ,
    approachFrom,
    hoverY: 5.4,
    landY: 1.85,
    visualMode: "procedural",
    glbLoaded: false,
  };
}

/**
 * Desktop / high-quality path: swap procedural body for UH-60 GLB.
 * Safe to call multiple times; no-ops after first successful load.
 */
export async function upgradeExtractionHelicopterToGlb(
  heli: ExtractionHelicopter,
  opts?: { enabled?: boolean },
): Promise<boolean> {
  if (opts?.enabled === false || heli.glbLoaded || heli.visualMode === "glb") return false;
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(UH60_GLB_URL);
    const model = gltf.scene;
    model.name = "heliGlbBody";

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const target = 12.5;
    const scale = target / Math.max(0.001, longest);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaled.min.y + 0.05, -center.z);
    model.updateMatrixWorld(true);

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const mainSpin = new THREE.Group();
    mainSpin.name = "glbMainRotor";
    const tailSpin = new THREE.Group();
    tailSpin.name = "glbTailRotor";

    const hubObj = model.getObjectByName("Hub");
    const trHub = model.getObjectByName("TailRotorHub");
    const hubParent = hubObj?.parent ?? model;
    const trParent = trHub?.parent ?? model;

    if (hubObj) {
      hubParent.add(mainSpin);
      mainSpin.position.copy(hubObj.position);
    } else {
      model.add(mainSpin);
      mainSpin.position.set(0, 2.9, 0.1);
    }

    if (trHub) {
      trParent.add(tailSpin);
      tailSpin.position.copy(trHub.position);
    } else {
      model.add(tailSpin);
      tailSpin.position.set(0.55, 2.55, -6.85);
    }

    model.updateMatrixWorld(true);
    for (let i = 0; i < 4; i += 1) {
      const blade = model.getObjectByName(`Blade${i}`);
      if (blade) mainSpin.attach(blade);
      const tBlade = model.getObjectByName(`TailBlade${i}`);
      if (tBlade) tailSpin.attach(tBlade);
    }

    const rotorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0x151815,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    rotorDisc.rotation.x = -Math.PI / 2;
    rotorDisc.position.set(0, 0.2, 0);
    rotorDisc.visible = false;
    mainSpin.add(rotorDisc);

    heli.root.remove(heli.body);
    disposeObject3D(heli.body);
    // Prefer a readable cabin during board cinematic even on the GLB shell.
    if (!model.getObjectByName("HeliCabinInterior") && !model.getObjectByName("CabinFloor")) {
      model.add(buildHeliCabinInterior());
    }
    heli.root.add(model);
    heli.body = model as unknown as THREE.Group;
    heli.mainRotor = mainSpin;
    heli.tailRotor = tailSpin;
    heli.rotorDisc = rotorDisc;
    heli.visualMode = "glb";
    heli.glbLoaded = true;
    return true;
  } catch (error) {
    console.warn("[BDS] UH-60 GLB failed to load; keeping procedural heli", error);
    return false;
  }
}

export function resetExtractionHelicopter(heli: ExtractionHelicopter) {
  heli.phase = "hidden";
  heli.phaseT = 0;
  heli.root.visible = false;
  heli.root.position.copy(heli.approachFrom);
  heli.root.rotation.set(0, 0, 0);
  heli.cabinLight.intensity = 0;
  for (const light of heli.navLights) light.intensity = 0;
  heli.rotorDisc.visible = false;
  heli.dustWash.visible = false;
  heli.grassWash.visible = false;
  heli.washRing.visible = false;
  if (heli.washRing.material instanceof THREE.MeshBasicMaterial) {
    heli.washRing.material.opacity = 0;
  }
}

/** Begin inbound flight when the extract hold starts (player on LZ). */
export function startHeliInbound(heli: ExtractionHelicopter) {
  if (heli.phase !== "hidden" && heli.phase !== "depart") return;
  heli.phase = "inbound";
  heli.phaseT = 0;
  heli.root.visible = true;
  heli.root.position.copy(heli.approachFrom);
  const toLz = new THREE.Vector3(heli.lzX, heli.hoverY, heli.lzZ).sub(heli.approachFrom);
  heli.root.rotation.y = Math.atan2(toLz.x, toLz.z);
  heli.cabinLight.intensity = 2.4;
  for (const light of heli.navLights) light.intensity = 1.2;
}

export function startHeliDepart(heli: ExtractionHelicopter) {
  if (heli.phase === "depart" || heli.phase === "hidden") return;
  heli.phase = "depart";
  heli.phaseT = 0;
}

export type HeliUpdateOpts = {
  dt: number;
  /** 0–1 LZ hold progress (drives approach completion). */
  holdProgress: number;
  /** True once hold finished and bird is on station. */
  readyToBoard: boolean;
  /** True when the player has boarded — begins land→board→depart cinematic. */
  extracted: boolean;
  fxScale: number;
  /** Player world position for wash intensity / audio callers. */
  playerX?: number;
  playerZ?: number;
};

function updateWash(
  heli: ExtractionHelicopter,
  dt: number,
  intensity: number,
  fxScale: number,
) {
  const show = intensity > 0.08 && fxScale >= 0.3;
  heli.dustWash.visible = show;
  heli.grassWash.visible = show && fxScale >= 0.45;
  heli.washRing.visible = show;

  // Anchor wash to LZ ground (not under flying heli when far inbound).
  const groundY = 0.05;
  for (const pts of [heli.dustWash, heli.grassWash]) {
    pts.position.set(heli.lzX - heli.root.position.x, groundY - heli.root.position.y, heli.lzZ - heli.root.position.z);
  }
  heli.washRing.position.set(
    heli.lzX - heli.root.position.x,
    groundY - heli.root.position.y + 0.02,
    heli.lzZ - heli.root.position.z,
  );

  if (heli.washRing.material instanceof THREE.MeshBasicMaterial) {
    heli.washRing.material.opacity = Math.min(0.42, intensity * 0.5);
  }
  const ringScale = 0.85 + intensity * 0.55 + Math.sin(performance.now() * 0.006) * 0.05;
  heli.washRing.scale.setScalar(ringScale);

  if (!show) return;

  const animatePoints = (pts: THREE.Points, speed: number) => {
    const data = pts.userData as WashUserData;
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const count = arr.length / 3;
    for (let i = 0; i < count; i += 1) {
      const ix = i * 3;
      arr[ix] += data.velocities[ix] * dt * speed * intensity;
      arr[ix + 1] += data.velocities[ix + 1] * dt * speed * intensity;
      arr[ix + 2] += data.velocities[ix + 2] * dt * speed * intensity;
      if (arr[ix + 1] > 2.8 + Math.random() || Math.hypot(arr[ix], arr[ix + 2]) > 8.5) {
        arr[ix] = data.base[ix] * (0.6 + Math.random() * 0.5);
        arr[ix + 1] = 0.05 + Math.random() * 0.2;
        arr[ix + 2] = data.base[ix + 2] * (0.6 + Math.random() * 0.5);
      }
    }
    pos.needsUpdate = true;
    if (pts.material instanceof THREE.PointsMaterial) {
      pts.material.opacity = Math.min(0.7, 0.25 + intensity * 0.5);
    }
  };

  animatePoints(heli.dustWash, 1.15);
  if (heli.grassWash.visible) animatePoints(heli.grassWash, 0.85);
}

/**
 * Animate rotors / flight.
 * Sequence: inbound → hover → (on extract) land → board → depart.
 */
export function updateExtractionHelicopter(heli: ExtractionHelicopter, opts: HeliUpdateOpts) {
  const { dt, holdProgress, readyToBoard, extracted, fxScale } = opts;
  if (heli.phase === "hidden") return;

  const spin = 18 + fxScale * 10;
  heli.mainRotor.rotation.y += dt * spin;
  if (heli.visualMode === "glb") {
    heli.tailRotor.rotation.x += dt * spin * 1.6;
  } else {
    heli.tailRotor.rotation.x += dt * spin * 1.6;
  }

  const discOpacity = Math.min(
    0.4,
    0.12 + holdProgress * 0.28 + (heli.phase === "hover" || heli.phase === "land" || heli.phase === "board" ? 0.14 : 0),
  );
  heli.rotorDisc.visible = fxScale >= 0.35 && discOpacity > 0.14;
  if (heli.rotorDisc.material instanceof THREE.MeshBasicMaterial) {
    heli.rotorDisc.material.opacity = discOpacity;
  }
  heli.rotorDisc.rotation.z -= dt * spin * 0.35;

  const lightPulse = 0.85 + Math.sin(performance.now() * 0.008) * 0.25;
  const boardedGlow = heli.phase === "board" || heli.phase === "land" || readyToBoard;
  const cabinBoost = heli.phase === "board" || heli.phase === "depart" ? 7.5 : boardedGlow || heli.phase === "hover" ? 4.8 : 2.2;
  heli.cabinLight.intensity = cabinBoost * lightPulse * Math.min(1, fxScale + 0.35);
  // Keep the cabin dome lit for boarding POV.
  heli.cabinLight.distance = heli.phase === "board" || heli.phase === "depart" ? 10 : 18;
  heli.cabinLight.position.set(0, heli.phase === "board" || heli.phase === "depart" ? 2.05 : 1.4, 0.25);
  for (const light of heli.navLights) {
    light.intensity = 0.9 * lightPulse * Math.min(1, fxScale + 0.25);
  }

  // Kick cinematic landing once extract is secured.
  if (extracted && (heli.phase === "inbound" || heli.phase === "hover")) {
    heli.phase = "land";
    heli.phaseT = 0;
  }

  const hoverTarget = new THREE.Vector3(heli.lzX, heli.hoverY, heli.lzZ);
  const landTarget = new THREE.Vector3(heli.lzX, heli.landY, heli.lzZ);

  if (heli.phase === "inbound") {
    // Arrive over the pad during the hold; stay high until extract then land.
    const approach = Math.min(1, Math.max(holdProgress * 1.05, heli.phaseT));
    heli.phaseT = Math.min(1, heli.phaseT + dt / 12);
    const t = Math.max(approach, heli.phaseT * 0.6);
    const ease = t * t * (3 - 2 * t);
    heli.root.position.lerpVectors(heli.approachFrom, hoverTarget, ease);
    heli.root.position.y =
      THREE.MathUtils.lerp(heli.approachFrom.y, heli.hoverY, ease) + Math.sin(t * Math.PI) * 2.2;
    heli.root.rotation.z = Math.sin(t * Math.PI) * -0.08;
    const toLz = new THREE.Vector3(heli.lzX - heli.root.position.x, 0, heli.lzZ - heli.root.position.z);
    if (toLz.lengthSq() > 0.01) {
      heli.root.rotation.y = Math.atan2(toLz.x, toLz.z);
    }
    if (readyToBoard || extracted || t >= 0.98) {
      heli.phase = extracted ? "land" : "hover";
      heli.phaseT = 0;
      if (!extracted) heli.root.position.copy(hoverTarget);
    }
  } else if (heli.phase === "hover") {
    heli.phaseT += dt;
    const bob = Math.sin(heli.phaseT * 1.7) * 0.22;
    heli.root.position.set(heli.lzX, heli.hoverY + bob, heli.lzZ);
    heli.root.rotation.z = Math.sin(heli.phaseT * 1.2) * 0.03;
    heli.root.rotation.x = Math.sin(heli.phaseT * 0.9) * 0.025;
    if (extracted) {
      heli.phase = "land";
      heli.phaseT = 0;
    }
  } else if (heli.phase === "land") {
    // Descend from hover altitude to skids-near-pad.
    heli.phaseT = Math.min(1, heli.phaseT + dt / 2.8);
    const t = heli.phaseT;
    const ease = t * t * (3 - 2 * t);
    heli.root.position.lerpVectors(
      new THREE.Vector3(heli.lzX, heli.hoverY, heli.lzZ),
      landTarget,
      ease,
    );
    heli.root.rotation.x = THREE.MathUtils.lerp(0.04, 0, ease);
    heli.root.rotation.z = Math.sin(t * Math.PI) * 0.04;
    if (t >= 1) {
      heli.phase = "board";
      heli.phaseT = 0;
      heli.root.position.copy(landTarget);
      heli.root.rotation.x = 0;
      heli.root.rotation.z = 0;
    }
  } else if (heli.phase === "board") {
    // Hold on the pad so the player can "climb aboard" before lift-off.
    heli.phaseT += dt;
    const bob = Math.sin(heli.phaseT * 2.2) * 0.06;
    heli.root.position.set(heli.lzX, heli.landY + bob, heli.lzZ);
    heli.root.rotation.y += dt * 0.02;
    // ~3.6s on the skids, then climb out.
    if (heli.phaseT >= 3.6) {
      startHeliDepart(heli);
    }
  } else if (heli.phase === "depart") {
    heli.phaseT = Math.min(1, heli.phaseT + dt / 6.5);
    const t = heli.phaseT;
    const ease = t * t * (3 - 2 * t);
    // Nose up, climb, and bank away toward the approach origin.
    heli.root.position.x = THREE.MathUtils.lerp(heli.lzX, heli.lzX + 42, ease);
    heli.root.position.y = THREE.MathUtils.lerp(heli.landY, heli.landY + 38, ease);
    heli.root.position.z = THREE.MathUtils.lerp(heli.lzZ, heli.lzZ - 55, ease);
    heli.root.rotation.x = -ease * 0.42;
    heli.root.rotation.z = ease * 0.18;
    heli.root.rotation.y = Math.atan2(42, -55) + ease * 0.35;
    if (t >= 1) {
      heli.root.visible = false;
      heli.phase = "hidden";
      heli.cabinLight.intensity = 0;
      for (const light of heli.navLights) light.intensity = 0;
      heli.rotorDisc.visible = false;
      heli.dustWash.visible = false;
      heli.grassWash.visible = false;
      heli.washRing.visible = false;
    }
  }

  // Rotor wash intensifies as bird gets low over the LZ.
  const alt = heli.root.position.y;
  const distToLz = Math.hypot(heli.root.position.x - heli.lzX, heli.root.position.z - heli.lzZ);
  const nearPad = distToLz < 18;
  const washBoost = heli.phase === "land" || heli.phase === "board" ? 1.35 : 1;
  const washIntensity =
    nearPad && heli.phase !== "hidden"
      ? THREE.MathUtils.clamp((1 - (alt - 1.2) / 16) * (1 - distToLz / 22) * washBoost, 0, 1)
      : 0;
  updateWash(heli, dt, washIntensity, fxScale);
}

/** 0–1 proximity for rotor audio (callers feed into ImmersiveAudio). */
export function heliAudioProximity(heli: ExtractionHelicopter, playerX: number, playerZ: number): number {
  if (heli.phase === "hidden" || !heli.root.visible) return 0;
  const dx = heli.root.position.x - playerX;
  const dz = heli.root.position.z - playerZ;
  const dy = heli.root.position.y - 1.6;
  const dist = Math.hypot(dx, dy, dz);
  const proximity = THREE.MathUtils.clamp(1 - dist / 70, 0, 1);
  const phaseBoost = heli.phase === "hover" ? 1 : heli.phase === "inbound" ? 0.75 : 0.55;
  return proximity * phaseBoost;
}

export function disposeExtractionHelicopter(heli: ExtractionHelicopter, scene: THREE.Scene) {
  scene.remove(heli.root);
  disposeObject3D(heli.root);
}
