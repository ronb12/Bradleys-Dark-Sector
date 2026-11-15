/** Solo military supply pickups — medkits, ammo, armor, frags, intel. */
import * as THREE from "three";
import type { CombatSceneId } from "./scenes/types";
import {
  ARMOR_PLATE_HEAL,
  MAX_GRENADES,
  MAX_MEDKITS,
  applyArmorPlate,
} from "./survivability";

export type PickupKind = "medkit" | "ammo" | "armor" | "frag" | "intel";

export type PickupItem = {
  id: string;
  kind: PickupKind;
  x: number;
  z: number;
  mesh: THREE.Group;
  collected: boolean;
  respawnAt: number;
  /** Dynamic drops despawn if ignored. 0 = permanent layout pickup. */
  expireAt: number;
  dynamic: boolean;
};

export type PickupCollectEffect = {
  kind: PickupKind;
  label: string;
  x: number;
  z: number;
  color: number;
};

export type PickupSession = {
  root: THREE.Group;
  items: PickupItem[];
  sceneId: CombatSceneId;
  nextDynamicId: number;
};

const WALK_RADIUS = 1.55;
const PROMPT_RADIUS = 2.85;
const MAGNET_RADIUS = 2.15;
const DYNAMIC_TTL_SEC = 42;

const ACCENT: Record<PickupKind, number> = {
  medkit: 0xe74c3c,
  ammo: 0xe8b923,
  armor: 0x6eb6ff,
  frag: 0x8fbc8f,
  intel: 0x5eead4,
};

const LABELS: Record<PickupKind, string> = {
  medkit: "Medkit",
  ammo: "Ammo crate",
  armor: "Armor plates",
  frag: "Frag grenade",
  intel: "Tactical intel",
};

const RESPAWN_SEC: Partial<Record<PickupKind, number>> = {
  medkit: 85,
  ammo: 70,
  armor: 78,
  frag: 95,
};

/** Static supply layouts per combat map. */
const LAYOUTS: Record<CombatSceneId, ReadonlyArray<{ kind: PickupKind; x: number; z: number }>> = {
  compound: [
    { kind: "medkit", x: -14, z: 20 },
    { kind: "medkit", x: 24, z: -18 },
    { kind: "medkit", x: 46, z: -6 },
    { kind: "ammo", x: -32, z: -10 },
    { kind: "ammo", x: 38, z: 14 },
    { kind: "ammo", x: -6, z: 4 },
    { kind: "armor", x: -10, z: -26 },
    { kind: "armor", x: 20, z: 32 },
    { kind: "frag", x: -38, z: 24 },
    { kind: "frag", x: 10, z: -38 },
    { kind: "intel", x: 44, z: -8 },
    { kind: "intel", x: -44, z: 6 },
  ],
  desert: [
    { kind: "medkit", x: -10, z: 18 },
    { kind: "medkit", x: 12, z: -8 },
    { kind: "ammo", x: -16, z: -14 },
    { kind: "ammo", x: 8, z: 22 },
    { kind: "armor", x: 0, z: 4 },
    { kind: "frag", x: -20, z: 8 },
    { kind: "intel", x: 14, z: -18 },
  ],
  urban: [
    { kind: "medkit", x: -12, z: 16 },
    { kind: "medkit", x: 10, z: -6 },
    { kind: "ammo", x: -8, z: -12 },
    { kind: "ammo", x: 14, z: 10 },
    { kind: "armor", x: 2, z: 6 },
    { kind: "frag", x: -16, z: 4 },
    { kind: "intel", x: 8, z: -16 },
  ],
  mountain: [
    { kind: "medkit", x: -8, z: 14 },
    { kind: "medkit", x: 10, z: -4 },
    { kind: "ammo", x: -14, z: -8 },
    { kind: "ammo", x: 6, z: 18 },
    { kind: "armor", x: 0, z: 2 },
    { kind: "frag", x: -12, z: 22 },
    { kind: "intel", x: 12, z: -14 },
  ],
};

