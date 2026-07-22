/** Friendly military NPCs — commander at FOB HQ and extract pilot at the LZ. */

import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { ExtractionHelicopter, HeliPhase } from "./helicopter";
import { EXTRACT_LZ } from "./helicopter";
import {
  allowRadioCue,
  commanderBanterLine,
  commanderBriefLine,
  commanderExtractLine,
  pilotAckLine,
  pilotBoardLine,
  pilotInboundLine,
} from "./radioLines";

export type AlliedRole = "commander" | "pilot";

/** North gate HQ checkpoint — faces south toward the compound yard. */
export const COMMANDER_SPAWN = { x: 0, z: 54, rotY: Math.PI, interactRadius: 3.8 } as const;

/** Pilot stands east of the pad while the bird is on station. */
export const PILOT_LZ_OFFSET = { x: 5.5, z: -1.2, interactRadius: 5.5 } as const;

const MANUAL_TALK_COOLDOWN_MS = 14_000;
const AUTO_BRIEF_COOLDOWN_MS = 45_000;
const PILOT_TALK_COOLDOWN_MS = 12_000;

export type AlliedNpc = {
  role: AlliedRole;
  mesh: THREE.Group;
  label: THREE.Sprite;
  baseX: number;
  baseZ: number;
  baseRotY: number;
  interactRadius: number;
  visible: boolean;
  lastTalkAt: number;
  manualTalks: number;
};

export type AlliedNpcState = {
  npcs: AlliedNpc[];
  spawned: boolean;
  commanderWelcomed: boolean;
  pilotBoardCue: boolean;
  pilotAcked: boolean;
  lastPilotPhase: HeliPhase | "hidden";
  radioLine: string;
  radioLineUntil: number;
};

export type AlliedNpcContext = {
  scene: THREE.Scene;
  mixers: THREE.AnimationMixer[];
  allies: THREE.Group[];
  enemyTemplate: THREE.Group | null;
  fbxModeLoaded: boolean;
  getClip: (preferred: string[]) => THREE.AnimationClip | null;
  playClip: (mesh: THREE.Group, preferred: string[]) => void;
  makeProceduralAlly: (name: string, role: AlliedRole) => THREE.Group;
  playRadio: (line: string, opts?: { channel?: "mission" | "range" }) => void;
  playerX: number;
  playerZ: number;
  gameMode: string;
  running: boolean;
  extractMissionActive: boolean;
  extractPhase: number;
  heli: ExtractionHelicopter | null;
  interactPressed: boolean;
  nowMs: number;
};

export function createAlliedNpcState(): AlliedNpcState {
  return {
    npcs: [],
    spawned: false,
    commanderWelcomed: false,
    pilotBoardCue: false,
    pilotAcked: false,
    lastPilotPhase: "hidden",
    radioLine: "",
    radioLineUntil: 0,
  };
}

function makeNameTag(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 10, 240, 44);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 2.35;
  sprite.renderOrder = 5;
  return sprite;
}

function tintAllyMesh(mesh: THREE.Group, role: AlliedRole) {
  const uniform = role === "commander" ? new THREE.Color(0x4a5c42) : new THREE.Color(0x3d4f52);
  const vest = role === "commander" ? new THREE.Color(0x1a3550) : new THREE.Color(0x2a4038);
  const accent = role === "commander" ? new THREE.Color(0xc8a84a) : new THREE.Color(0x7aa8c8);

  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const name = child.name.toLowerCase();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const next = material.clone();
      if (name.includes("helmet") || name.includes("head")) {
        next.color.copy(uniform).multiplyScalar(0.92);
      } else if (name.includes("vest") || name.includes("plate") || name.includes("armor")) {
        next.color.copy(vest);
        next.emissive.copy(accent).multiplyScalar(0.08);
        next.emissiveIntensity = 0.35;
      } else {
        next.color.copy(uniform);
      }
      next.metalness = Math.min(next.metalness ?? 0, 0.12);
      next.roughness = Math.max(next.roughness ?? 0.8, 0.72);
      child.material = next;
    }
  });
}

function groundAlign(mesh: THREE.Group) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  if (!Number.isFinite(box.min.y)) {
    mesh.userData.groundOffset = 0;
    return;
  }
  const offset = -box.min.y;
  mesh.userData.groundOffset = offset;
  mesh.position.y = offset;
  mesh.userData.baseY = offset;
}

