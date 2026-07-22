/** Mission structure beyond pure waves — secure, defend, rescue, sabotage, extract. */

import { waveMissionLabel, type CombatSceneId } from "./maps";
import { EXTRACT_HOLD_SEC, EXTRACT_LZ } from "./helicopter";

export type MissionType =
  | "secure_intel"
  | "breach_secure"
  | "recover_extract"
  | "defend"
  | "rescue"
  | "sabotage"
  | "extraction"
  | "waves";

export type MissionObjective = {
  id: string;
  label: string;
  done: boolean;
  optional?: boolean;
};

export type ActiveMission = {
  type: MissionType;
  title: string;
  briefing: string;
  objectives: MissionObjective[];
  /** World markers the game loop can query. */
  markers: Array<{ id: string; x: number; z: number; radius: number; kind: string }>;
  phase: number;
  timerSec: number;
  targetTimerSec: number | null;
  progress: number;
  complete: boolean;
  failed: boolean;
  scoreBonus: number;
  /** When true, completing this mission ends the solo run successfully. */
  endsRun: boolean;
};

export type MissionHooks = {
  playerX: number;
  playerZ: number;
  enemiesAlive: number;
  killsThisFrame: number;
  dt: number;
  interactPressed: boolean;
  roomId?: "loading" | "intel" | null;
};

const MISSION_POOL: Array<Omit<ActiveMission, "phase" | "timerSec" | "progress" | "complete" | "failed" | "scoreBonus" | "endsRun" | "objectives"> & {
  buildObjectives: () => MissionObjective[];
  endsRun?: boolean;
}> = [
  {
    type: "breach_secure",
    title: "Breach Warehouse Alpha",
    briefing: "Enter Warehouse Alpha, breach the intel room, and clear its defenders.",
    markers: [
      { id: "warehouse_entry", x: 48, z: -20, radius: 3, kind: "zone" },
      { id: "intel_room", x: 48, z: -7, radius: 3.2, kind: "interact" },
    ],
    targetTimerSec: null,
    buildObjectives: () => [
      { id: "enter", label: "Enter Warehouse Alpha", done: false },
      { id: "breach", label: "Breach the intel room", done: false },
      { id: "clear", label: "Clear remaining hostiles", done: false },
    ],
  },
  {
    type: "recover_extract",
    title: "Recover Black Box",
    briefing: "Recover the black box from the intel room and extract through the north gate.",
    markers: [
      { id: "black_box", x: 48, z: -7, radius: 2.7, kind: "interact" },
      { id: "gate", x: 0, z: 52, radius: 4.5, kind: "extract" },
    ],
    targetTimerSec: null,
    buildObjectives: () => [
      { id: "recover", label: "Recover the black box indoors", done: false },
      { id: "extract", label: "Extract through the north gate", done: false },
    ],
  },
  {
    type: "secure_intel",
    title: "Secure Intel Cache",
    briefing: "Locate the uplink crate in the east warehouse and hold the upload.",
    markers: [
      { id: "intel", x: 42, z: -10, radius: 3.2, kind: "interact" },
      { id: "upload", x: 0, z: 10, radius: 4, kind: "hold" },
    ],
    targetTimerSec: null,
    buildObjectives: () => [
      { id: "reach", label: "Reach the intel cache", done: false },
      { id: "upload", label: "Upload intel at the yard uplink", done: false },
      { id: "survive", label: "Survive the counter-push", done: false },
    ],
  },
  {
    type: "defend",
    title: "Defend the Helipad",
    briefing: "Hostile QRF inbound. Hold the helipad for 90 seconds.",
    markers: [{ id: "helipad", x: EXTRACT_LZ.x, z: EXTRACT_LZ.z, radius: EXTRACT_LZ.radius, kind: "zone" }],
    targetTimerSec: 90,
    buildObjectives: () => [
      { id: "enter", label: "Enter the helipad zone", done: false },
      { id: "hold", label: "Hold the zone for 90s", done: false },
    ],
  },
  {
    type: "rescue",
    title: "Rescue the Asset",
    briefing: "Extract the marked operative from the south hangar to the north gate.",
    markers: [
      { id: "asset", x: 0, z: -42, radius: 2.5, kind: "escort" },
      { id: "gate", x: 0, z: 52, radius: 4.5, kind: "extract" },
    ],
    targetTimerSec: null,
    buildObjectives: () => [
      { id: "link", label: "Link with the asset", done: false },
      { id: "escort", label: "Escort asset to the north gate", done: false },
    ],
  },
  {
    type: "sabotage",
    title: "Sabotage Fuel Depot",
    briefing: "Plant charges on both fuel tanks, then clear the blast radius.",
    markers: [
      { id: "tank_a", x: -18, z: -18, radius: 2.8, kind: "plant" },
      { id: "tank_b", x: 18, z: -18, radius: 2.8, kind: "plant" },
      { id: "safe", x: 0, z: 18, radius: 6, kind: "safe" },
    ],
    targetTimerSec: null,
    buildObjectives: () => [
      { id: "plant_a", label: "Plant charge on west tank", done: false },
      { id: "plant_b", label: "Plant charge on east tank", done: false },
      { id: "clear", label: "Clear the blast radius", done: false },
    ],
  },
  {
    type: "extraction",
    title: "Helicopter Extraction",
    briefing: "Reach the LZ, hold for the bird, then board — extract ends the mission.",
    markers: [{ id: "lz", x: EXTRACT_LZ.x, z: EXTRACT_LZ.z, radius: EXTRACT_LZ.radius, kind: "extract" }],
    /** Hold duration (seconds) once the player is on the LZ. */
    targetTimerSec: EXTRACT_HOLD_SEC,
    endsRun: true,
    buildObjectives: () => [
      { id: "reach", label: "Reach the extraction LZ", done: false },
      { id: "hold", label: "Hold the LZ for the bird", done: false },
      { id: "board", label: "Board the helicopter", done: false },
    ],
  },
];