function mat(color: number, roughness = 0.82, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function accentMat(kind: PickupKind, lowPower: boolean) {
  const m = mat(ACCENT[kind], 0.45, 0.18);
  m.emissive = new THREE.Color(ACCENT[kind]);
  m.emissiveIntensity = lowPower ? 0.14 : 0.38;
  return m;
}

function addBeacon(g: THREE.Group, kind: PickupKind, lowPower: boolean) {
  const color = ACCENT[kind];
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.09, 1.35, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: lowPower ? 0.22 : 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 1.05;
  beam.name = "PickupBeacon";
  g.add(beam);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.62, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = "PickupRing";
  g.add(ring);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: lowPower ? 0.12 : 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  halo.name = "PickupHalo";
  g.add(halo);

  if (!lowPower) {
    const glow = new THREE.PointLight(color, 0.72, 5.2, 2);
    glow.position.set(0, 0.7, 0);
    glow.name = "PickupLight";
    g.add(glow);
  }
}

function buildPickupMesh(kind: PickupKind, lowPower: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = `Pickup_${kind}`;
  const bodyMat = mat(
    kind === "medkit" ? 0xe8ebe2
      : kind === "ammo" ? 0x6b5a32
        : kind === "armor" ? 0x3d4654
          : kind === "frag" ? 0x3a4634
            : 0x243040,
  );
  const accent = accentMat(kind, lowPower);

  if (kind === "medkit") {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.4), bodyMat);
    bag.position.y = 0.2;
    bag.castShadow = !lowPower;
    g.add(bag);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.08), mat(0x2c3e50, 0.7, 0.1));
    strap.position.set(0, 0.28, 0);
    g.add(strap);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), accent);
    crossH.position.set(0, 0.28, 0.22);
    g.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), accent);
    crossV.position.set(0, 0.28, 0.22);
    g.add(crossV);
  } else if (kind === "armor") {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.36, 0.44), bodyMat);
    pack.position.y = 0.22;
    pack.castShadow = !lowPower;
    g.add(pack);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.08), accent);
    plate.position.set(0, 0.4, 0.2);
    g.add(plate);
    const rivetL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), mat(0xc0c8d0, 0.4, 0.55));
    rivetL.position.set(-0.16, 0.48, 0.25);
    g.add(rivetL);
    const rivetR = rivetL.clone();
    rivetR.position.x = 0.16;
    g.add(rivetR);
  } else if (kind === "frag") {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.32, 10), bodyMat);
    can.position.y = 0.28;
    can.castShadow = !lowPower;
    g.add(can);
    const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), accent);
    spoon.position.set(0.12, 0.36, 0);
    g.add(spoon);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), accent);
    pin.position.set(0.05, 0.48, 0);
    pin.rotation.y = Math.PI / 2;
    g.add(pin);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), mat(0x4a4030, 0.88, 0.05));
    crate.position.y = 0.08;
    g.add(crate);
  } else if (kind === "intel") {
    const caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), bodyMat);
    caseBody.position.y = 0.22;
    caseBody.castShadow = !lowPower;
    g.add(caseBody);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.36), accent);
    lid.position.set(0, 0.32, 0.02);
    lid.rotation.x = -0.35;
    g.add(lid);
    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.28), mat(0x111820, 0.5, 0.4));
    drive.position.set(0, 0.28, -0.02);
    g.add(drive);
  } else {
    // ammo
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.48, 0.56), bodyMat);
    crate.position.y = 0.26;
    crate.castShadow = !lowPower;
    g.add(crate);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.09, 0.58), accent);
    band.position.y = 0.26;
    g.add(band);
    const stencil = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.02), accent);
    stencil.position.set(0, 0.42, 0.29);
    g.add(stencil);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.08), mat(0x2a2e28, 0.55, 0.35));
    mag.position.set(0.18, 0.58, 0);
    g.add(mag);
    const mag2 = mag.clone();
    mag2.position.x = -0.05;
    g.add(mag2);
  }

  addBeacon(g, kind, lowPower);
  g.userData.pickupKind = kind;
  g.userData.baseY = 0;
  return g;
}

function makeItem(
  id: string,
  kind: PickupKind,
  x: number,
  z: number,
  mesh: THREE.Group,
  dynamic: boolean,
  expireAt = 0,
): PickupItem {
  mesh.position.set(x, 0, z);
  return { id, kind, x, z, mesh, collected: false, respawnAt: 0, expireAt, dynamic };
}

export function createPickupSession(
  parent: THREE.Object3D,
  sceneId: CombatSceneId = "compound",
  lowPower = false,
): PickupSession {
  const root = new THREE.Group();
  root.name = `SupplyPickups_${sceneId}`;
  parent.add(root);

  const layout = LAYOUTS[sceneId] ?? LAYOUTS.compound;
  const items: PickupItem[] = layout.map((def, i) => {
    const mesh = buildPickupMesh(def.kind, lowPower);
    root.add(mesh);
    return makeItem(`pickup-${sceneId}-${i}-${def.kind}`, def.kind, def.x, def.z, mesh, false);
  });

  return { root, items, sceneId, nextDynamicId: 1 };
}

