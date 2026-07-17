import type * as THREE from "three";

export type XRHudSnapshot = {
  health: number;
  ammo: number | string;
  weapon: string;
  score: number;
  wave: number;
  objective: string;
  contact: string;
  mode: string;
  missionTitle: string;
  rangeHits: number;
  rangeAccuracy: number;
  rangeChallengeActive: boolean;
  rangeChallengeTime: number;
  subtitle: string;
};

export type XRMenuAction =
  | "solo"
  | "range"
  | "resume"
  | "settings"
  | "exitVr"
  | "close";

export type XRFrameInput = {
  moveX: number;
  moveY: number;
  snapTurn: -1 | 0 | 1;
  fire: boolean;
  ads: boolean;
  reload: boolean;
  interact: boolean;
  swap: boolean;
  throwGrenade: boolean;
  medkit: boolean;
  crouch: boolean;
  menu: boolean;
  sprint: boolean;
};

export type ShotPose = {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

export type XRComfortSettings = {
  snapTurnDegrees: number;
  moveSpeed: number;
  comfortVignette: boolean;
  xrGraphics: "xr" | "inherit";
};