export function createWaveMission(wave: number, sceneId: CombatSceneId = "compound"): ActiveMission {
  return {
    type: "waves",
    title: `Wave ${wave} — ${waveMissionLabel(sceneId)}`,
    briefing: "Eliminate all hostiles in the AO.",
    objectives: [{ id: "clear", label: "Clear remaining hostiles", done: false }],
    markers: [],
    phase: 0,
    timerSec: 0,
    targetTimerSec: null,
    progress: 0,
    complete: false,
    failed: false,
    scoreBonus: 0,
    endsRun: false,
  };
}

/** QA helper: force the helicopter extraction mission regardless of wave rotation. */
export function createExtractionMission(): ActiveMission {
  const template = MISSION_POOL.find((m) => m.type === "extraction")!;
  return {
    type: template.type,
    title: template.title,
    briefing: template.briefing,
    objectives: template.buildObjectives(),
    markers: template.markers.map((m) => ({ ...m })),
    phase: 0,
    timerSec: 0,
    targetTimerSec: template.targetTimerSec,
    progress: 0,
    complete: false,
    failed: false,
    scoreBonus: 0,
    endsRun: true,
  };
}

export function pickMissionForWave(wave: number, sceneId: CombatSceneId = "compound"): ActiveMission {
  if (sceneId !== "compound") return createWaveMission(wave, sceneId);
  if (wave <= 1) return createWaveMission(wave, sceneId);
  // Every other wave is a structured mission; odd waves stay classic clear.
  if (wave % 2 === 1) return createWaveMission(wave, sceneId);
  const template = MISSION_POOL[(Math.floor(wave / 2) - 1) % MISSION_POOL.length];
  return {
    type: template.type,
    title: template.title,
    briefing: template.briefing,
    objectives: template.buildObjectives(),
    markers: template.markers.map((m) => ({ ...m })),
    phase: 0,
    timerSec: 0,
    targetTimerSec: template.targetTimerSec,
    progress: 0,
    complete: false,
    failed: false,
    scoreBonus: 0,
    endsRun: Boolean(template.endsRun),
  };
}

function inRadius(px: number, pz: number, mx: number, mz: number, r: number) {
  return Math.hypot(px - mx, pz - mz) <= r;
}