export function resetPickupSession(session: PickupSession) {
  for (const item of session.items) {
    if (item.dynamic) {
      item.collected = true;
      item.mesh.visible = false;
      continue;
    }
    item.collected = false;
    item.respawnAt = 0;
    item.expireAt = 0;
    item.mesh.visible = true;
    item.mesh.position.set(item.x, 0, item.z);
    item.mesh.rotation.set(0, 0, 0);
  }
}

export function disposePickupSession(session: PickupSession, parent: THREE.Object3D) {
  parent.remove(session.root);
  session.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
    if (obj instanceof THREE.PointLight) obj.dispose();
  });
  session.items.length = 0;
}

export function respawnPickupsAfterWave(session: PickupSession, elapsed: number, wave: number) {
  const budget = wave % 3 === 0 ? 4 : 2;
  let spawned = 0;
  for (const item of session.items) {
    if (spawned >= budget) break;
    if (item.dynamic || !item.collected) continue;
    const delay = RESPAWN_SEC[item.kind] ?? 90;
    if (item.respawnAt > 0 && elapsed >= item.respawnAt) {
      item.collected = false;
      item.respawnAt = 0;
      item.mesh.visible = true;
      item.mesh.position.set(item.x, 0, item.z);
      spawned += 1;
    } else if (item.respawnAt === 0) {
      item.respawnAt = elapsed + delay * 0.32;
    }
  }
}

/** Chance-weighted loot drop after a kill. Heavies / commanders drop more often. */
export function rollDeathDropKind(enemyType: string): PickupKind | null {
  const elite = enemyType === "Heavy" || enemyType === "Commander";
  if (Math.random() > (elite ? 0.42 : 0.16)) return null;
  const roll = Math.random();
  if (elite) {
    if (roll < 0.28) return "medkit";
    if (roll < 0.5) return "ammo";
    if (roll < 0.68) return "armor";
    if (roll < 0.86) return "frag";
    return "intel";
  }
  if (roll < 0.34) return "ammo";
  if (roll < 0.55) return "medkit";
  if (roll < 0.78) return "frag";
  if (roll < 0.92) return "armor";
  return "intel";
}

export function spawnDynamicPickup(
  session: PickupSession,
  kind: PickupKind,
  x: number,
  z: number,
  elapsed: number,
  lowPower = false,
): PickupItem | null {
  // Cap litter so late waves stay readable.
  const liveDynamic = session.items.filter((i) => i.dynamic && !i.collected).length;
  if (liveDynamic >= 8) return null;

  const mesh = buildPickupMesh(kind, lowPower);
  mesh.scale.setScalar(0.92);
  session.root.add(mesh);
  const id = `drop-${session.sceneId}-${session.nextDynamicId++}`;
  const item = makeItem(id, kind, x, z, mesh, true, elapsed + DYNAMIC_TTL_SEC);
  session.items.push(item);
  return item;
}

export type PickupUpdateHooks = {
  playerX: number;
  playerZ: number;
  elapsed: number;
  interactPressed: boolean;
  lowPower: boolean;
};

