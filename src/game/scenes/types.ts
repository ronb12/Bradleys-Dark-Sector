/** Combat map definitions — compound + alternate AO layouts. */

import type * as THREE from "three";
import type { WeatherMode } from "../atmosphere";
import type { EnvTextures } from "../environment";

export type CombatSceneId = "compound" | "desert" | "urban" | "mountain";

export type SceneAtmospherePreset = {
  weather: WeatherMode;
  background: number;
  fogColor: number;
  fogDensity: number;
  hemisphereSky?: number;
  hemisphereGround?: number;
  hemisphereIntensity?: number;
};

export type SceneBuildOptions = {
  mobile: boolean;
  textures: EnvTextures;
};

export type CombatSceneSession = {
  id: CombatSceneId;
  root: THREE.Group;
  colliders: THREE.Box3[];
  spawnHalf: number;
  groundSize: number;
  playerStart: { x: number; z: number; yaw?: number };
  dispose: () => void;
};

export type CombatSceneMeta = {
  id: CombatSceneId;
  title: string;
  subtitle: string;
  briefing: string;
  /** Compound-only: helicopter extract, warehouse interiors, structured missions. */
  compoundFeatures: boolean;
  atmosphere: SceneAtmospherePreset;
  build: (opts: SceneBuildOptions) => CombatSceneSession;
};
