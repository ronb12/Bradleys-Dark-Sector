/** Solo compound military supply pickups — medkits, ammo, armor, frags, intel. */
import * as THREE from "three";
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
};

export type PickupCollectEffect = {
  kind: PickupKind;
  label: string;
};

export type PickupSession = {
  root: THREE.Group;
  items: PickupItem[];
};

const WALK_RADIUS = 1.75;
const PROMPT_RADIUS = 2.35;

const PICKUP_DEFS: ReadonlyArray<{ kind: PickupKind; x: number; z: number }> = [
  { kind: "medkit", x: -14, z: 20 },
  { kind: "medkit", x: 24, z: -18 },
  { kind: "ammo", x: -32, z: -10 },
  { kind: "ammo", x: 38, z: 14 },
  { kind: "armor", x: -10, z: -26 },
  { kind: "armor", x: 20, z: 32 },
  { kind: "frag", x: -38, z: 24 },
  { kind: "frag", x: 10, z: -38 },
  { kind: "intel", x: 44, z: -8 },
  { kind: "intel", x: -44, z: 6 },
];

const RESPAWN_SEC: Partial<Record<PickupKind, number>> = {
  medkit: 90,
  ammo: 75,
  armor: 80,
  frag: 100,
};

const LABELS: Record<PickupKind, string> = {
  medkit: "Medkit",
  ammo: "Ammo crate",
  armor: "Armor plates",
  frag: "Frag grenade",
  intel: "Tactical intel",
};

function mat(color: number, roughness = 0.82, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function buildPickupMesh(kind: PickupKind, lowPower: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = `Pickup_${kind}`;

  const bodyMat = mat(
    kind === "medkit" ? 0xd8ddd0
      : kind === "ammo" ? 0x6b5a32
        : kind === "armor" ? 0x4a5568
          : kind === "frag" ? 0x3d4f34
            : 0x2a3540,
  );
  const accent = mat(
    kind === "medkit" ? 0xc0392b
      : kind === "ammo" ? 0xc9a227
        : kind === "armor" ? 0x7eb6ff
          : kind === "frag" ? 0x8fbc8f
            : 0x67e8f9,
    0.55,
    0.12,
  );
  accent.emissive = new THREE.Color(accent.color);
  accent.emissiveIntensity = lowPower ? 0.08 : 0.22;

  if (kind === "medkit") {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.38), bodyMat);
    bag.position.y = 0.18;
    bag.castShadow = !lowPower;
    g.add(bag);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.06), accent);
    crossH.position.set(0, 0.24, 0.2);
    g.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), accent);
    crossV.position.set(0, 0.24, 0.2);
    g.add(crossV);
  } else if (kind === "armor") {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.42), bodyMat);
    pack.position.y = 0.2;
    pack.castShadow = !lowPower;
    g.add(pack);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.08), accent);
    plate.position.set(0, 0.38, 0.18);
    g.add(plate);
  } else {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.62), bodyMat);
    crate.position.y = 0.28;
    crate.castShadow = !lowPower;
    g.add(crate);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.64), accent);
    band.position.y = 0.28;
    g.add(band);
    if (kind === "intel") {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.36), accent);
      tab.position.set(0.12, 0.58, 0.05);
      tab.rotation.y = 0.35;
      g.add(tab);
    }
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({
      color: accent.color.getHex(),
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.name = "PickupRing";
  g.add(ring);

  if (!lowPower) {
    const glow = new THREE.PointLight(accent.color.getHex(), 0.55, 4.5, 2);
    glow.position.set(0, 0.65, 0);
    g.add(glow);
  }

  g.userData.pickupKind = kind;
  g.userData.baseY = 0;
  return g;
}

export function createPickupSession(parent: THREE.Object3D, lowPower = false): PickupSession {
  const root = new THREE.Group();
  root.name = "CompoundPickups";
  parent.add(root);

  const items: PickupItem[] = PICKUP_DEFS.map((def, i) => {
    const mesh = buildPickupMesh(def.kind, lowPower);
    mesh.position.set(def.x, 0, def.z);
    root.add(mesh);
    return {
      id: `pickup-${i}-${def.kind}`,
      kind: def.kind,
      x: def.x,
      z: def.z,
      mesh,
      collected: false,
      respawnAt: 0,
    };
  });

  return { root, items };
}

export function resetPickupSession(session: PickupSession) {
  for (const item of session.items) {
    item.collected = false;
    item.respawnAt = 0;
    item.mesh.visible = true;
    item.mesh.position.y = 0;
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
  });
}

export function respawnPickupsAfterWave(session: PickupSession, elapsed: number, wave: number) {
  const budget = wave % 3 === 0 ? 3 : 2;
  let spawned = 0;
  for (const item of session.items) {
    if (spawned >= budget) break;
    if (!item.collected) continue;
    const delay = RESPAWN_SEC[item.kind] ?? 90;
    if (item.respawnAt > 0 && elapsed >= item.respawnAt) {
      item.collected = false;
      item.respawnAt = 0;
      item.mesh.visible = true;
      spawned += 1;
    } else if (item.respawnAt === 0) {
      item.respawnAt = elapsed + delay * 0.35;
    }
  }
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

    const dist = Math.hypot(hooks.playerX - item.x, hooks.playerZ - item.z);
    const mesh = item.mesh;
    const bob = Math.sin(hooks.elapsed * 2.4 + item.x * 0.1) * 0.04;
    mesh.position.y = bob;
    mesh.rotation.y = hooks.elapsed * 0.55;

    const ring = mesh.getObjectByName("PickupRing") as THREE.Mesh | undefined;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = 0.32 + Math.sin(hooks.elapsed * 3.5 + item.z) * 0.12;
    }

    if (dist < nearestDist) {
      nearestDist = dist;
      prompt = `[E] Collect ${LABELS[item.kind]}`;
    }

    const collect = dist <= WALK_RADIUS || (dist <= PROMPT_RADIUS && hooks.interactPressed);
    if (!collect) continue;

    item.collected = true;
    item.mesh.visible = false;
    item.respawnAt = hooks.elapsed + (RESPAWN_SEC[item.kind] ?? 90);
    effects.push({ kind: item.kind, label: LABELS[item.kind] });
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
      state.medkits = Math.min(MAX_MEDKITS, state.medkits + 1);
      return "+1 medkit";
    case "ammo":
      state.weaponAmmo.m4 = caps.m4;
      state.weaponAmmo.smg = caps.smg;
      state.weaponAmmo.pistol = caps.pistol;
      state.maxAmmo = state.weaponAmmo[state.activeWeapon] ?? state.maxAmmo;
      state.ammo = state.maxAmmo;
      return "Magazines topped off";
    case "armor":
      state.health = applyArmorPlate(state.health, state.maxHealth);
      return `+${ARMOR_PLATE_HEAL} armor`;
    case "frag":
      state.grenadesRemaining = Math.min(MAX_GRENADES, state.grenadesRemaining + 1);
      return "+1 frag";
    case "intel":
      state.score += 75;
      return "+75 intel score";
    default:
      return "";
  }
}

export function pickupLabel(kind: PickupKind): string {
  return LABELS[kind];
}