export function updateMission(mission: ActiveMission, hooks: MissionHooks): ActiveMission {
  if (mission.complete || mission.failed) return mission;
  const m = { ...mission, objectives: mission.objectives.map((o) => ({ ...o })) };
  m.timerSec += hooks.dt;

  if (m.type === "waves") {
    if (hooks.enemiesAlive === 0) {
      m.objectives[0].done = true;
      m.complete = true;
      m.scoreBonus = 100;
    }
    return m;
  }

  if (m.type === "secure_intel") {
    const intel = m.markers.find((x) => x.id === "intel")!;
    const upload = m.markers.find((x) => x.id === "upload")!;
    if (!m.objectives[0].done && inRadius(hooks.playerX, hooks.playerZ, intel.x, intel.z, intel.radius) && hooks.interactPressed) {
      m.objectives[0].done = true;
      m.phase = 1;
      m.progress = 0;
    }
    if (m.objectives[0].done && !m.objectives[1].done) {
      if (inRadius(hooks.playerX, hooks.playerZ, upload.x, upload.z, upload.radius)) {
        m.progress = Math.min(1, m.progress + hooks.dt / 8);
        if (m.progress >= 1) {
          m.objectives[1].done = true;
          m.phase = 2;
        }
      }
    }
    if (m.objectives[1].done && !m.objectives[2].done) {
      if (hooks.enemiesAlive === 0 || m.timerSec > 45) {
        m.objectives[2].done = true;
        m.complete = true;
        m.scoreBonus = 350;
      }
    }
  }

  if (m.type === "breach_secure") {
    if (!m.objectives[0].done && hooks.roomId === "loading") {
      m.objectives[0].done = true;
      m.phase = 1;
    }
    if (m.objectives[0].done && !m.objectives[1].done && hooks.roomId === "intel" && hooks.interactPressed) {
      m.objectives[1].done = true;
      m.phase = 2;
    }
    if (m.objectives[1].done && hooks.enemiesAlive === 0) {
      m.objectives[2].done = true;
      m.complete = true;
      m.scoreBonus = 600;
    }
  }

  if (m.type === "recover_extract") {
    if (!m.objectives[0].done && hooks.roomId === "intel" && hooks.interactPressed) {
      m.objectives[0].done = true;
      m.phase = 1;
    }
    const gate = m.markers.find((x) => x.id === "gate")!;
    if (m.objectives[0].done && inRadius(hooks.playerX, hooks.playerZ, gate.x, gate.z, gate.radius)) {
      m.objectives[1].done = true;
      m.complete = true;
      m.scoreBonus = 650;
    }
  }

  if (m.type === "defend") {
    const zone = m.markers[0];
    const inside = inRadius(hooks.playerX, hooks.playerZ, zone.x, zone.z, zone.radius);
    if (inside) m.objectives[0].done = true;
    if (m.objectives[0].done) {
      if (inside) m.progress = Math.min(1, m.progress + hooks.dt / (m.targetTimerSec || 90));
      else m.progress = Math.max(0, m.progress - hooks.dt / 40);
      if (m.progress >= 1) {
        m.objectives[1].done = true;
        m.complete = true;
        m.scoreBonus = 400;
      }
    }
  }

  if (m.type === "rescue") {
    const asset = m.markers.find((x) => x.id === "asset")!;
    const gate = m.markers.find((x) => x.id === "gate")!;
    if (!m.objectives[0].done && inRadius(hooks.playerX, hooks.playerZ, asset.x, asset.z, asset.radius)) {
      m.objectives[0].done = true;
      m.phase = 1;
    }
    if (m.objectives[0].done) {
      // Asset follows player loosely via marker tracking (game applies visually).
      asset.x += (hooks.playerX - asset.x) * Math.min(1, hooks.dt * 1.4);
      asset.z += (hooks.playerZ - asset.z) * Math.min(1, hooks.dt * 1.4);
      if (inRadius(asset.x, asset.z, gate.x, gate.z, gate.radius)) {
        m.objectives[1].done = true;
        m.complete = true;
        m.scoreBonus = 450;
      }
    }
  }

  if (m.type === "sabotage") {
    const a = m.markers.find((x) => x.id === "tank_a")!;
    const b = m.markers.find((x) => x.id === "tank_b")!;
    const safe = m.markers.find((x) => x.id === "safe")!;
    if (!m.objectives[0].done && inRadius(hooks.playerX, hooks.playerZ, a.x, a.z, a.radius) && hooks.interactPressed) {
      m.objectives[0].done = true;
    }
    if (!m.objectives[1].done && inRadius(hooks.playerX, hooks.playerZ, b.x, b.z, b.radius) && hooks.interactPressed) {
      m.objectives[1].done = true;
    }
    if (m.objectives[0].done && m.objectives[1].done && !m.objectives[2].done) {
      m.phase = 2;
      if (inRadius(hooks.playerX, hooks.playerZ, safe.x, safe.z, safe.radius)) {
        m.objectives[2].done = true;
        m.complete = true;
        m.scoreBonus = 500;
      }
    }
  }

  if (m.type === "extraction") {
    const lz = m.markers[0];
    const inside = inRadius(hooks.playerX, hooks.playerZ, lz.x, lz.z, lz.radius);
    const holdSec = m.targetTimerSec || EXTRACT_HOLD_SEC;

    // Phase 0 — get on the pad.
    if (!m.objectives[0].done) {
      m.phase = 0;
      m.progress = 0;
      if (inside) {
        m.objectives[0].done = true;
        m.phase = 1;
      }
    } else if (!m.objectives[1].done) {
      // Phase 1 — hold LZ; leaving pauses progress (does not reset).
      m.phase = 1;
      if (inside) {
        m.progress = Math.min(1, m.progress + hooks.dt / holdSec);
      }
      if (m.progress >= 1) {
        m.objectives[1].done = true;
        m.phase = 2;
        m.progress = 1;
        // Already on the pad when the bird goes on station — board immediately.
        if (inside) {
          m.objectives[2].done = true;
          m.complete = true;
          m.endsRun = true;
          m.scoreBonus = 800;
        }
      }
    } else if (!m.objectives[2].done) {
      // Phase 2 — bird on station; stay/enter LZ to board and end the run.
      m.phase = 2;
      m.progress = 1;
      if (inside) {
        m.objectives[2].done = true;
        m.complete = true;
        m.endsRun = true;
        m.scoreBonus = 800;
      }
    }
  }

  return m;
}