function buildAllyMesh(
  ctx: AlliedNpcContext,
  role: AlliedRole,
  displayName: string,
): { mesh: THREE.Group; label: THREE.Sprite } {
  const mesh = ctx.enemyTemplate
    ? (cloneSkeleton(ctx.enemyTemplate) as THREE.Group)
    : ctx.makeProceduralAlly(displayName, role);

  mesh.name = displayName;
  mesh.userData = {
    ...mesh.userData,
    allied: true,
    alliedRole: role,
    alive: true,
    modelType: ctx.enemyTemplate ? (ctx.fbxModeLoaded ? "fbx-mixamo" : "mixamo-glb") : "procedural3d",
    walkTime: 0,
    baseY: 0,
    groundOffset: 0,
    actionLock: 0,
  };

  if (ctx.enemyTemplate) {
    mesh.scale.setScalar(ctx.fbxModeLoaded ? 0.012 : 1);
    tintAllyMesh(mesh, role);
    ctx.playClip(mesh, ["idle_gun_pointing", "idle_gun", "idle"]);
    groundAlign(mesh);
  } else {
    mesh.scale.setScalar(1.42);
  }

  const label = makeNameTag(role === "commander" ? "CMDR" : "PILOT", role === "commander" ? "#c8d8a0" : "#9ec8e8");
  mesh.add(label);

  ctx.scene.add(mesh);
  ctx.allies.push(mesh);
  return { mesh, label };
}

/** Spawn commander (always) and pilot (hidden until extract bird is active). */
export function ensureAlliedNpcs(state: AlliedNpcState, ctx: AlliedNpcContext) {
  if (state.spawned || ctx.gameMode !== "solo") return;

  const commander = buildAllyMesh(ctx, "commander", "Bravo Actual");
  commander.mesh.position.set(COMMANDER_SPAWN.x, commander.mesh.userData.groundOffset ?? 0, COMMANDER_SPAWN.z);
  commander.mesh.rotation.y = COMMANDER_SPAWN.rotY;

  const pilot = buildAllyMesh(ctx, "pilot", "Dustoff Pilot");
  pilot.mesh.visible = false;
  pilot.mesh.position.set(
    EXTRACT_LZ.x + PILOT_LZ_OFFSET.x,
    pilot.mesh.userData.groundOffset ?? 0,
    EXTRACT_LZ.z + PILOT_LZ_OFFSET.z,
  );
  pilot.mesh.rotation.y = Math.PI * 0.65;

  state.npcs = [
    {
      role: "commander",
      mesh: commander.mesh,
      label: commander.label,
      baseX: COMMANDER_SPAWN.x,
      baseZ: COMMANDER_SPAWN.z,
      baseRotY: COMMANDER_SPAWN.rotY,
      interactRadius: COMMANDER_SPAWN.interactRadius,
      visible: true,
      lastTalkAt: 0,
      manualTalks: 0,
    },
    {
      role: "pilot",
      mesh: pilot.mesh,
      label: pilot.label,
      baseX: EXTRACT_LZ.x + PILOT_LZ_OFFSET.x,
      baseZ: EXTRACT_LZ.z + PILOT_LZ_OFFSET.z,
      baseRotY: Math.PI * 0.65,
      interactRadius: PILOT_LZ_OFFSET.interactRadius,
      visible: false,
      lastTalkAt: 0,
      manualTalks: 0,
    },
  ];
  state.spawned = true;
}

export function resetAlliedNpcSession(state: AlliedNpcState) {
  state.commanderWelcomed = false;
  state.pilotBoardCue = false;
  state.pilotAcked = false;
  state.lastPilotPhase = "hidden";
  state.radioLine = "";
  state.radioLineUntil = 0;
  for (const npc of state.npcs) {
    npc.lastTalkAt = 0;
    npc.manualTalks = 0;
    if (npc.role === "commander") {
      npc.visible = true;
      npc.mesh.visible = true;
      npc.mesh.position.set(npc.baseX, npc.mesh.userData.groundOffset ?? 0, npc.baseZ);
      npc.mesh.rotation.y = npc.baseRotY;
    } else {
      npc.visible = false;
      npc.mesh.visible = false;
    }
  }
}

