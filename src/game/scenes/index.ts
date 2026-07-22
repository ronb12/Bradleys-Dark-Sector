/** Combat scene registry, URL parsing, and atmosphere presets. */

import * as THREE from "three";
import { setWeather, type AtmosphereState } from "../atmosphere";
import { createFallbackEnvTextures } from "../environment";
import { buildDesertCheckpointScene } from "./desertCheckpoint";
import { buildMountainOutpostScene } from "./mountainOutpost";
import { buildUrbanNightScene } from "./urbanNight";
import type { CombatSceneId, CombatSceneMeta, CombatSceneSession, SceneBuildOptions } from "./types";

export type { CombatSceneId, CombatSceneSession, SceneAtmospherePreset } from "./types";

export const COMBAT_SCENE_IDS: CombatSceneId[] = ["compound", "desert", "urban", "mountain"];

export const COMBAT_SCENES: Record<CombatSceneId, CombatSceneMeta> = {
  compound: {
    id: "compound",
    title: "FOB Compound",
    subtitle: "Operation Iron Veil · AO-17",
    briefing: "Hostile forces have seized the compound. Breach the perimeter, control the yard, and hold until extraction is authorized.",
    compoundFeatures: true,
    atmosphere: {
      weather: "clear_night",
      background: 0x121812,
      fogColor: 0x1a1f18,
      fogDensity: 0.0088,
      hemisphereSky: 0x9aa8b4,
      hemisphereGround: 0x2f281c,
      hemisphereIntensity: 1.15,
    },
    build: () => {
      throw new Error("Compound map is built at game init — use compoundColliders instead.");
    },
  },
  desert: {
    id: "desert",
    title: "Desert Checkpoint",
    subtitle: "Route Dustbowl · CP Falcon",
    briefing: "Convoy hit at the checkpoint. Clear the kill zone and secure the road before QRF arrives.",
    compoundFeatures: false,
    atmosphere: {
      weather: "dust_storm",
      background: 0xc8b890,
      fogColor: 0xa89878,
      fogDensity: 0.0065,
      hemisphereSky: 0xf0dcc0,
      hemisphereGround: 0x8a6840,
      hemisphereIntensity: 1.35,
    },
    build: buildDesertCheckpointScene,
  },
  urban: {
    id: "urban",
    title: "Urban Night",
    subtitle: "District Kharan · Block 7",
    briefing: "Night assault through narrow streets. Clear rooftops and alleys — expect close ambushes.",
    compoundFeatures: false,
    atmosphere: {
      weather: "clear_night",
      background: 0x121820,
      fogColor: 0x1a2230,
      fogDensity: 0.0085,
      hemisphereSky: 0x7088a8,
      hemisphereGround: 0x2a2820,
      hemisphereIntensity: 1.12,
    },
    build: buildUrbanNightScene,
  },
  mountain: {
    id: "mountain",
    title: "Mountain Outpost",
    subtitle: "Firebase Ridge · Grid 42",
    briefing: "Hostiles are probing the radar outpost. Hold the ridge and eliminate the assault element.",
    compoundFeatures: false,
    atmosphere: {
      weather: "fog_bank",
      background: 0x4a5058,
      fogColor: 0x5a6068,
      fogDensity: 0.0095,
      hemisphereSky: 0x8898a8,
      hemisphereGround: 0x3a3830,
      hemisphereIntensity: 0.95,
    },
    build: buildMountainOutpostScene,
  },
};

export function sceneMeta(id: CombatSceneId): CombatSceneMeta {
  return COMBAT_SCENES[id];
}

export function parseSceneFromUrl(search = typeof window !== "undefined" ? window.location.search : ""): CombatSceneId {
  const raw = new URLSearchParams(search).get("scene")?.toLowerCase().trim();
  if (raw === "desert" || raw === "checkpoint") return "desert";
  if (raw === "urban" || raw === "village" || raw === "street") return "urban";
  if (raw === "mountain" || raw === "outpost" || raw === "radar") return "mountain";
  if (raw === "compound" || raw === "fob") return "compound";
  return "compound";
}

export function buildCombatScene(id: CombatSceneId, opts?: Partial<SceneBuildOptions>): CombatSceneSession | null {
  if (id === "compound") return null;
  const meta = COMBAT_SCENES[id];
  return meta.build({
    mobile: opts?.mobile ?? false,
    textures: opts?.textures ?? createFallbackEnvTextures(),
  });
}

export function applyCombatSceneAtmosphere(
  scene: THREE.Scene,
  atmosphere: AtmosphereState,
  id: CombatSceneId,
  hemisphereLight?: THREE.HemisphereLight,
) {
  const preset = COMBAT_SCENES[id].atmosphere;
  scene.background = new THREE.Color(preset.background);
  const fog = scene.fog;
  if (fog && "density" in fog) {
    fog.color.setHex(preset.fogColor);
    fog.density = preset.fogDensity;
  }
  setWeather(atmosphere, scene, preset.weather);
  if (hemisphereLight) {
    if (preset.hemisphereSky) hemisphereLight.color.setHex(preset.hemisphereSky);
    if (preset.hemisphereGround) hemisphereLight.groundColor.setHex(preset.hemisphereGround);
    if (preset.hemisphereIntensity != null) hemisphereLight.intensity = preset.hemisphereIntensity;
  }
}

export function waveMissionLabel(id: CombatSceneId): string {
  switch (id) {
    case "desert":
      return "Checkpoint Clearance";
    case "urban":
      return "Street Sweep";
    case "mountain":
      return "Ridge Defense";
    default:
      return "Compound Sweep";
  }
}