export function missionHudText(mission: ActiveMission): { objective: string; intel: string } {
  const pending = mission.objectives.find((o) => !o.done);
  const doneCount = mission.objectives.filter((o) => o.done).length;

  if (mission.type === "extraction" && !mission.complete) {
    const lz = mission.markers[0];
    const holdPct = Math.round(mission.progress * 100);
    if (!mission.objectives[0]?.done) {
      return {
        objective: "Reach the extraction LZ",
        intel: "Extract bird inbound. Move to the amber helipad LZ and prepare to hold.",
      };
    }
    if (!mission.objectives[1]?.done) {
      // Approximate inside check is not available here — guide by phase/progress wording.
      return {
        objective: `Hold the LZ for extract (${holdPct}%)`,
        intel: `Stay inside the amber ring — leaving pauses the hold. Defend until the bird is on station. · ${doneCount}/${mission.objectives.length}`,
      };
    }
    return {
      objective: "Board the helicopter",
      intel: `Bird is on station at the LZ (${lz.x.toFixed(0)}, ${lz.z.toFixed(0)}). Enter the ring to extract and end the run.`,
    };
  }

  return {
    objective: mission.complete
      ? mission.endsRun
        ? `EXTRACT SUCCESS — ${mission.title}`
        : `MISSION COMPLETE — ${mission.title}`
      : pending?.label || mission.title,
    intel: mission.complete
      ? mission.endsRun
        ? `Extract secured. Bonus +${mission.scoreBonus}. Bird is outbound.`
        : `Objective secured. Bonus +${mission.scoreBonus}. Hold for the next wave.`
      : `${mission.briefing} · ${doneCount}/${mission.objectives.length} objectives`,
  };
}

/** Nearest interact/plant marker within range, if any. */
export function nearestInteractMarker(
  mission: ActiveMission | null,
  playerX: number,
  playerZ: number
): { id: string; kind: string; dist: number; prompt: string } | null {
  if (!mission || mission.complete) return null;
  let best: { id: string; kind: string; dist: number; prompt: string } | null = null;
  for (const marker of mission.markers) {
    if (marker.kind !== "interact" && marker.kind !== "plant") continue;
    // Skip already-completed plant/interact steps when possible
    if ((marker.id === "intel" || marker.id === "black_box") && mission.objectives[0]?.done) continue;
    if (marker.id === "intel_room" && mission.objectives[1]?.done) continue;
    if (marker.id === "tank_a" && mission.objectives[0]?.done) continue;
    if (marker.id === "tank_b" && mission.objectives[1]?.done) continue;
    const dist = Math.hypot(playerX - marker.x, playerZ - marker.z);
    if (dist > marker.radius + 0.6) continue;
    const prompt =
      marker.kind === "plant"
        ? `[E] Plant charge — ${marker.id === "tank_a" ? "west tank" : "east tank"}`
        : marker.id === "black_box"
          ? `[E] Recover black box`
          : marker.id === "intel_room"
            ? `[E] Breach intel room`
            : `[E] Secure intel cache`;
    if (!best || dist < best.dist) best = { id: marker.id, kind: marker.kind, dist, prompt };
  }
  return best;
}