function getNpc(state: AlliedNpcState, role: AlliedRole): AlliedNpc | undefined {
  return state.npcs.find((npc) => npc.role === role);
}

function distToNpc(npc: AlliedNpc, px: number, pz: number) {
  return Math.hypot(px - npc.mesh.position.x, pz - npc.mesh.position.z);
}

function npcInRange(npc: AlliedNpc, px: number, pz: number) {
  return npc.visible && distToNpc(npc, px, pz) <= npc.interactRadius;
}

function facePlayer(npc: AlliedNpc, px: number, pz: number) {
  const dx = px - npc.mesh.position.x;
  const dz = pz - npc.mesh.position.z;
  if (dx * dx + dz * dz < 0.04) return;
  npc.mesh.rotation.y = Math.atan2(dx, dz);
}

function emitTalk(state: AlliedNpcState, ctx: AlliedNpcContext, npc: AlliedNpc, line: string) {
  npc.lastTalkAt = ctx.nowMs;
  state.radioLine = line;
  state.radioLineUntil = ctx.nowMs + 5200;
  ctx.playRadio(line, { channel: "mission" });
}

function talkCommander(state: AlliedNpcState, ctx: AlliedNpcContext, manual: boolean) {
  const npc = getNpc(state, "commander");
  if (!npc) return;
  let line: string;
  if (manual && npc.manualTalks === 0 && !state.commanderWelcomed) {
    line = commanderBriefLine();
    state.commanderWelcomed = true;
  } else if (ctx.extractMissionActive || ctx.extractPhase >= 1) {
    line = commanderExtractLine();
  } else if (manual || !state.commanderWelcomed) {
    line = state.commanderWelcomed ? commanderBanterLine() : commanderBriefLine();
    state.commanderWelcomed = true;
  } else {
    line = commanderBanterLine();
  }
  if (manual) npc.manualTalks += 1;
  emitTalk(state, ctx, npc, line);
}

function talkPilot(state: AlliedNpcState, ctx: AlliedNpcContext, kind: "inbound" | "board" | "ack" | "manual") {
  const npc = getNpc(state, "pilot");
  if (!npc || !npc.visible) return;
  let line: string;
  if (kind === "ack") line = pilotAckLine();
  else if (kind === "board") line = pilotBoardLine();
  else if (kind === "inbound") line = pilotInboundLine();
  else {
    const heliPhase = ctx.heli?.phase ?? "hidden";
    line = heliPhase === "board" || heliPhase === "land" ? pilotBoardLine() : pilotInboundLine();
  }
  if (kind === "manual") npc.manualTalks += 1;
  emitTalk(state, ctx, npc, line);
}

function syncPilotVisibility(state: AlliedNpcState, ctx: AlliedNpcContext) {
  const pilot = getNpc(state, "pilot");
  const heli = ctx.heli;
  if (!pilot || !heli) return;

  const show =
    heli.phase !== "hidden" &&
    (heli.phase === "inbound" || heli.phase === "hover" || heli.phase === "land" || heli.phase === "board");

  pilot.visible = show;
  pilot.mesh.visible = show;
  if (!show) return;

  const offsetX = PILOT_LZ_OFFSET.x;
  const offsetZ = PILOT_LZ_OFFSET.z;
  pilot.mesh.position.set(
    heli.lzX + offsetX,
    pilot.mesh.userData.groundOffset ?? 0,
    heli.lzZ + offsetZ,
  );
  pilot.baseX = pilot.mesh.position.x;
  pilot.baseZ = pilot.mesh.position.z;

  const toHeliX = heli.root.position.x - pilot.mesh.position.x;
  const toHeliZ = heli.root.position.z - pilot.mesh.position.z;
  if (toHeliX * toHeliX + toHeliZ * toHeliZ > 0.05) {
    pilot.mesh.rotation.y = Math.atan2(toHeliX, toHeliZ);
    pilot.baseRotY = pilot.mesh.rotation.y;
  }
}

function maybeAutoCommanderBrief(state: AlliedNpcState, ctx: AlliedNpcContext) {
  const npc = getNpc(state, "commander");
  if (!npc || !ctx.running || state.commanderWelcomed) return;
  if (!npcInRange(npc, ctx.playerX, ctx.playerZ)) return;
  if (!allowRadioCue("allied-commander-auto", AUTO_BRIEF_COOLDOWN_MS, ctx.nowMs)) return;
  talkCommander(state, ctx, false);
}