export function updatePickups(
  session: PickupSession,
  hooks: PickupUpdateHooks,
): { effects: PickupCollectEffect[]; prompt: string | null } {
  const effects: PickupCollectEffect[] = [];
  let prompt: string | null = null;
  let nearestDist = PROMPT_RADIUS;

  for (const item of session.items) {
    if (item.collected) continue;

    if (item.dynamic && item.expireAt > 0 && hooks.elapsed >= item.expireAt) {
      item.collected = true;
      item.mesh.visible = false;
      continue;
    }

    const dist = Math.hypot(hooks.playerX - item.x, hooks.playerZ - item.z);
    const mesh = item.mesh;
    const near = dist < MAGNET_RADIUS;
    const bob = Math.sin(hooks.elapsed * 2.6 + item.x * 0.12) * (near ? 0.07 : 0.045);
    mesh.position.y = bob;
    mesh.rotation.y = hooks.elapsed * (near ? 1.15 : 0.62);

    // Soft magnet — pulls within prompt range so collecting feels intentional.
    if (dist < MAGNET_RADIUS && dist > 0.35) {
      const pull = (1 - dist / MAGNET_RADIUS) * 0.035;
      item.x += (hooks.playerX - item.x) * pull;
      item.z += (hooks.playerZ - item.z) * pull;
      mesh.position.x = item.x;
      mesh.position.z = item.z;
    }

    const pulse = 0.42 + Math.sin(hooks.elapsed * (near ? 5.2 : 3.2) + item.z) * (near ? 0.22 : 0.12);
    const ring = mesh.getObjectByName("PickupRing") as THREE.Mesh | undefined;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = pulse;
      const s = near ? 1.08 + Math.sin(hooks.elapsed * 6) * 0.06 : 1;
      ring.scale.set(s, s, s);
    }
    const beacon = mesh.getObjectByName("PickupBeacon") as THREE.Mesh | undefined;
    if (beacon?.material instanceof THREE.MeshBasicMaterial) {
      beacon.material.opacity = (hooks.lowPower ? 0.18 : 0.32) + pulse * 0.25;
    }
    const light = mesh.getObjectByName("PickupLight") as THREE.PointLight | undefined;
    if (light) light.intensity = near ? 1.05 : 0.65;

    if (dist < nearestDist) {
      nearestDist = dist;
      const verb = dist <= WALK_RADIUS ? "Collecting" : "[E] Collect";
      prompt = `${verb} ${LABELS[item.kind]}`;
    }

    const collect = dist <= WALK_RADIUS || (dist <= PROMPT_RADIUS && hooks.interactPressed);
    if (!collect) continue;

    item.collected = true;
    item.mesh.visible = false;
    if (!item.dynamic) {
      item.respawnAt = hooks.elapsed + (RESPAWN_SEC[item.kind] ?? 90);
    }
    effects.push({
      kind: item.kind,
      label: LABELS[item.kind],
      x: item.x,
      z: item.z,
      color: ACCENT[item.kind],
    });
  }

  return { effects, prompt };
}

export type PickupApplyState = {
  health: number;
  maxHealth: number;
  medkits: number;
  grenadesRemaining: number;
  score: number;
  activeWeapon: string;
  weaponAmmo: Record<string, number>;
  ammo: number;
  maxAmmo: number;
};

export type PickupWeaponCaps = {
  m4: number;
  smg: number;
  pistol: number;
};

/** Apply a collected pickup to live game state. Returns toast text when useful. */
export function applyPickupEffect(
  state: PickupApplyState,
  kind: PickupKind,
  caps: PickupWeaponCaps,
): string {
  switch (kind) {
    case "medkit":
      if (state.medkits >= MAX_MEDKITS) {
        // Convert overflow into immediate heal so the crate still feels useful.
        if (state.health < state.maxHealth) {
          const before = state.health;
          state.health = applyArmorPlate(state.health, state.maxHealth);
          return `Medkits full — field dressed +${state.health - before} HP`;
        }
        state.score += 25;
        return "Medkits full — +25 score";
      }
      state.medkits += 1;
      return `+1 medkit (${state.medkits}/${MAX_MEDKITS})`;
    case "ammo": {
      const before = state.ammo;
      state.weaponAmmo.m4 = caps.m4;
      state.weaponAmmo.smg = caps.smg;
      state.weaponAmmo.pistol = caps.pistol;
      state.maxAmmo = state.weaponAmmo[state.activeWeapon] ?? state.maxAmmo;
      state.ammo = state.maxAmmo;
      if (before >= state.maxAmmo) {
        state.score += 35;
        return "Mags full — +35 score";
      }
      return "All magazines topped off";
    }
    case "armor":
      if (state.health >= state.maxHealth) {
        state.score += 30;
        return "Armor saturated — +30 score";
      }
      state.health = applyArmorPlate(state.health, state.maxHealth);
      return `+${ARMOR_PLATE_HEAL} armor`;
    case "frag":
      if (state.grenadesRemaining >= MAX_GRENADES) {
        state.score += 40;
        return "Frags full — +40 score";
      }
      state.grenadesRemaining += 1;
      return `+1 frag (${state.grenadesRemaining}/${MAX_GRENADES})`;
    case "intel":
      state.score += 125;
      // Intel cache also tops the active mag and grants a spare frag when space exists.
      state.ammo = state.maxAmmo;
      state.weaponAmmo[state.activeWeapon] = state.maxAmmo;
      if (state.grenadesRemaining < MAX_GRENADES) state.grenadesRemaining += 1;
      return "+125 intel · mag topped · bonus frag";
    default:
      return "";
  }
}

export function pickupLabel(kind: PickupKind): string {
  return LABELS[kind];
}

export function pickupAccent(kind: PickupKind): number {
  return ACCENT[kind];
}