function maybePilotPhaseCues(state: AlliedNpcState, ctx: AlliedNpcContext) {
  const heli = ctx.heli;
  if (!heli || heli.phase === "hidden") {
    state.lastPilotPhase = heli?.phase ?? "hidden";
    return;
  }

  const phase = heli.phase;
  if (phase !== state.lastPilotPhase) {
    if (phase === "inbound" && allowRadioCue("allied-pilot-inbound", PILOT_TALK_COOLDOWN_MS, ctx.nowMs)) {
      talkPilot(state, ctx, "inbound");
    }
    if ((phase === "land" || phase === "board") && !state.pilotBoardCue) {
      state.pilotBoardCue = true;
      if (allowRadioCue("allied-pilot-board", PILOT_TALK_COOLDOWN_MS, ctx.nowMs)) {
        talkPilot(state, ctx, "board");
      }
    }
    state.lastPilotPhase = phase;
  }

  if (phase === "board" && ctx.extractPhase >= 2 && !state.pilotAcked) {
    const pilot = getNpc(state, "pilot");
    if (pilot && npcInRange(pilot, ctx.playerX, ctx.playerZ)) {
      state.pilotAcked = true;
      if (allowRadioCue("allied-pilot-ack", PILOT_TALK_COOLDOWN_MS, ctx.nowMs)) {
        talkPilot(state, ctx, "ack");
      }
    }
  }
}

/** Nearest allied NPC within talk range. */
export function nearestAlliedPrompt(
  state: AlliedNpcState,
  px: number,
  pz: number,
): { role: AlliedRole; prompt: string; dist: number } | null {
  let best: { role: AlliedRole; prompt: string; dist: number } | null = null;
  for (const npc of state.npcs) {
    if (!npc.visible) continue;
    const dist = distToNpc(npc, px, pz);
    if (dist > npc.interactRadius + 0.4) continue;
    const label = npc.role === "commander" ? "Commander" : "Pilot";
    const prompt = `[E] Talk to ${label}`;
    if (!best || dist < best.dist) best = { role: npc.role, prompt, dist };
  }
  return best;
}

/** Manual E interact — returns true if consumed. */
export function tryAlliedNpcTalk(state: AlliedNpcState, ctx: AlliedNpcContext): boolean {
  if (!ctx.interactPressed || ctx.gameMode !== "solo" || !state.spawned) return false;

  const near = nearestAlliedPrompt(state, ctx.playerX, ctx.playerZ);
  if (!near) return false;

  const npc = getNpc(state, near.role);
  if (!npc) return false;
  if (ctx.nowMs - npc.lastTalkAt < MANUAL_TALK_COOLDOWN_MS) return true;

  if (near.role === "commander") talkCommander(state, ctx, true);
  else talkPilot(state, ctx, "manual");
  return true;
}

/** Per-frame idle facing + pilot placement + optional auto lines. */
export function updateAlliedNpcs(state: AlliedNpcState, ctx: AlliedNpcContext) {
  if (!state.spawned || ctx.gameMode !== "solo") return;

  syncPilotVisibility(state, ctx);

  for (const npc of state.npcs) {
    if (!npc.visible) continue;
    facePlayer(npc, ctx.playerX, ctx.playerZ);
  }

  if (ctx.running) {
    maybeAutoCommanderBrief(state, ctx);
    maybePilotPhaseCues(state, ctx);
  }
}

export function alliedRadioSubtitle(state: AlliedNpcState, nowMs: number): string {
  if (nowMs < state.radioLineUntil && state.radioLine) return state.radioLine;
  return "";
}

export function disposeAlliedNpcs(state: AlliedNpcState, scene: THREE.Scene, mixers: THREE.AnimationMixer[]) {
  for (const npc of state.npcs) {
    if (npc.mesh.userData.mixer) {
      const mixer = npc.mesh.userData.mixer as THREE.AnimationMixer;
      const idx = mixers.indexOf(mixer);
      if (idx >= 0) mixers.splice(idx, 1);
    }
    scene.remove(npc.mesh);
  }
  state.npcs = [];
  state.spawned = false;
}
