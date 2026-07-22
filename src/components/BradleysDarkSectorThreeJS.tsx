import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { PvpClient } from "../multiplayer/PvpClient";
import { DEFAULT_PVP_ROOM } from "../multiplayer/protocol";
import {
  applyHitReact,
  applyProceduralDeath,
  createViewmodelPose,
  mergeAnimationLibrary,
  playOrSwitch,
  tickHitReact,
  updateViewmodel,
  type ViewmodelPose,
} from "../game/animations";
import {
  addDamageShake,
  addRecoilShake,
  addSuppression,
  applyCameraShake,
  applyEnemyBloodFlash,
  createCombatFx,
  orientTracer,
  releaseTracer,
  spawnBulletImpact,
  spawnAmbientImpactSpark,
  spawnFleshDeathGore,
  spawnGroundBloodPool,
  spawnMuzzleBlast,
  spawnShellCasing,
  spawnTracer,
  suppressionHudOpacity,
  updateCombatFx,
  type CombatFxState,
} from "../game/combatFx";
import {
  assignSquads,
  buildCoverPointsFromColliders,
  computeEnemySteer,
  enemyShouldHoldFire,
  signalGrenadeThreat,
  suppressEnemiesNearShot,
  updateEnemyKneelStance,
  updateSquadCoordination,
  type CoverPoint,
  type Squad,
} from "../game/ai";
import { raycastColliders } from "../game/collisionWorld";
import { DestructionSystem } from "../game/destruction";
import { createGrenade, stepGrenade, sweepBullet, type GrenadeProjectile } from "../game/projectiles";
import { DynamicQualityGovernor } from "../game/quality";
import { WEAPONS, nextWeapon, weaponRecoilKick, damageAtRange, computeSpreadVisual, type WeaponId } from "../game/weapons";
import { createWarehouseInterior, warehouseRoomAt } from "../game/warehouse";
import { createImmersiveAudio, surfaceAtPosition, type ImmersiveAudio } from "../game/audio";
import {
  loadEnvironmentTextures,
  applyTexturedGround,
  addCombatCoverToCompound,
  addMilitaryFobDressing,
  createFallbackEnvTextures,
  makeHelipadMarking,
  makeSandbagWall,
  makeConcertinaWire,
} from "../game/environment";
import {
  applyPickupEffect,
  createPickupSession,
  respawnPickupsAfterWave,
  resetPickupSession,
  updatePickups,
  type PickupSession,
} from "../game/pickups";
import { populateCompoundWithEnvironmentAssets } from "../game/envAssets";
import {
  COMPOUND_WALL,
  COMPOUND_SPAWN_HALF,
  COMPOUND_GROUND_SIZE,
} from "../game/compoundLayout";
import {
  COMBAT_SCENE_IDS,
  applyCombatSceneAtmosphere,
  buildCombatScene,
  parseSceneFromUrl,
  sceneMeta,
  type CombatSceneId,
  type CombatSceneSession,
} from "../game/maps";
import {
  allowRadioCue,
  assertRadioPoolsVaried,
  contactLine,
  enemyCalloutLine,
  extractBoardLine,
  extractHoldLine,
  extractInboundLine,
  extractSuccessLine,
  killConfirmLine,
  missionAmbientLine,
  missionBriefLine,
  missionStartLine,
  objectiveCompleteLine,
  poolRotatesWithoutImmediateRepeat,
  MISSION_AMBIENT_LINES,
  pvpMatchOverLine,
  pvpStartLine,
  rangeChallengeStartLine,
  rangeFailLine,
  rangeOnlineLine,
  rangePassLine,
  reloadRemindLine,
  qrfInboundLine,
  contactDirectionLine,
  vehicleBoomLine,
  battlefieldChaosLine,
  waveInboundLine,
} from "../game/radioLines";
import {
  createExtractionMission,
  missionHudText,
  nearestInteractMarker,
  pickMissionForWave,
  updateMission,
  type ActiveMission,
} from "../game/missions";
import {
  createAlliedNpcState,
  ensureAlliedNpcs,
  nearestAlliedPrompt,
  resetAlliedNpcSession,
  tryAlliedNpcTalk,
  updateAlliedNpcs,
  alliedRadioSubtitle,
  type AlliedNpcContext,
  type AlliedNpcState,
} from "../game/alliedNpcs";
import {
  createExtractionHelicopter,
  disposeExtractionHelicopter,
  EXTRACT_HOLD_SEC,
  EXTRACT_LZ,
  HELI_CABIN_CAMERA_OFFSET,
  heliAudioProximity,
  resetExtractionHelicopter,
  startHeliInbound,
  updateExtractionHelicopter,
  upgradeExtractionHelicopterToGlb,
  type ExtractionHelicopter,
} from "../game/helicopter";
import {
  initAtmosphere,
  initBattlefieldChaos,
  registerAtmosphereFx,
  setAtmosphereLowPower,
  setWeather,
  softPointsMaterial,
  spawnDestructionBurst,
  updateAtmosphereSystem,
  updateBattlefieldChaos,
  updateDestruction,
  type AtmosphereState,
  type BattlefieldChaosState,
} from "../game/atmosphere";
import {
  applyAttachmentMods,
  ATTACHMENTS,
  awardRangeBadgeXp,
  DIFFICULTY,
  loadProgression,
  rankFromXp,
  recordMissionEnd,
  saveProgression,
  type DifficultyId,
  type PersistentStats,
} from "../game/progression";
import { graphicsConfig, loadSettings, saveSettings, xrGraphicsConfig, type GameSettings } from "../game/settings";
import {
  applyMedkitHeal,
  canUseMedkit,
  maxHealthForDifficulty,
  MAX_GRENADES,
  PLAYER_DAMAGE_COOLDOWN,
  WAVE_CLEAR_ARMOR_BONUS,
} from "../game/survivability";
import { attachEnemyWeapon, getEnemyMuzzleWorldPos, pickEnemyWeapon, preloadEnemyWeapons, syncEnemyWeaponGrip } from "../game/enemyWeapons";
import {
  ADS_SENSITIVITY_MULTIPLIER,
  adsFov,
  createM4Scope,
  RIFLE_SCOPE_MAGNIFICATION,
} from "../game/scope";
import {
  badgeLabel,
  createShootingRange,
  loadBestChallengeScore,
  loadHighestBadge,
  loadUnlockedBadges,
  RANGE_BADGE_XP,
  RANGE_CHALLENGE_SECONDS,
  type RangeBadgeId,
  type RangeChallengeResult,
  type ShootingRangeSession,
} from "../game/shootingRange";
import { RangeBadgeRow, RangeChallengeResultCard } from "./RangeQualificationBadges";
import { GameplayHud } from "./hud/GameplayHud";
import {
  applyPlayerWeaponVisibility,
  attachWeaponsToGrip,
  createXRRuntime,
  detachWeaponsFromGrip,
  disposeXRRuntime,
  endXRSession,
  isXrPresenting,
  updateComfortVignette,
  type ShotPose,
  type XRMenuAction,
  type XRRuntime,
} from "../xr";

type GameMode = "solo" | "pvp" | "range";

type DamageBearing = "front" | "left" | "right" | "rear" | null;

type HitMarkerKind = "hit" | "armor" | "kill";

type Hud = {
  health: number;
  maxHealth: number;
  ammo: number | string;
  activeWeapon: WeaponId;
  m4Ammo: number;
  smgAmmo: number;
  pistolAmmo: number;
  grenades: number;
  score: number;
  enemies: number;
  wave: number;
  modelMode: string;
  objective: string;
  intel: string;
  streak: number;
  medkits: number;
  missionTime: string;
  gameMode: GameMode;
  kills: number;
  deaths: number;
  pvpPlayers: number;
  pvpStatus: string;
  contact: string;
  damageBearing: DamageBearing;
  missionTitle: string;
  missionProgress: number;
  suppression: number;
  spreadRing: number;
  rank: string;
  difficulty: DifficultyId;
  crouching: boolean;
  aiming: boolean;
  subtitle: string;
  interactPrompt: string;
  missionBanner: string;
  unlockNotice: string;
  supplyNotice: string;
  rangeHits: number;
  rangeMisses: number;
  rangeShots: number;
  rangeAccuracy: number;
  rangeDistance: number;
  rangeChallengeActive: boolean;
  rangeChallengeTime: number;
  rangeChallengeScore: number;
  rangeBestScore: number;
  rangeHighestBadge: RangeBadgeId;
  rangeUnlockedBadges: Exclude<RangeBadgeId, "unqualified">[];
};

type EnemyType = {
  name: string;
  color: number;
  hp: number;
  speed: number;
  score: number;
  range: number;
  damage: number;
  fireCooldown: number;
  preferredDistance: number;
  minimumDistance: number;
};

type GameState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Timer;
  player: THREE.Group;
  weapon: THREE.Group;
  weaponViews: Record<WeaponId, THREE.Group>;
  activeWeapon: WeaponId;
  weaponAmmo: Record<WeaponId, number>;
  triggerLatched: boolean;
  fireHeat: number;
  allies: THREE.Group[];
  enemies: THREE.Group[];
  bullets: THREE.Mesh[];
  grenades: GrenadeProjectile[];
  grenadesRemaining: number;
  colliders: THREE.Box3[];
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  score: number;
  wave: number;
  fireCooldown: number;
  reload: number;
  yaw: number;
  pitch: number;
  recoil: number;
  recoilYaw: number;
  running: boolean;
  disposed: boolean;
  enemyTemplate: THREE.Group | null;
  /** Resolves when Quaternius GLB load succeeds or fails — used to avoid procedural-only first wave. */
  enemyTemplatePromise: Promise<void> | null;
  enemyAnimations: THREE.AnimationClip[];
  fbxClips: Record<string, THREE.AnimationClip>;
  mixers: THREE.AnimationMixer[];
  enemyModelLoaded: boolean;
  /** Monotonic token so late GLB waits don't spawn into a restarted mission. */
  waveContentToken: number;
  fbxModeLoaded: boolean;
  killStreak: number;
  bestStreak: number;
  medkits: number;
  missionStartedAt: number;
  /** Frozen HUD timer shown after death / mission end; reset on restart. */
  lastMissionTime: string;
  playerDamageCooldown: number;
  enemyVolleyCooldown: number;
  /** Global lock after any hostile grenade throw. */
  enemyGrenadeLockUntil: number;
  /** Seconds the player has barely moved — used for tactical grenade checks. */
  playerStationarySec: number;
  lastPlayerX: number;
  lastPlayerZ: number;
  gameMode: GameMode;
  pvpKills: number;
  pvpDeaths: number;
  remotePlayers: Map<string, THREE.Group>;
  pvpSendAccum: number;
  pvpAlive: boolean;
  pvpRespawnBanner: string;
  audio: ImmersiveAudio;
  nextRadioAt: number;
  announcedWave: number;
  contactUntil: number;
  lastDamageBearing: DamageBearing;
  combatFx: CombatFxState;
  atmosphere: AtmosphereState;
  battlefieldChaos: BattlefieldChaosState;
  activeMission: ActiveMission | null;
  coverPoints: CoverPoint[];
  squads: Squad[];
  viewmodelPoses: Record<WeaponId, ViewmodelPose>;
  crouching: boolean;
  footstepAccum: number;
  nextDistantFireAt: number;
  nextCalloutAt: number;
  /** Mid-fight pressure spawns when the yard goes quiet. */
  nextPressureSpawnAt: number;
  difficulty: DifficultyId;
  sessionKills: number;
  interactPulse: boolean;
  settings: GameSettings;
  adsHeld: boolean;
  adsBlend: number;
  groundMesh: THREE.Mesh | null;
  missionMarkers: THREE.Group[];
  dyingEnemies: THREE.Group[];
  shootingRange: ShootingRangeSession | null;
  compoundColliders: THREE.Box3[];
  compoundMapRoot: THREE.Group;
  activeSceneId: CombatSceneId;
  altSceneSession: CombatSceneSession | null;
  spawnHalf: number;
  hemisphereLight: THREE.HemisphereLight;
  pickups: PickupSession | null;
  pickupPrompt: string | null;
  xr: XRRuntime | null;
  destruction: DestructionSystem;
  quality: DynamicQualityGovernor;
  extractionHeli: ExtractionHelicopter | null;
  /** Next elapsed-time when extract hold may spawn pressure. */
  extractReinforceAt: number;
  /** Last extraction mission phase that played a radio cue. */
  extractAnnouncedPhase: number;
  /** Solo run ended via successful helicopter board. */
  extractSucceeded: boolean;
  /** True while land→board→depart cinematic plays (AAR deferred). */
  extractCinematic: boolean;
  alliedNpcState: AlliedNpcState;
};

/** Max live hostiles — keeps Quest perf sane while the yard stays hot. */
const MAX_ALIVE_ENEMIES = () => (isTouchDevice() ? 16 : 22);
const PRESSURE_SPAWN_THRESHOLD = 5;

function waveEnemyTarget(wave: number, enemyCountMul: number) {
  return Math.min(MAX_ALIVE_ENEMIES(), Math.max(8, Math.round((9 + wave * 2.5) * enemyCountMul)));
}

function spawnDistanceBand(state: GameState) {
  if (state.activeSceneId === "compound") return { min: 11, max: 26 };
  const half = state.spawnHalf;
  return { min: Math.max(10, half * 0.22), max: Math.max(22, half * 0.58) };
}

/** Enemy fire pacing — slower bursts to avoid unfair stacked volleys. */
const ENEMY_FIRE_COOLDOWN_MUL = 1.18;
/** Solo-only extra reduction on hostile bullet/grenade HP damage (PvP untouched). */
const SOLO_ENEMY_DAMAGE_MUL = 0.78;

const ENEMY_TYPES: EnemyType[] = [
  // Speeds are m/s world velocity. Tuned vs player walk 5.2 / sprint 8.2 so
  // squads jog and assault at a readable tactical pace (not half-speed shuffle).
  { name: "Rifleman", color: 0x747a4e, hp: 75, speed: 4.15, score: 100, range: 16, damage: 2, fireCooldown: 1.55, preferredDistance: 10, minimumDistance: 5 },
  { name: "Scout", color: 0x526f50, hp: 55, speed: 5.55, score: 130, range: 6, damage: 2, fireCooldown: 0.95, preferredDistance: 4.5, minimumDistance: 3.25 },
  { name: "Heavy", color: 0x877044, hp: 135, speed: 3.25, score: 220, range: 13, damage: 2, fireCooldown: 1.85, preferredDistance: 8, minimumDistance: 5.5 },
  { name: "Sniper", color: 0x59694a, hp: 65, speed: 3.55, score: 180, range: 18, damage: 3, fireCooldown: 3.1, preferredDistance: 13, minimumDistance: 6 },
  { name: "Commander", color: 0x6f5e45, hp: 170, speed: 4.05, score: 350, range: 15, damage: 2, fireCooldown: 1.55, preferredDistance: 10, minimumDistance: 5.5 },
];

/** Max distance at which enemies may deal HP damage (fair visual engagement). */
const FAIR_DAMAGE_RANGE = 15;
/** How long an enemy stays "seen" after leaving the camera frustum. */
const ENEMY_SEEN_MEMORY_MS = 2200;
/** Global pacing — at most one hostile grenade volley per window. */
const ENEMY_GRENADE_GLOBAL_COOLDOWN = 55;
const ENEMY_GRENADE_MIN_RANGE = 10;
const ENEMY_GRENADE_MAX_RANGE = 13;
const ENEMY_GRENADE_THROW_CHANCE = 0.07;
const ENEMY_GRENADE_STATIONARY_SEC = 6;
const ENEMY_GRENADE_MIN_PLAYER_HP = 0.35;
const ENEMY_GRENADE_MAX_SUPPRESSION = 0.42;
/** Quaternius SWAT is authored at a correct 1.82 m runtime height. */
const GLB_SOLDIER_SCALE = 1;

const SOLDIER_MODEL_URL = "/models/quaternius-swat.glb";
const WEAPON_MODEL_URL = "/models/m4a1.fbx";
const WEAPON_TEXTURE_URL = "/models/m4a1-diffuse.png";
const PISTOL_MODEL_URL = "/models/pistol.glb";

/**
 * Mixamo/vanguard GLB visual forward is opposite Three.js Object3D.lookAt (+Z).
 * Apply after every lookAt so chest/face aim at the player. Muzzle/weapons are
 * authored on local -Z to match this visual front.
 */
const MIXAMO_LOOKAT_YAW_OFFSET = Math.PI;

const SHOOT_ANIMATION_LOCK_SECONDS = 0.32;

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches);

export default function BradleysDarkSectorThreeJS() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const xrPresentingRef = useRef(false);
  const xrMenuHandlerRef = useRef<(action: XRMenuAction) => void>(() => undefined);
  const keysRef = useRef<Record<string, boolean | undefined>>({});
  const mouseRef = useRef({ dragging: false, firing: false, lastX: 0, lastY: 0 });
  const mobileInputRef = useRef({
    moveX: 0,
    moveY: 0,
    crouching: false,
    lookPointerId: null as number | null,
    lookX: 0,
    lookY: 0,
    firePointerId: null as number | null,
    lastTouchAt: 0,
  });
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerRef = useRef<number | null>(null);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const hudTimerRef = useRef(0);
  const lastHudKeyRef = useRef("");
  const pvpClientRef = useRef<PvpClient | null>(null);
  const [started, setStarted] = useState(false);
  const [xrPresenting, setXrPresenting] = useState(false);
  const [touchDevice] = useState(() => isTouchDevice());
  const [gameOver, setGameOver] = useState(false);
  /** Distinguishes death AAR from successful helicopter extract. */
  const [missionOutcome, setMissionOutcome] = useState<"failed" | "extracted" | null>(null);
  const [hitMarker, setHitMarker] = useState<HitMarkerKind | null>(null);
  const hitMarkerTimerRef = useRef<number | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [pvpConnecting, setPvpConnecting] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [progression, setProgression] = useState<PersistentStats>(() => loadProgression());
  // Game-loop closures register once on mount; they must read progression via this
  // ref or they'd see the first render's snapshot forever (stale loadout/unlocks).
  const progressionRef = useRef(progression);
  progressionRef.current = progression;
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>(() => loadProgression().preferredDifficulty);
  const [selectedScene, setSelectedScene] = useState<CombatSceneId>(() => parseSceneFromUrl());
  const [pvpRoomInput, setPvpRoomInput] = useState(DEFAULT_PVP_ROOM);
  const [hud, setHud] = useState<Hud>({
    health: 100,
    maxHealth: 100,
    ammo: 30,
    activeWeapon: "m4",
    m4Ammo: WEAPONS.m4.maxAmmo,
    smgAmmo: WEAPONS.smg.maxAmmo,
    pistolAmmo: WEAPONS.pistol.maxAmmo,
    grenades: 3,
    score: 0,
    enemies: 0,
    wave: 1,
    modelMode: "procedural 3D fallback",
    objective: "Sweep the outer yard and survive first contact.",
    intel: "Recon is cold. Expect scattered militia resistance.",
    streak: 0,
    medkits: 1,
    missionTime: "00:00",
    gameMode: "solo",
    kills: 0,
    deaths: 0,
    pvpPlayers: 1,
    pvpStatus: "offline",
    contact: "",
    damageBearing: null,
    missionTitle: "Compound Sweep",
    missionProgress: 0,
    suppression: 0,
    spreadRing: 0,
    rank: rankFromXp(loadProgression().xp).rank,
    difficulty: loadProgression().preferredDifficulty,
    crouching: false,
    aiming: false,
    subtitle: "",
    interactPrompt: "",
    missionBanner: "",
    unlockNotice: "",
    supplyNotice: "",
    rangeHits: 0,
    rangeMisses: 0,
    rangeShots: 0,
    rangeAccuracy: 0,
    rangeDistance: 0,
    rangeChallengeActive: false,
    rangeChallengeTime: 0,
    rangeChallengeScore: 0,
    rangeBestScore: loadBestChallengeScore(),
    rangeHighestBadge: loadHighestBadge(),
    rangeUnlockedBadges: loadUnlockedBadges(),
  });
  const [unlockToast, setUnlockToast] = useState("");
  const [missionBanner, setMissionBanner] = useState("");
  const [rangeResult, setRangeResult] = useState<RangeChallengeResult | null>(null);
  const rangeChallengeWasActiveRef = useRef(false);
  const lastRangeResultAtRef = useRef(0);

  function updateJoystick(e: ReactPointerEvent<HTMLDivElement>) {
    const base = joystickRef.current;
    if (!base || (joystickPointerRef.current !== null && joystickPointerRef.current !== e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();
    joystickPointerRef.current = e.pointerId;
    base.setPointerCapture(e.pointerId);
    const rect = base.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.36;
    const rawX = e.clientX - (rect.left + rect.width / 2);
    const rawY = e.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const normalizedX = x / radius;
    const normalizedY = y / radius;
    const magnitude = Math.hypot(normalizedX, normalizedY);
    const deadzone = 0.14;
    const response = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);
    mobileInputRef.current.moveX = magnitude ? (normalizedX / magnitude) * response : 0;
    mobileInputRef.current.moveY = magnitude ? (normalizedY / magnitude) * response : 0;
    setJoystickKnob({ x, y });
  }

  function releaseJoystick(e?: ReactPointerEvent<HTMLDivElement>) {
    if (e && joystickPointerRef.current !== e.pointerId) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    joystickPointerRef.current = null;
    mobileInputRef.current.moveX = 0;
    mobileInputRef.current.moveY = 0;
    setJoystickKnob({ x: 0, y: 0 });
  }

  function formatMissionTime(seconds: number) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return mm + ":" + ss;
  }

  function getWaveDirective(wave: number) {
    if (wave >= 7) {
      return {
        objective: "Hold the extraction corridor. No collapse allowed.",
        intel: "Enemy command is committing everything left. Watch your medkit timing.",
      };
    }
    if (wave >= 5) {
      return {
        objective: "Crack the inner compound and break heavy resistance.",
        intel: "Scouts and heavies are converging together. Keep distance and reload early.",
      };
    }
    if (wave >= 3) {
      return {
        objective: "Suppress the counter-push and keep the yard secure.",
        intel: "Hostiles are moving faster now. Punish flankers before they stack melee hits.",
      };
    }
    return {
      objective: "Sweep the outer yard and survive first contact.",
      intel: "Recon is cold. Expect scattered militia resistance.",
    };
  }

  function makeMaterial(color: number, roughness = 0.8, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function enableShadows(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  function makeRealisticProceduralSoldier(name: string, color: number, enemy = false) {
    const group = new THREE.Group();
    group.name = name;

    const uniform = makeMaterial(color, 0.88, 0.05);
    const vest = makeMaterial(enemy ? 0x2b1717 : 0x202820, 0.9, 0.05);
    const black = makeMaterial(0x080808, 0.55, 0.65);
    const skin = makeMaterial(enemy ? 0xa36a4c : 0x8f5c3f, 0.78, 0.02);
    const darkSkin = makeMaterial(enemy ? 0x8d553b : 0x76452f, 0.8, 0.01);
    const faceDark = new THREE.MeshBasicMaterial({ color: 0x080808 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a1a14 });

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.36), uniform);
    hips.position.y = 0.95;
    group.add(hips);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 8, 16), uniform);
    torso.position.y = 1.55;
    torso.scale.set(1.05, 1, 0.55);
    group.add(torso);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.14), vest);
    plate.position.set(0, 1.55, -0.28);
    group.add(plate);

    const pouchMat = makeMaterial(0x11140f, 0.8, 0.15);
    for (let i = 0; i < 4; i += 1) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.08), pouchMat);
      pouch.position.set(-0.24 + i * 0.16, 1.43, -0.38);
      group.add(pouch);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 28, 20), skin);
    head.position.y = 2.23;
    head.scale.set(0.95, 1.15, 0.92);
    group.add(head);

    const faceZ = -0.28;

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 12), skin);
    nose.position.set(0, 2.18, faceZ - 0.04);
    nose.rotation.x = Math.PI / 2;
    group.add(nose);

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), faceDark);
    leftEye.position.set(-0.095, 2.265, faceZ - 0.025);
    leftEye.scale.set(1, 0.62, 0.45);
    group.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.095;
    group.add(rightEye);

    const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.018), faceDark);
    leftBrow.position.set(-0.095, 2.315, faceZ - 0.035);
    leftBrow.rotation.z = -0.18;
    group.add(leftBrow);

    const rightBrow = leftBrow.clone();
    rightBrow.position.x = 0.095;
    rightBrow.rotation.z = 0.18;
    group.add(rightBrow);

    const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), darkSkin);
    leftCheek.position.set(-0.105, 2.145, faceZ - 0.01);
    leftCheek.scale.set(1.05, 0.62, 0.35);
    group.add(leftCheek);

    const rightCheek = leftCheek.clone();
    rightCheek.position.x = 0.105;
    group.add(rightCheek);

    const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skin);
    leftEar.position.set(-0.245, 2.22, 0.01);
    leftEar.scale.set(0.55, 0.95, 0.35);
    group.add(leftEar);

    const rightEar = leftEar.clone();
    rightEar.position.x = 0.245;
    group.add(rightEar);

    const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.026, 0.02), mouthMat);
    mouthLine.position.set(0, 2.075, faceZ - 0.035);
    group.add(mouthLine);

    const chinStrap = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.035, 0.035), black);
    chinStrap.position.set(0, 2.03, -0.225);
    group.add(chinStrap);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), uniform);
    helmet.position.y = 2.34;
    helmet.scale.set(1.08, 0.72, 1.02);
    group.add(helmet);

    const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.16), uniform);
    helmetBrim.position.set(0, 2.28, -0.2);
    group.add(helmetBrim);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.22), black);
    backpack.position.set(0, 1.52, 0.33);
    group.add(backpack);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 8), black);
    antenna.position.set(-0.33, 2.08, 0.35);
    antenna.rotation.z = -0.22;
    group.add(antenna);

    const makeLimb = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) => {
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, sy, 8, 12), mat);
      limb.position.set(x, y, z);
      limb.scale.set(sx, 1, sz);
      return limb;
    };

    const lArm = makeLimb(-0.45, 1.52, -0.05, 0.9, 0.62, 0.9, uniform);
    lArm.rotation.z = -0.25;
    group.add(lArm);

    const rArm = makeLimb(0.45, 1.52, -0.05, 0.9, 0.62, 0.9, uniform);
    rArm.rotation.z = 0.25;
    group.add(rArm);

    const lLeg = makeLimb(-0.19, 0.55, 0, 1, 0.78, 1, uniform);
    group.add(lLeg);

    const rLeg = makeLimb(0.19, 0.55, 0, 1, 0.78, 1, uniform);
    group.add(rLeg);

    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.44), black);
    lBoot.position.set(-0.19, 0.1, -0.09);
    group.add(lBoot);

    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.44), black);
    rBoot.position.set(0.19, 0.1, -0.09);
    group.add(rBoot);

    const rifle = new THREE.Group();
    const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.11, 0.13), black);
    rifle.add(rifleBody);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), black);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 0.67;
    rifle.add(barrel);

    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.11), black);
    scope.position.set(0.12, 0.14, 0);
    rifle.add(scope);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.09), black);
    mag.position.set(0.18, -0.18, 0);
    rifle.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.18), black);
    stock.position.set(-0.62, -0.02, 0);
    rifle.add(stock);

    rifle.position.set(0.36, 1.52, -0.47);
    rifle.rotation.y = -0.15;
    group.add(rifle);

    group.userData = {
      health: enemy ? 75 : 100,
      maxHealth: enemy ? 75 : 100,
      enemy,
      speed: enemy ? 2.4 : 3,
      cooldown: 0,
      name,
      alive: true,
      flank: Math.random() < 0.5 ? -1 : 1,
      modelType: "procedural3d",
      limbs: { lArm, rArm, lLeg, rLeg, torso, hips, head, rifle },
      walkTime: Math.random() * 10,
      baseY: 0,
      actionLock: 0,
      hitReact: 0,
      shootRecoil: 0,
    };

    enableShadows(group);
    return group;
  }

  function getBestClip(state: GameState, preferredNames: string[]) {
    const availableClips = [...Object.values(state.fbxClips), ...state.enemyAnimations];
    if (!availableClips.length) return null;

    return (
      preferredNames
        .map((name) => availableClips.find((anim) => anim.name.toLowerCase().includes(name)))
        .find(Boolean) || availableClips[0]
    );
  }

  function playAnimation(state: GameState, model: THREE.Group, preferredNames: string[]) {
    const clip = getBestClip(state, preferredNames);
    if (!clip) return null;

    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.reset();
    action.fadeIn(0.15);
    action.play();
    state.mixers.push(mixer);
    model.userData.mixer = mixer;
    model.userData.currentAction = action;
    model.userData.currentClipName = clip.name;
    model.userData.actionLock = 0;
    return mixer;
  }

  function switchEnemyAnimation(state: GameState, model: THREE.Group, preferredNames: string[], force = false) {
    if (!model.userData.mixer) return;
    if (!force && model.userData.actionLock && model.userData.actionLock > 0) return;
    const clip = getBestClip(state, preferredNames);
    if (!clip || model.userData.currentClipName === clip.name) return;

    const mixer = model.userData.mixer as THREE.AnimationMixer;
    const oldAction = model.userData.currentAction as THREE.AnimationAction | undefined;
    const newAction = mixer.clipAction(clip);
    newAction.reset();
    newAction.fadeIn(force ? 0.04 : 0.2);
    newAction.play();
    if (oldAction && oldAction !== newAction) oldAction.fadeOut(force ? 0.04 : 0.2);
    model.userData.currentAction = newAction;
    model.userData.currentClipName = clip.name;
  }

  function buildAlliedNpcContext(state: GameState, interactPressed = false): AlliedNpcContext {
    const mission = state.activeMission;
    return {
      scene: state.scene,
      mixers: state.mixers,
      allies: state.allies,
      enemyTemplate: state.enemyTemplate,
      fbxModeLoaded: state.fbxModeLoaded,
      getClip: (preferred) => getBestClip(state, preferred),
      playClip: (mesh, preferred) => {
        playAnimation(state, mesh, preferred);
      },
      makeProceduralAlly: (name, role) =>
        makeRealisticProceduralSoldier(name, role === "commander" ? 0x4a5c42 : 0x3d4f52, false),
      playRadio: (line, opts) => state.audio.playRadio(line, opts),
      playerX: state.player.position.x,
      playerZ: state.player.position.z,
      gameMode: state.gameMode,
      running: state.running,
      extractMissionActive: mission?.type === "extraction",
      extractPhase: mission?.type === "extraction" ? mission.phase : 0,
      heli: state.extractionHeli,
      interactPressed,
      nowMs: performance.now(),
    };
  }

  /** Blend measured displacement with intended steer speed so stuck frames don't slow-mo gait. */
  function resolveEnemyAnimSpeed(motionSpeed: number, intendedSpeed: number, relocating: boolean) {
    if (!relocating) return motionSpeed;
    return Math.max(motionSpeed, intendedSpeed * 0.85);
  }

  /** Match Mixamo walk (~1.7 m/s) / run (~4.6 m/s) playback to world velocity. */
  function syncEnemyLocomotionTimeScale(enemy: THREE.Group, animSpeed: number) {
    const action = enemy.userData.currentAction as THREE.AnimationAction | undefined;
    if (!action) return;
    if (animSpeed < 0.35) {
      action.setEffectiveTimeScale(1);
      return;
    }
    const clipName = String(enemy.userData.currentClipName || "").toLowerCase();
    const reference = /run|sprint|jog/.test(clipName) ? 4.6 : 1.7;
    action.setEffectiveTimeScale(THREE.MathUtils.clamp(animSpeed / reference, 0.78, 1.45));
  }

  function enhanceEnemyCombatReadability(enemy: THREE.Group, type: EnemyType) {
    const uniformTone = new THREE.Color(type.color);
    const oliveShift = new THREE.Color(0x3a4230);

    enemy.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      // Weapon templates also share materials; isolate every soldier before
      // tinting or applying a hit flash.
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else {
        child.material = child.material.clone();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const name = child.name.toLowerCase();
      const isHelmet = /helmet|headgear|cap|hat/i.test(name);
      const isVest = /vest|armor|plate|tactical|gear|body/i.test(name);
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) return;
        // Matte military tint preserves texture detail without self-lighting.
        material.color.lerp(uniformTone, material.map ? 0.18 : 0.34);
        material.color.lerp(oliveShift, material.map ? 0.08 : 0.14);
        if (isHelmet) material.color.multiplyScalar(0.88);
        if (isVest) material.color.lerp(new THREE.Color(0x2a3024), 0.12);
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.roughness = Math.max(material.roughness ?? 0.8, 0.78);
        material.metalness = Math.min(material.metalness ?? 0, 0.08);
        material.userData.baseEmissiveHex = 0x000000;
        material.userData.baseEmissiveIntensity = 0;
      });
    });
  }

  function groundAlignSoldier(enemy: THREE.Group) {
    enemy.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(enemy);
    if (!Number.isFinite(box.min.y)) {
      enemy.userData.groundOffset = 0;
      return;
    }
    const offset = -box.min.y;
    enemy.userData.groundOffset = offset;
    enemy.position.y = offset;
    enemy.userData.baseY = offset;
  }

  function cloneEnemyFromTemplate(state: GameState, type: EnemyType) {
    const enemy = state.enemyTemplate
      ? (cloneSkeleton(state.enemyTemplate) as THREE.Group)
      : makeRealisticProceduralSoldier(type.name, type.color, true);

    enemy.name = type.name;
    enemy.userData = {
      ...enemy.userData,
      enemy: true,
      enemyType: type.name,
      health: type.hp,
      maxHealth: type.hp,
      speed: type.speed,
      scoreValue: type.score,
      range: type.range,
      damage: type.damage,
      fireCooldownMax: type.fireCooldown * ENEMY_FIRE_COOLDOWN_MUL,
      preferredDistance: type.preferredDistance,
      minimumDistance: type.minimumDistance,
      alive: true,
      cooldown: 0.8 + Math.random() * 1.8,
      flank: Math.random() < 0.5 ? -1 : 1,
      modelType: state.enemyTemplate ? (state.fbxModeLoaded ? "fbx-mixamo" : "mixamo-glb") : "procedural3d",
      walkTime: Math.random() * 10,
      baseY: 0,
      groundOffset: 0,
      actionLock: 0,
      hitReact: 0,
      shootRecoil: 0,
      stuckTime: 0,
      lastSeenAt: 0,
      muzzleFlashUntil: 0,
      burstShotsRemaining: 0,
      burstShotTimer: 0,
      smoothedSteer: new THREE.Vector3(),
      turnError: Math.PI,
      kneelUntil: 0,
      kneelBlend: 0,
      kneeling: false,
    };

    enemy.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // SkeletonUtils shares materials between clones. Give each enemy its
        // own material so hit flashes do not light up the entire squad.
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone());
        } else {
          child.material = child.material.clone();
        }
        // Enemy shadow casters are expensive at squad scale — rely on environment shadows only.
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    const weaponKind = pickEnemyWeapon(type.name);
    attachEnemyWeapon(enemy, weaponKind);
    // Apply the matte pass after weapon attachment so imported weapon
    // materials cannot reintroduce emissive accents.
    enhanceEnemyCombatReadability(enemy, type);

    if (state.enemyTemplate) {
      enemy.scale.setScalar(state.fbxModeLoaded ? 0.012 : GLB_SOLDIER_SCALE);
      playAnimation(state, enemy, ["idle_gun_pointing", "idle_gun", "idle"]);
      groundAlignSoldier(enemy);
    } else {
      enemy.scale.setScalar(1.48);
      enemy.userData.groundOffset = 0;
    }

    // Difficulty scaling
    const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
    enemy.userData.health = Math.round(type.hp * diff.enemyHpMul);
    enemy.userData.maxHealth = enemy.userData.health;
    enemy.userData.damage = Math.max(1, Math.round(type.damage * diff.enemyDmgMul));

    return enemy;
  }

  function clearAllEnemies(state: GameState) {
    state.enemies.forEach((enemy) => {
      if (enemy.userData.mixer) {
        state.mixers = state.mixers.filter((mixer) => mixer !== enemy.userData.mixer);
      }
      state.scene.remove(enemy);
    });
    state.enemies = [];
    state.dyingEnemies.forEach((enemy) => {
      if (enemy.userData.mixer) {
        state.mixers = state.mixers.filter((mixer) => mixer !== enemy.userData.mixer);
      }
      state.scene.remove(enemy);
    });
    state.dyingEnemies = [];
    state.missionMarkers.forEach((m) => state.scene.remove(m));
    state.missionMarkers = [];
    state.squads = [];
  }

  function clearRemotePlayers(state: GameState) {
    state.remotePlayers.forEach((avatar) => {
      if (avatar.userData.mixer) {
        state.mixers = state.mixers.filter((mixer) => mixer !== avatar.userData.mixer);
      }
      state.scene.remove(avatar);
    });
    state.remotePlayers.clear();
  }

  function tintRemoteAvatar(avatar: THREE.Group) {
    avatar.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color(0x0a3a4a);
        child.material.emissiveIntensity = 0.35;
      }
    });
  }

  function createRemoteAvatar(state: GameState, id: string, name: string) {
    if (state.remotePlayers.has(id)) return state.remotePlayers.get(id)!;

    const avatar = state.enemyTemplate
      ? (cloneSkeleton(state.enemyTemplate) as THREE.Group)
      : makeRealisticProceduralSoldier(name, 0x2f6f7a, true);

    avatar.name = `PVP:${name}`;
    avatar.userData = {
      ...avatar.userData,
      remotePlayerId: id,
      remoteName: name,
      alive: true,
      health: 100,
      maxHealth: 100,
      modelType: state.enemyTemplate ? (state.fbxModeLoaded ? "fbx-mixamo" : "mixamo-glb") : "procedural3d",
      walkTime: 0,
      baseY: 0,
      actionLock: 0,
      hitReact: 0,
      lastX: 0,
      lastZ: 0,
    };

    if (state.enemyTemplate) {
      avatar.scale.setScalar(state.fbxModeLoaded ? 0.012 : 1.15);
      tintRemoteAvatar(avatar);
      attachEnemyWeapon(avatar, "ak47");
      playAnimation(state, avatar, ["idle_gun_pointing", "idle_gun", "idle"]);
    } else {
      avatar.scale.setScalar(1.25);
      tintRemoteAvatar(avatar);
    }

    enableShadows(avatar);
    state.scene.add(avatar);
    state.remotePlayers.set(id, avatar);
    return avatar;
  }

  function removeRemoteAvatar(state: GameState, id: string) {
    const avatar = state.remotePlayers.get(id);
    if (!avatar) return;
    if (avatar.userData.mixer) {
      state.mixers = state.mixers.filter((mixer) => mixer !== avatar.userData.mixer);
    }
    state.scene.remove(avatar);
    state.remotePlayers.delete(id);
  }

  function updateRemoteAvatars(state: GameState, client: PvpClient, dt: number) {
    const now = performance.now();
    for (const id of client.listRemoteIds()) {
      const sample = client.sampleRemote(id, now);
      if (!sample) continue;
      let avatar = state.remotePlayers.get(id);
      if (!avatar) avatar = createRemoteAvatar(state, id, sample.name);
      avatar.userData.alive = sample.alive;
      avatar.userData.health = sample.health;
      avatar.visible = sample.alive;
      if (!sample.alive) continue;

      const prevX = avatar.userData.lastX ?? sample.x;
      const prevZ = avatar.userData.lastZ ?? sample.z;
      avatar.position.set(sample.x, sample.y, sample.z);
      // Mixamo visual front is local -Z; yaw alone aims that axis with camera forward.
      // Procedural fallback keeps the historical yaw+PI body convention.
      if (avatar.userData.modelType === "fbx-mixamo" || avatar.userData.modelType === "mixamo-glb") {
        avatar.rotation.y = sample.yaw;
      } else {
        avatar.rotation.y = sample.yaw + Math.PI;
      }
      const movedDist = Math.hypot(sample.x - prevX, sample.z - prevZ);
      const moving = movedDist > 0.02;
      avatar.userData.lastX = sample.x;
      avatar.userData.lastZ = sample.z;
      if (avatar.userData.modelType === "fbx-mixamo" || avatar.userData.modelType === "mixamo-glb") {
        switchEnemyAnimation(state, avatar, moving ? ["run_shoot", "run", "walk"] : ["idle_gun_pointing", "idle_gun", "idle"]);
      }
      animateSoldier(avatar, dt, moving);
      syncEnemyWeaponGrip(avatar);
    }
  }

  function loadGlbFallback(state: GameState) {
    if (state.enemyTemplatePromise) return state.enemyTemplatePromise;
    const gltfLoader = new GLTFLoader();
    state.enemyTemplatePromise = new Promise<void>((resolve) => {
      gltfLoader.load(
        SOLDIER_MODEL_URL,
        (gltf: GLTF) => {
          // Quaternius faces +Z; wrap the source once so combat and PVP can
          // consistently treat every rigged character as local -Z forward.
          const model = new THREE.Group();
          gltf.scene.rotation.y = Math.PI;
          model.add(gltf.scene);
          enableShadows(model);
          model.scale.setScalar(GLB_SOLDIER_SCALE);
          state.enemyAnimations = mergeAnimationLibrary(gltf.animations || []);
          state.enemyTemplate = model;
          state.enemyModelLoaded = true;
          state.fbxModeLoaded = false;
          // Desktop often starts Solo before this finishes — upgrade stand-ins
          // so the website matches the Quaternius soldiers seen in VR.
          promoteProceduralEnemiesToTemplate(state);
          ensureAlliedNpcs(state.alliedNpcState, buildAlliedNpcContext(state));
          if (state.gameMode === "solo" && state.enemies.length === 0 && state.running) {
            for (let i = 0; i < 9; i += 1) spawnEnemy(state);
            state.squads = assignSquads(state.enemies);
          }
          setHud((prev) => ({
            ...prev,
            modelMode: state.enemyAnimations.length
              ? `Detailed soldier (${state.enemyAnimations.length} animations)`
              : "Detailed soldier loaded",
          }));
          resolve();
        },
        undefined,
        () => {
          state.enemyTemplate = null;
          state.enemyAnimations = [];
          state.fbxClips = {};
          state.enemyModelLoaded = false;
          state.fbxModeLoaded = false;
          setHud((prev) => ({ ...prev, modelMode: "Using built-in soldiers — realistic model failed to load" }));
          ensureAlliedNpcs(state.alliedNpcState, buildAlliedNpcContext(state));
          if (state.gameMode === "solo" && state.enemies.length === 0 && state.running) {
            for (let i = 0; i < 9; i += 1) spawnEnemy(state);
            state.squads = assignSquads(state.enemies);
          }
          resolve();
        },
      );
    });
    return state.enemyTemplatePromise;
  }

  function loadEnemyTemplate(state: GameState) {
    // The bundled GLB is optimized for the web and includes idle, walk, and
    // run clips. Procedural soldiers remain a resilient offline fallback.
    return loadGlbFallback(state);
  }

  /** Swap early procedural stand-ins for the Quaternius GLB once it arrives. */
  function promoteProceduralEnemiesToTemplate(state: GameState) {
    if (!state.enemyTemplate || state.disposed) return;
    const standIns = state.enemies.filter(
      (enemy) => enemy.userData.alive && enemy.userData.modelType === "procedural3d",
    );
    if (!standIns.length) return;

    for (const old of standIns) {
      const type =
        ENEMY_TYPES.find((entry) => entry.name === old.userData.enemyType) || ENEMY_TYPES[0];
      const posX = old.position.x;
      const posZ = old.position.z;
      const yaw = old.rotation.y;
      const health = old.userData.health;
      const maxHealth = old.userData.maxHealth;
      const coverTarget = old.userData.coverTarget;
      const coverLockUntil = old.userData.coverLockUntil;
      const squadId = old.userData.squadId;
      const role = old.userData.role;

      if (old.userData.mixer) {
        state.mixers = state.mixers.filter((mixer) => mixer !== old.userData.mixer);
      }
      state.scene.remove(old);
      state.enemies = state.enemies.filter((enemy) => enemy !== old);

      const neu = cloneEnemyFromTemplate(state, type);
      const groundY = neu.userData.groundOffset ?? 0;
      neu.position.set(posX, groundY, posZ);
      neu.userData.baseY = groundY;
      neu.rotation.y = yaw;
      neu.userData.health = health;
      neu.userData.maxHealth = maxHealth;
      neu.userData.coverTarget = coverTarget;
      neu.userData.coverLockUntil = coverLockUntil;
      neu.userData.squadId = squadId;
      neu.userData.role = role;
      neu.userData.lastSeenAt = 0;
      state.scene.add(neu);
      state.enemies.push(neu);
    }
    state.squads = assignSquads(state.enemies);
  }

  /** Wait briefly for the GLB so wave-1 hostiles match VR instead of procedural blocks. */
  async function waitForEnemyTemplate(state: GameState, timeoutMs = 2800) {
    const pending = state.enemyTemplatePromise ?? loadEnemyTemplate(state);
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  }

  function scheduleWaveContent(state: GameState) {
    const token = (state.waveContentToken = (state.waveContentToken || 0) + 1);
    void (async () => {
      await waitForEnemyTemplate(state);
      if (state.disposed || !state.running || state.waveContentToken !== token) return;
      // Still empty if startMission cleared while waiting.
      if (state.enemies.length > 0) return;
      beginWaveContent(state);
    })();
  }

  function makeWall(width: number, height: number, depth: number, color = 0x4a4a42) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeMaterial(color, 0.9, 0.05));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function makeGroundTexture() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Could not create ground texture.");

    const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
    gradient.addColorStop(0, "#303027");
    gradient.addColorStop(0.45, "#1f211c");
    gradient.addColorStop(1, "#363328");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 9000; i += 1) {
      const shade = 20 + Math.floor(Math.random() * 70);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.05 + Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }

    ctx.strokeStyle = "rgba(160,150,120,.18)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1024; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x + Math.random() * 8 - 4, 0);
      ctx.lineTo(x + Math.random() * 8 - 4, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 8 - 4);
      ctx.lineTo(1024, y + Math.random() * 8 - 4);
      ctx.stroke();
    }

    for (let i = 0; i < 70; i += 1) {
      ctx.strokeStyle = `rgba(10,10,8,${0.22 + Math.random() * 0.22})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      let x = Math.random() * 1024;
      let y = Math.random() * 1024;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j += 1) {
        x += Math.random() * 70 - 35;
        y += Math.random() * 70 - 35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return c;
  }

  function makeDustField(particleCount = 1000) {
    const count = particleCount;
    const span = COMPOUND_GROUND_SIZE * 0.85;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * span;
      // Keep most motes near the ground — high floaters read as blocks crossing the view in VR.
      positions[i * 3 + 1] = 0.35 + Math.random() * 2.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * span;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = softPointsMaterial({
      color: 0xb8aa84,
      size: particleCount <= 320 ? 0.035 : 0.05,
      opacity: 0.22,
    });
    const points = new THREE.Points(geometry, material);
    points.userData.spin = true;
    points.userData.dustField = true;
    return points;
  }

  function pruneTinyShadowCasters(root: THREE.Object3D) {
    const size = new THREE.Vector3();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.castShadow) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      obj.geometry.boundingBox?.getSize(size);
      const volume = Math.abs(size.x * size.y * size.z);
      if (volume < 0.08) obj.castShadow = false;
    });
  }

  /** Forward+ lights are the biggest Solo FPS tax after shadows — keep a hard budget. */
  function limitPointLights(root: THREE.Object3D, maxCount: number) {
    const lights: THREE.PointLight[] = [];
    root.traverse((obj) => {
      if (obj instanceof THREE.PointLight) lights.push(obj);
    });
    lights.sort((a, b) => b.intensity * (b.distance || 1) - a.intensity * (a.distance || 1));
    lights.forEach((light, index) => {
      const keep = index < maxCount;
      light.visible = keep;
      if (!keep) {
        light.intensity = 0;
        light.castShadow = false;
        // Detach decorative lights so WebGL doesn't still evaluate them.
        if (light.parent && !light.userData.keepInScene) light.parent.remove(light);
      }
    });
  }

  function makeSmokeLayer(puffCount = 10) {
    const group = new THREE.Group();
    const span = COMPOUND_WALL * 1.7;
    for (let i = 0; i < puffCount; i += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.1 + Math.random() * 1.4, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x6f756e, transparent: true, opacity: 0.016, depthWrite: false })
      );
      puff.position.set((Math.random() - 0.5) * span, 3.2 + Math.random() * 4, (Math.random() - 0.5) * span);
      puff.scale.set(1.5 + Math.random(), 0.3 + Math.random() * 0.3, 1.2 + Math.random());
      puff.userData.floatOffset = Math.random() * Math.PI * 2;
      group.add(puff);
    }
    group.userData.smoke = true;
    return group;
  }

  function makeWeaponView() {
    const group = new THREE.Group();
    group.position.set(0.55, -0.55, -1.1);
    group.rotation.set(-0.08, -0.1, 0.05);
    const black = makeMaterial(0x080808, 0.45, 0.75);
    const metal = makeMaterial(0x252525, 0.35, 0.9);
    const glow = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.2 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 1.25), black);
    group.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 16), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.85;
    group.add(barrel);
    group.add(createM4Scope());
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glow);
    sight.position.set(0, 0.28, -0.38);
    group.add(sight);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      WEAPON_TEXTURE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = true;
        new FBXLoader().load(
          WEAPON_MODEL_URL,
          (model) => {
            const material = new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.48,
              metalness: 0.38,
            });
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.material = material;
                child.castShadow = true;
              }
            });

            // Normalize arbitrary source units and aim the muzzle down camera -Z.
            // m4a1.fbx is longest on +Z (stock toward -Z); a bare load left the
            // stock facing the crosshair. Flip 180° about Y so muzzle → -Z,
            // magazine stays down, grip/stock toward the player.
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const longest = Math.max(size.x, size.y, size.z) || 1;
            model.position.sub(center);
            model.scale.setScalar(1.55 / longest);
            if (size.x >= size.y && size.x >= size.z) {
              model.rotation.y = Math.PI / 2;
            } else if (size.z >= size.x && size.z >= size.y) {
              model.rotation.y = Math.PI;
            } else {
              model.rotation.x = -Math.PI / 2;
            }
            model.position.set(0.02, -0.02, -0.2);

            group.clear();
            group.add(model, createM4Scope());
          },
          undefined,
          () => {
            // Keep the procedural carbine if the asset cannot be loaded.
          }
        );
      },
      undefined,
      () => {
        // Keep the procedural carbine if the texture cannot be loaded.
      }
    );
    return group;
  }

  function makePistolView() {
    const group = new THREE.Group();
    group.position.set(0.3, -0.43, -0.82);
    group.rotation.set(-0.04, -0.08, 0.03);

    // Detailed fallback silhouette remains visible while the CC0 GLB loads.
    const steel = makeMaterial(0x22262a, 0.28, 0.88);
    const polymer = makeMaterial(0x111315, 0.72, 0.24);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.72), steel);
    slide.position.z = -0.12;
    group.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.52), polymer);
    frame.position.set(0, -0.12, 0.02);
    group.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.48, 0.25), polymer);
    grip.position.set(0, -0.36, 0.18);
    grip.rotation.x = -0.18;
    group.add(grip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 16), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.55);
    group.add(barrel);

    new GLTFLoader().load(
      PISTOL_MODEL_URL,
      (gltf: GLTF) => {
        const model = gltf.scene;
        // The source scene includes a second, loose magazine for display.
        // Keep the magazine seated in the frame for the FPS viewmodel.
        model.children.forEach((child) => {
          if (child.name === "Pistol_Magazine") child.visible = false;
        });
        enableShadows(model);
        // pistol.glb is longest on X with the muzzle toward +X. +π/2 maps
        // +X → camera -Z (barrel into the scene); grip stays downward.
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z) || 1;
        model.position.sub(center);
        const normalized = new THREE.Group();
        normalized.add(model);
        normalized.scale.setScalar(0.78 / longest);
        if (size.x >= size.y && size.x >= size.z) {
          normalized.rotation.y = Math.PI / 2;
        } else if (size.z >= size.x && size.z >= size.y) {
          normalized.rotation.y = Math.PI;
        } else {
          normalized.rotation.x = -Math.PI / 2;
        }
        normalized.position.set(0, -0.08, -0.12);
        group.clear();
        group.add(normalized);
      },
      undefined,
      () => {
        // Keep the modeled procedural pistol if the GLB cannot be loaded.
      }
    );
    return group;
  }

  function switchWeapon(state: GameState, nextWeapon: WeaponId) {
    if (state.activeWeapon === nextWeapon) return;
    state.weaponAmmo[state.activeWeapon] = state.ammo;
    state.activeWeapon = nextWeapon;
    state.weapon = state.weaponViews[nextWeapon];
    state.ammo = state.weaponAmmo[nextWeapon];
    state.maxAmmo = WEAPONS[nextWeapon].maxAmmo;
    state.reload = 0;
    state.fireCooldown = 0.12;
    state.triggerLatched = true;
    state.fireHeat = 0;
    state.recoilYaw = 0;
    // Crosshair-only: weapon meshes stay hidden across switches.
    applyPlayerWeaponVisibility(state.weaponViews);
    state.viewmodelPoses[nextWeapon].switchT = 1;
    state.audio.playSwitch();
    if (state.xr?.presenting) {
      attachWeaponsToGrip(state.xr, state.weaponViews, nextWeapon);
    }
  }

  function beginReload(state: GameState) {
    if (state.reload > 0 || state.ammo >= state.maxAmmo) return false;
    const wasEmpty = state.ammo <= 0;
    state.reload = WEAPONS[state.activeWeapon].reloadTime;
    state.audio.playReload(state.activeWeapon);
    if (
      wasEmpty &&
      state.gameMode !== "range" &&
      allowRadioCue("reloadRemind", 16000)
    ) {
      state.audio.playRadio(reloadRemindLine(), {
        channel: state.gameMode === "pvp" ? "pvp" : "mission",
      });
    }
    return true;
  }

  function radioChannelForMode(mode: GameMode): "mission" | "range" | "pvp" {
    if (mode === "range") return "range";
    if (mode === "pvp") return "pvp";
    return "mission";
  }

  function addStatic(parent: THREE.Object3D, colliders: THREE.Box3[], mesh: THREE.Object3D, x: number, y: number, z: number) {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  function addEnvironment(parent: THREE.Object3D, colliders: THREE.Box3[], mobile = false) {
    const scene = parent;
    const wall = COMPOUND_WALL;
    const wallLen = wall * 2;
    addStatic(scene, colliders, makeWall(wallLen, 5, 1.2, 0x3f423c), 0, 2.5, -wall);
    // Keep the north checkpoint physically open instead of hiding a solid
    // perimeter collider behind the gate arch.
    const gateHalfWidth = 5.5;
    const northWallSegmentLength = wall - gateHalfWidth;
    const northWallSegmentCenter = (wall + gateHalfWidth) / 2;
    addStatic(
      scene,
      colliders,
      makeWall(northWallSegmentLength, 5, 1.2, 0x3f423c),
      -northWallSegmentCenter,
      2.5,
      wall,
    );
    addStatic(
      scene,
      colliders,
      makeWall(northWallSegmentLength, 5, 1.2, 0x3f423c),
      northWallSegmentCenter,
      2.5,
      wall,
    );
    addStatic(scene, colliders, makeWall(1.2, 5, wallLen, 0x3f423c), -wall, 2.5, 0);
    addStatic(scene, colliders, makeWall(1.2, 5, wallLen, 0x3f423c), wall, 2.5, 0);

    // Inner HESCO berm skirt along walls — sparse FOB read, skipped on mobile for perf.
    if (!mobile) {
      const hescoMat = makeMaterial(0x8a7a58, 0.96, 0.02);
      const hescoFrame = makeMaterial(0x4a5038, 0.9, 0.08);
      const bermSpan = wallLen - 18;
      const bermStep = 4.8;
      for (const [x, z, alongX] of [
        [0, -wall + 1.8, true],
        [0, wall - 1.8, true],
        [-wall + 1.8, 0, false],
        [wall - 1.8, 0, false],
      ] as const) {
        for (let t = -bermSpan / 2; t <= bermSpan / 2; t += bermStep) {
          const unit = new THREE.Group();
          const fill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 1.5), hescoMat);
          fill.position.y = 0.68;
          fill.castShadow = true;
          fill.receiveShadow = true;
          unit.add(fill);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.58, 1.4, 1.58), hescoFrame);
          frame.position.y = 0.7;
          unit.add(frame);
          unit.position.set(alongX ? x + t : x, 0, alongX ? z : z + t);
          scene.add(unit);
        }
      }
    }

    const concrete = makeMaterial(0x5c574c, 0.92, 0.02);
    const darkConcrete = makeMaterial(0x35322c, 0.96, 0.02);
    const metal = makeMaterial(0x3a403c, 0.62, 0.38);
    const asphalt = makeMaterial(0x1c2022, 0.96, 0.02);
    const paintedMetal = makeMaterial(0x2c3a34, 0.7, 0.28);
    const safetyPaint = makeMaterial(0xd49a28, 0.7, 0.18);
    const trimPaint = makeMaterial(0x6e6348, 0.82, 0.08);
    const litWindow = new THREE.MeshStandardMaterial({
      color: 0xb6e0d0,
      emissive: 0x4f8f7a,
      emissiveIntensity: 1.45,
      roughness: 0.28,
      metalness: 0.1,
    });
    const warmWindow = new THREE.MeshStandardMaterial({
      color: 0xf0d4a0,
      emissive: 0xb87830,
      emissiveIntensity: 1.25,
      roughness: 0.35,
      metalness: 0.05,
    });

    // Road network: main spine, cross streets, and side flanking lanes.
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, wallLen - 8), asphalt);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0.025, 0);
    mainRoad.receiveShadow = true;
    scene.add(mainRoad);
    const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(wallLen - 16, 10), asphalt);
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(0, 0.028, -12);
    crossRoad.receiveShadow = true;
    scene.add(crossRoad);
    const northCross = new THREE.Mesh(new THREE.PlaneGeometry(wallLen - 20, 8), asphalt);
    northCross.rotation.x = -Math.PI / 2;
    northCross.position.set(0, 0.027, 22);
    northCross.receiveShadow = true;
    scene.add(northCross);
    for (const x of [-22, 22]) {
      const sideLane = new THREE.Mesh(new THREE.PlaneGeometry(8, wallLen - 24), asphalt);
      sideLane.rotation.x = -Math.PI / 2;
      sideLane.position.set(x, 0.026, 0);
      sideLane.receiveShadow = true;
      scene.add(sideLane);
    }

    for (let z = -(wall - 10); z <= wall - 10; z += 5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.5), safetyPaint);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.04, z);
      scene.add(stripe);
    }

    const helipadMarking = makeHelipadMarking(EXTRACT_LZ.radius);
    helipadMarking.position.set(EXTRACT_LZ.x, 0, EXTRACT_LZ.z);
    scene.add(helipadMarking);
    const heliLight = new THREE.PointLight(0xe8c56a, 3.2, 28, 1.6);
    heliLight.position.set(EXTRACT_LZ.x, 5.5, EXTRACT_LZ.z);
    scene.add(heliLight);

    // Outer warehouses + flank annexes — keeps the center yard open for fights.
    const buildings: Array<[number, number, number, number, number]> = [
      [-48, -14, 12, 20, 8],
      [48, -12, 13, 22, 9],
      [-48, 34, 13, 18, 7],
      [48, 34, 12, 19, 8],
      [0, -48, 20, 12, 6],
      [-48, 8, 10, 10, 6],
      [48, 8, 10, 10, 6],
      [-28, -46, 9, 10, 5],
      [28, -46, 9, 10, 5],
    ];

    buildings.forEach(([x, z, w, d, h]) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.45), concrete);
      back.position.set(0, h / 2, d / 2);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.45, h * 0.8, d), concrete);
      left.position.set(-w / 2, (h * 0.8) / 2, 0);
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, d), concrete);
      right.position.set(w / 2, h / 2, 0);
      const frontA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.62, 0.45), concrete);
      frontA.position.set(-w * 0.33, (h * 0.62) / 2, -d / 2);
      const frontB = frontA.clone();
      frontB.position.x = w * 0.33;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, h * 0.22, 0.45), concrete);
      lintel.position.set(0, h * 0.82, -d / 2);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.35, d + 0.7), darkConcrete);
      roof.position.y = h + 0.18;
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.55, d + 0.9), trimPaint);
      parapet.position.y = h + 0.48;
      const parapetCut = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.6, d + 0.2), darkConcrete);
      parapetCut.position.y = h + 0.48;
      // Stained tactical floor — overlays in interiors.ts add hazard stripes.
      const interiorFloor = makeMaterial(0x2c2a26, 0.97, 0.02);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), interiorFloor);
      floor.position.y = 0.11;
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.28, 0.2), safetyPaint);
      fascia.position.set(0, h * 0.92, -d / 2 - 0.35);
      const shellMeshes = [back, left, right, frontA, frontB, lintel, roof, parapet, floor, fascia];
      // Every shell has a real segmented doorway. Walls remain collidable, but
      // players can use the visible opening to enter and leave each interior.
      shellMeshes.forEach((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      });
      group.add(parapetCut);

      // Doorframe metal trim — reads as a roller-bay opening.
      const doorFrameMat = paintedMetal;
      const doorW = w * 0.34;
      const doorH = h * 0.62;
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, doorH, 0.22), doorFrameMat);
        jamb.position.set(side * (doorW * 0.52), doorH / 2, -d / 2 - 0.12);
        jamb.castShadow = true;
        group.add(jamb);
      }
      const header = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.35, 0.2, 0.22), doorFrameMat);
      header.position.set(0, doorH + 0.08, -d / 2 - 0.12);
      group.add(header);
      // Raised roller shutter panel above the opening (visual only — passage stays open).
      const shutter = new THREE.Mesh(
        new THREE.BoxGeometry(doorW * 0.92, h * 0.18, 0.1),
        makeMaterial(0x3a423c, 0.55, 0.45),
      );
      shutter.position.set(0, h * 0.72, -d / 2 - 0.2);
      group.add(shutter);

      const isHangar = Math.abs(x) < 1 && z < -40;
      const windowLit = isHangar ? warmWindow : litWindow;
      for (const side of [-1, 1]) {
        for (const row of [0.38, 0.68]) {
          const window = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, 0.9, 0.08), side > 0 || isHangar ? windowLit : warmWindow);
          window.position.set(side * w * 0.28, h * row, -d / 2 - 0.27);
          group.add(window);
        }
        const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, d * 0.16), windowLit);
        sideWindow.position.set(side * (w / 2 + 0.28), h * 0.55, d * 0.05);
        group.add(sideWindow);
      }
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.4, 14), metal);
      vent.position.set(w * 0.28, h + 0.9, d * 0.18);
      group.add(vent);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), paintedMetal);
      dish.position.set(-w * 0.25, h + 0.75, -d * 0.1);
      dish.rotation.x = 0.4;
      group.add(dish);

      for (let i = 0; i < 6; i += 1) {
        const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.35), darkConcrete);
        const rx = (Math.random() - 0.5) * (w + 2);
        const rz = -d / 2 - 1.2 - Math.random() * 2.5;
        if (Math.hypot(x + rx, z + rz - 10) < 11) continue;
        rubble.position.set(rx, 0.18, rz);
        rubble.scale.y = 0.35 + Math.random() * 0.55;
        rubble.rotation.set(Math.random(), Math.random(), Math.random());
        rubble.castShadow = true;
        group.add(rubble);
      }
      scene.add(group);
      group.updateMatrixWorld(true);
      group.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry && child.position.y > 0.5) colliders.push(new THREE.Box3().setFromObject(child));
      });
    });

    const towerInset = wall - 6;
    const towerPositions: Array<[number, number]> = [
      [-towerInset, -towerInset],
      [towerInset, -towerInset],
      [-towerInset, towerInset],
      [towerInset, towerInset],
    ];
    towerPositions.forEach(([x, z], index) => {
      const tower = new THREE.Group();
      tower.position.set(x, 0, z);
      for (const lx of [-1.25, 1.25]) {
        for (const lz of [-1.25, 1.25]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.5, 0.22), paintedMetal);
          leg.position.set(lx, 3.25, lz);
          leg.castShadow = true;
          tower.add(leg);
        }
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 3.6), metal);
      deck.position.y = 6.4;
      deck.castShadow = true;
      tower.add(deck);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.7, 2.8), paintedMetal);
      cabin.position.y = 7.35;
      cabin.castShadow = true;
      tower.add(cabin);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.08), litWindow);
      glass.position.set(0, 7.55, index < 2 ? 1.44 : -1.44);
      tower.add(glass);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 0.75, 4), darkConcrete);
      roof.position.y = 8.55;
      roof.rotation.y = Math.PI / 4;
      tower.add(roof);
      const sandbagRing = makeSandbagWall(createFallbackEnvTextures(), 3.2, 1.0);
      tower.add(sandbagRing);
      const towerWire = makeConcertinaWire(2.6, mobile ? 6 : 10);
      towerWire.position.set(0, 6.6, index < 2 ? 1.5 : -1.5);
      tower.add(towerWire);
      const flood = new THREE.SpotLight(0xe8f4ff, 18, 72, Math.PI / 5.5, 0.45, 0.95);
      flood.position.set(0, 8, 0);
      flood.target.position.set(-x * 0.35, 0, -z * 0.35);
      tower.add(flood);
      scene.add(flood.target);
      scene.add(tower);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 3.2, z), new THREE.Vector3(3.5, 6.5, 3.5)));
    });

    const gateZ = wall;
    for (const x of [-7, 7]) {
      addStatic(scene, colliders, makeWall(2.1, 6.2, 2.1, 0x303832), x, 3.1, gateZ);
    }
    const gateBeam = makeWall(16, 1.1, 1.1, 0x252d29);
    gateBeam.position.set(0, 6.4, gateZ);
    gateBeam.castShadow = true;
    scene.add(gateBeam);
    const gateLight = new THREE.PointLight(0x8de6ff, 6.5, 30);
    gateLight.position.set(0, 5.3, gateZ - 2.5);
    scene.add(gateLight);
    const checkpointBooth = new THREE.Group();
    checkpointBooth.position.set(-6.5, 0, gateZ - 1.2);
    const boothBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.5, 2.4), makeMaterial(0xc4b8a0, 0.88, 0.05));
    boothBody.position.y = 1.25;
    boothBody.castShadow = true;
    checkpointBooth.add(boothBody);
    const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 2.8), makeMaterial(0x3a4038, 0.7, 0.35));
    boothRoof.position.y = 2.6;
    checkpointBooth.add(boothRoof);
    const boothWindow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.08), litWindow);
    boothWindow.position.set(0, 1.45, -1.24);
    checkpointBooth.add(boothWindow);
    const boothSign = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.28, 0.06),
      makeMaterial(0xd4a017, 0.7, 0.15),
    );
    boothSign.position.set(0, 2.15, -1.26);
    checkpointBooth.add(boothSign);
    scene.add(checkpointBooth);
    colliders.push(new THREE.Box3().setFromObject(checkpointBooth));

    const lampStep = mobile ? 20 : 10;
    for (let z = -(wall - 16); z <= wall - 12; z += lampStep) {
      for (const x of [-8.5, 8.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.4, 10), paintedMetal);
        pole.position.set(x, 2.2, z);
        pole.castShadow = !mobile;
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.32), litWindow);
        lamp.position.set(x, 4.35, z);
        scene.add(lamp);
        // Every other lamp gets a real light on mobile/Quest — emissive mesh still sells the look.
        if (!mobile || ((z / lampStep) | 0) % 2 === 0) {
          const light = new THREE.PointLight(0xd7efff, mobile ? 2.2 : 3.4, mobile ? 14 : 20, 1.55);
          light.position.set(x, 4.15, z);
          scene.add(light);
        }
      }
    }

    for (let i = 0; i < (mobile ? 12 : 28); i += 1) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(1.4 + Math.random() * 2.8, mobile ? 12 : 28), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.55, depthWrite: false }));
      crater.rotation.x = -Math.PI / 2;
      crater.position.set((Math.random() - 0.5) * (wallLen - 20), 0.018, (Math.random() - 0.5) * (wallLen - 20));
      scene.add(crater);
    }

    const firePositions: Array<[number, number]> = mobile
      ? [
          [-18, -21],
          [19, -12],
          [8, 24],
          [0, -40],
        ]
      : [
          [-18, -21],
          [19, -12],
          [-24, 18],
          [8, 24],
          [26, 6],
          [-40, -36],
          [42, 20],
          [0, -40],
        ];
    firePositions.forEach(([x, z], index) => {
      const fireGroup = new THREE.Group();
      fireGroup.position.set(x, 0, z);
      fireGroup.userData.fire = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 0.22, 14), makeMaterial(0x090806, 0.95, 0.05));
      base.position.y = 0.12;
      fireGroup.add(base);
      const flameCount = mobile ? 2 : 4;
      for (let i = 0; i < flameCount; i += 1) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.25, 1.2 + Math.random() * 0.9, 12), new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.78 }));
        flame.position.set((Math.random() - 0.5) * 0.55, 0.65 + Math.random() * 0.45, (Math.random() - 0.5) * 0.55);
        fireGroup.add(flame);
      }
      // Point lights are a major cost — one fire light max on low/mobile paths.
      if (!mobile || index < 1) {
        const light = new THREE.PointLight(0xff5a00, mobile ? 1.6 : 2.2, mobile ? 8 : 12);
        light.position.set(0, 1.6, 0);
        light.userData.fireLight = true;
        fireGroup.add(light);
      }
      scene.add(fireGroup);
    });

    // Battle damage — wrecks and breach sandbags thickening the contested yard.
    const envTextures = createFallbackEnvTextures();
    const wreckPositions: Array<[number, number, number]> = [
      [-14, -10, 0.35],
      [16, 8, -0.55],
      [-6, 18, 1.1],
      [22, -28, -0.2],
    ];
    wreckPositions.forEach(([x, z, rotY]) => {
      const wreck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), makeMaterial(0x3a3530, 0.9, 0.1));
      body.position.y = 1;
      body.rotation.z = (Math.random() - 0.5) * 0.1;
      wreck.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.8), makeMaterial(0x2a2520, 0.92, 0.08));
      cab.position.set(-1.9, 0.9, 0);
      wreck.add(cab);
      const scorch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), makeMaterial(0x121010, 0.95, 0));
      scorch.position.set(0.5, 1.35, 0.3);
      wreck.add(scorch);
      wreck.rotation.y = rotY;
      addStatic(scene, colliders, wreck, x, 0, z);
    });
    (
      [
        [-15, -9, 0.2],
        [15, 7, Math.PI],
        [-7, 17, 0],
        [0, -38, 0],
        [-24, 2, Math.PI / 2],
        [24, -4, -Math.PI / 2],
      ] as Array<[number, number, number]>
    ).forEach(([x, z, rot]) => {
      const bags = makeSandbagWall(envTextures, 3.6);
      bags.rotation.y = rot;
      addStatic(scene, colliders, bags, x, 0, z);
    });
    if (!mobile) {
      const breachWire = makeConcertinaWire(10, 10);
      breachWire.position.set(0, 5.05, 44);
      scene.add(breachWire);
    }
  }

  function makeGame(container: HTMLDivElement): GameState {
    const savedSettings = loadSettings();
    const mobile = isTouchDevice();
    const gfx = graphicsConfig(mobile ? "low" : savedSettings.graphics);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121812);
    scene.fog = new THREE.FogExp2(0x1a1f18, gfx.fogDensity);

    const camera = new THREE.PerspectiveCamera(savedSettings.fov, container.clientWidth / container.clientHeight, 0.1, 600);
    camera.position.set(0, 2.2, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.1 : gfx.pixelRatioCap));
    renderer.shadowMap.enabled = Boolean(gfx.enableShadows) && !mobile;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = Boolean(gfx.enableShadows) && !mobile;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES is expensive on integrated GPUs; Reinhard keeps contrast with less cost.
    renderer.toneMapping =
      savedSettings.graphics === "high" ? THREE.ACESFilmicToneMapping : THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = savedSettings.graphics === "high" ? 1.15 : 1.05;
    container.appendChild(renderer.domElement);

    const compoundMapRoot = new THREE.Group();
    compoundMapRoot.name = "CompoundMap";
    scene.add(compoundMapRoot);

    const hemisphereLight = new THREE.HemisphereLight(0x9aa8b4, 0x2f281c, 1.15);
    scene.add(hemisphereLight);
    const moon = new THREE.DirectionalLight(0xffe6c4, 2.85);
    moon.position.set(-18, 28, 12);
    moon.castShadow = Boolean(gfx.enableShadows) && !mobile;
    moon.shadow.mapSize.set(gfx.shadowMapSize, gfx.shadowMapSize);
    moon.shadow.camera.left = -40;
    moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40;
    moon.shadow.camera.bottom = -40;
    compoundMapRoot.add(moon);
    // Skip decorative RGB point lights on medium/low — they dominate fill-rate.
    if (savedSettings.graphics === "high" && !mobile) {
      const redAlarm = new THREE.PointLight(0xff1f1f, 1.6, 18);
      redAlarm.position.set(9, 5, -14);
      compoundMapRoot.add(redAlarm);
      const blueLight = new THREE.PointLight(0x38bdf8, 1.4, 16);
      blueLight.position.set(-8, 4, 8);
      compoundMapRoot.add(blueLight);
    }
    const fill = new THREE.AmbientLight(0x4a5248, 0.72);
    compoundMapRoot.add(fill);
    const yardFill = new THREE.PointLight(0xc9d6c4, savedSettings.graphics === "high" ? 2.0 : 1.4, 36, 1.6);
    yardFill.position.set(0, 10, 6);
    compoundMapRoot.add(yardFill);

    const groundTex = new THREE.CanvasTexture(makeGroundTexture());
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(22, 22);
    const groundSegs = mobile || savedSettings.graphics !== "high" ? 24 : 40;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(COMPOUND_GROUND_SIZE, COMPOUND_GROUND_SIZE, groundSegs, groundSegs),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.98,
        metalness: 0.02,
        bumpMap: savedSettings.graphics === "high" ? groundTex : null,
        bumpScale: 0.03,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = Boolean(gfx.enableShadows);
    compoundMapRoot.add(ground);
    const dustBudget =
      mobile || savedSettings.graphics === "low"
        ? 0
        : savedSettings.graphics === "medium"
          ? 90
          : 180;
    const dust = dustBudget > 0 ? makeDustField(dustBudget) : null;
    const smoke = makeSmokeLayer(mobile || savedSettings.graphics !== "high" ? 2 : 4);
    if (dust) compoundMapRoot.add(dust);
    compoundMapRoot.add(smoke);

    const colliders: THREE.Box3[] = [];
    const compoundScene = compoundMapRoot as unknown as THREE.Scene;
    addEnvironment(compoundScene, colliders, mobile);
    const destruction = new DestructionSystem(scene, colliders);
    createWarehouseInterior(compoundScene, colliders, destruction);
    // Place yard combat cover immediately so wave-1 spawns can use sandbags/Jersey
    // instead of waiting on texture downloads.
    addCombatCoverToCompound(compoundScene, colliders, createFallbackEnvTextures());
    addMilitaryFobDressing(compoundScene, colliders, createFallbackEnvTextures(), mobile);
    scene.userData.combatCoverReady = true;
    // Drop pouch/rubble-sized shadow casters — they dominate GPU cost without reading.
    pruneTinyShadowCasters(compoundMapRoot);
    limitPointLights(compoundMapRoot, gfx.maxPointLights);
    if (!gfx.enableShadows) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
    }

    const player = new THREE.Group();
    player.name = "Bradley FPS Controller";
    player.position.set(0, 0, 10);
    player.userData = { baseY: 0, actionLock: 0, modelType: "fps-controller" };
    scene.add(player);

    const m4View = makeWeaponView();
    const smgView = makeWeaponView();
    smgView.scale.set(0.82, 0.82, 0.72);
    smgView.position.set(0.5, -0.52, -1);
    const pistolView = makePistolView();
    camera.add(m4View, smgView, pistolView);
    // Crosshair-only aiming: keep FPS meshes parented but never drawn.
    applyPlayerWeaponVisibility({ m4: m4View, smg: smgView, pistol: pistolView });
    scene.add(camera);

    const allies: THREE.Group[] = [];
    const audio = createImmersiveAudio();
    audio.setGameMode("solo");
    audio.setVolumes({
      master: savedSettings.masterVolume,
      sfx: savedSettings.sfxVolume,
      radio: savedSettings.radioVolume,
    });

    const combatFx = createCombatFx(scene);
    const atmosphere = initAtmosphere(scene, gfx.volumetricFog, {
      lowPower: mobile || savedSettings.graphics !== "high",
      debrisCount: mobile ? 40 : savedSettings.graphics === "low" ? 50 : savedSettings.graphics === "medium" ? 70 : 110,
      rainIntensityScale: mobile || savedSettings.graphics !== "high" ? 0.3 : 0.55,
    });
    setWeather(atmosphere, scene, "clear_night");
    // One-time registration — updateAtmosphereSystem no longer traverses the full scene.
    scene.traverse((obj) => {
      if (obj.userData.fire) registerAtmosphereFx(atmosphere, "fire", obj);
      if (obj.userData.fireLight && obj instanceof THREE.PointLight) {
        registerAtmosphereFx(atmosphere, "fireLight", obj);
      }
      if (obj.userData.spin) registerAtmosphereFx(atmosphere, "spin", obj);
      if (obj.userData.smoke) registerAtmosphereFx(atmosphere, "smoke", obj);
    });

    const state: GameState = {
      scene,
      camera,
      renderer,
      clock: (() => {
        const timer = new THREE.Timer();
        timer.connect(document);
        return timer;
      })(),
      player,
      weapon: m4View,
      weaponViews: { m4: m4View, smg: smgView, pistol: pistolView },
      activeWeapon: "m4",
      weaponAmmo: { m4: WEAPONS.m4.maxAmmo, smg: WEAPONS.smg.maxAmmo, pistol: WEAPONS.pistol.maxAmmo },
      triggerLatched: false,
      fireHeat: 0,
      allies,
      enemies: [],
      bullets: [],
      grenades: [],
      grenadesRemaining: 3,
      colliders,
      health: 100,
      maxHealth: 100,
      ammo: 30,
      maxAmmo: 30,
      score: 0,
      wave: 1,
      fireCooldown: 0,
      reload: 0,
      yaw: 0,
      pitch: 0,
      recoil: 0,
      recoilYaw: 0,
      running: false,
      disposed: false,
      enemyTemplate: null,
      enemyTemplatePromise: null,
      enemyAnimations: [],
      fbxClips: {},
      mixers: [],
      enemyModelLoaded: false,
      waveContentToken: 0,
      fbxModeLoaded: false,
      killStreak: 0,
      bestStreak: 0,
      medkits: 1,
      missionStartedAt: 0,
      lastMissionTime: "00:00",
      playerDamageCooldown: 0,
      enemyVolleyCooldown: 0,
      enemyGrenadeLockUntil: 0,
      playerStationarySec: 0,
      lastPlayerX: 0,
      lastPlayerZ: 10,
      gameMode: "solo",
      pvpKills: 0,
      pvpDeaths: 0,
      remotePlayers: new Map(),
      pvpSendAccum: 0,
      pvpAlive: true,
      pvpRespawnBanner: "",
      audio,
      nextRadioAt: Number.POSITIVE_INFINITY,
      announcedWave: 1,
      contactUntil: 0,
      lastDamageBearing: null,
      combatFx,
      atmosphere,
      battlefieldChaos: initBattlefieldChaos(),
      activeMission: null,
      coverPoints: [],
      squads: [],
      viewmodelPoses: {
        m4: createViewmodelPose("m4"),
        smg: createViewmodelPose("smg"),
        pistol: createViewmodelPose("pistol"),
      },
      crouching: false,
      footstepAccum: 0,
      nextDistantFireAt: 12,
      nextCalloutAt: 8,
      nextPressureSpawnAt: 0,
      difficulty: "operator",
      sessionKills: 0,
      interactPulse: false,
      settings: savedSettings,
      adsHeld: false,
      adsBlend: 0,
      groundMesh: ground,
      missionMarkers: [],
      dyingEnemies: [],
      shootingRange: null,
      compoundColliders: colliders,
      compoundMapRoot,
      activeSceneId: "compound",
      altSceneSession: null,
      spawnHalf: COMPOUND_SPAWN_HALF,
      hemisphereLight,
      pickups: createPickupSession(compoundMapRoot, mobile),
      pickupPrompt: null,
      xr: null,
      destruction,
      quality: new DynamicQualityGovernor(
        renderer,
        mobile ? 1.25 : gfx.pixelRatioCap,
        true,
        mobile ? "mobile" : "desktop",
      ),
      extractionHeli: null,
      extractReinforceAt: 0,
      extractAnnouncedPhase: -1,
      extractSucceeded: false,
      extractCinematic: false,
      alliedNpcState: createAlliedNpcState(),
    };

    destruction.atmosphere = atmosphere;

    const extractionHeli = createExtractionHelicopter();
    state.scene.add(extractionHeli.root);
    state.extractionHeli = extractionHeli;
    // Desktop: keep the authored procedural bird (open cabin + seats). GLB is optional
    // detail LOD — only swap when it includes a CabinFloor and we still inject seats if needed.
    const wantGlb = false;
    if (wantGlb) {
      void upgradeExtractionHelicopterToGlb(extractionHeli, { enabled: true }).catch(() => undefined);
    }

    state.coverPoints = buildCoverPointsFromColliders(colliders);
    loadEnemyTemplate(state);
    void preloadEnemyWeapons().then(() => {
      if (state.disposed) return;
      // Fast mission starts may initially receive procedural weapons while the
      // larger pistol GLB is still loading. Replace those mounts in place once.
      state.enemies.forEach((enemy) => {
        if (!enemy.userData.alive) return;
        attachEnemyWeapon(enemy, enemy.userData.enemyWeapon || pickEnemyWeapon(String(enemy.userData.enemyType || "")));
        enhanceEnemyCombatReadability(enemy, ENEMY_TYPES.find((type) => type.name === enemy.userData.enemyType) || ENEMY_TYPES[0]);
      });
    });
    void loadEnvironmentTextures()
      .then((textures) => {
        if (state.disposed) return;
        applyTexturedGround(ground, textures);
        // Combat cover is already in the scene from fallbacks — only refresh points.
        state.coverPoints = buildCoverPointsFromColliders(colliders);
      })
      .catch(() => {
        // Procedural compound remains if textures fail.
      });
    void populateCompoundWithEnvironmentAssets(scene, colliders)
      .then(() => {
        if (state.disposed) return;
        state.coverPoints = buildCoverPointsFromColliders(colliders);
        pruneTinyShadowCasters(scene);
        limitPointLights(scene, graphicsConfig(isTouchDevice() ? "low" : state.settings.graphics).maxPointLights);
      })
      .catch((error) => {
        console.warn("[BDS] Imported environment assets failed to load", error);
      });

    // QA/playtest hook — used by Playwright scripts to inspect runtime state.
    (window as unknown as { __darkSector?: GameState & { completeExtractionVictory?: (s: GameState) => void; syncWeaponGrip?: typeof syncEnemyWeaponGrip } }).__darkSector = state;
    (window as unknown as { __darkSector?: { completeExtractionVictory?: (s: GameState) => void; syncWeaponGrip?: typeof syncEnemyWeaponGrip } }).__darkSector!.completeExtractionVictory =
      completeExtractionVictory;
    (window as unknown as { __darkSector?: { syncWeaponGrip?: typeof syncEnemyWeaponGrip } }).__darkSector!.syncWeaponGrip = syncEnemyWeaponGrip;
    return state;
  }

  function clampSpawnCoord(state: GameState, value: number) {
    return THREE.MathUtils.clamp(value, -state.spawnHalf, state.spawnHalf);
  }

  function activateCombatScene(state: GameState, sceneId: CombatSceneId) {
    if (state.altSceneSession && state.altSceneSession.id !== sceneId) {
      state.scene.remove(state.altSceneSession.root);
      state.altSceneSession.dispose();
      state.altSceneSession = null;
    }

    state.activeSceneId = sceneId;

    if (sceneId === "compound") {
      state.compoundMapRoot.visible = true;
      state.colliders = state.compoundColliders;
      state.spawnHalf = COMPOUND_SPAWN_HALF;
      if (state.pickups) state.pickups.root.visible = true;
      if (state.extractionHeli) state.extractionHeli.root.visible = true;
      applyCombatSceneAtmosphere(state.scene, state.atmosphere, "compound", state.hemisphereLight);
    } else {
      state.compoundMapRoot.visible = false;
      if (state.pickups) state.pickups.root.visible = false;
      if (state.extractionHeli) state.extractionHeli.root.visible = false;
      if (!state.altSceneSession || state.altSceneSession.id !== sceneId) {
        const session = buildCombatScene(sceneId, {
          mobile: isTouchDevice(),
          textures: createFallbackEnvTextures(),
        });
        if (session) {
          state.scene.add(session.root);
          state.altSceneSession = session;
        }
      }
      if (state.altSceneSession) {
        state.colliders = state.altSceneSession.colliders;
        state.spawnHalf = state.altSceneSession.spawnHalf;
      }
      applyCombatSceneAtmosphere(state.scene, state.atmosphere, sceneId, state.hemisphereLight);
    }

    state.destruction.setColliders(state.colliders);
    state.coverPoints = buildCoverPointsFromColliders(state.colliders);
  }

  function spawnEnemy(state: GameState, forcedType?: EnemyType) {
    if (state.enemies.length >= MAX_ALIVE_ENEMIES()) return;
    if (!state.enemyTemplate) {
      setHud((prev) => ({ ...prev, modelMode: "Using built-in soldiers — FBX files not found in /public/models" }));
    }

    const type = forcedType ?? ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    const enemy = cloneEnemyFromTemplate(state, type);

    // Prefer spawning at/near yard cover so hostiles don't open on the open road.
    let x = 0;
    let z = 0;
    let placed = false;
    const covers = state.coverPoints || [];
    const { min: spawnMin, max: spawnMax } = spawnDistanceBand(state);
    if (covers.length) {
      const candidates = covers
        .map((c) => {
          const d = Math.hypot(c.x - state.player.position.x, c.z - state.player.position.z);
          return { c, d };
        })
        .filter((entry) => entry.d >= spawnMin && entry.d <= spawnMax)
        .sort((a, b) => a.d - b.d);
      const pool = candidates.length ? candidates.slice(0, Math.min(28, candidates.length)) : [];
      for (let attempt = 0; attempt < 10 && pool.length; attempt += 1) {
        const pick = pool[Math.floor(Math.random() * pool.length)].c;
        // Offset slightly so they stand behind the prop relative to the player.
        const awayX = pick.x - state.player.position.x;
        const awayZ = pick.z - state.player.position.z;
        const len = Math.hypot(awayX, awayZ) || 1;
        const px = pick.x + (awayX / len) * (0.7 + Math.random() * 0.6);
        const pz = pick.z + (awayZ / len) * (0.7 + Math.random() * 0.6);
        const clampedX = clampSpawnCoord(state, px);
        const clampedZ = clampSpawnCoord(state, pz);
        if (!canMoveTo(state, new THREE.Vector3(clampedX, 0, clampedZ))) continue;
        if (Math.hypot(clampedX - state.player.position.x, clampedZ - state.player.position.z) < 9) continue;
        x = clampedX;
        z = clampedZ;
        enemy.userData.coverTarget = pick;
        // Short initial dwell so spawn-at-cover still peeks, then relocates.
        enemy.userData.coverLockUntil = state.clock.getElapsed() + 2.4;
        enemy.userData.coverArrivedAt = state.clock.getElapsed();
        enemy.userData.repositionUntil = state.clock.getElapsed() + 1.8 + Math.random();
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Fallback: forward hemisphere open spawn (legacy).
      const forwardYaw = state.yaw;
      const arcHalf = Math.PI * 0.42;
      const spawnYaw = forwardYaw + (Math.random() * 2 - 1) * arcHalf;
      const dist = spawnMin + Math.random() * (spawnMax - spawnMin);
      x = state.player.position.x + Math.sin(spawnYaw) * dist;
      z = state.player.position.z - Math.cos(spawnYaw) * dist;
      x = clampSpawnCoord(state, x);
      z = clampSpawnCoord(state, z);
      if (Math.hypot(x - state.player.position.x, z - state.player.position.z) < 8) {
        x = state.player.position.x + Math.sin(spawnYaw) * 14;
        z = state.player.position.z - Math.cos(spawnYaw) * 14;
        x = clampSpawnCoord(state, x);
        z = clampSpawnCoord(state, z);
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const probe = new THREE.Vector3(x, 0, z);
        if (canMoveTo(state, probe)) break;
        const nudgeYaw = spawnYaw + (attempt + 1) * 0.55;
        x = clampSpawnCoord(state, state.player.position.x + Math.sin(nudgeYaw) * (14 + attempt));
        z = clampSpawnCoord(state, state.player.position.z - Math.cos(nudgeYaw) * (14 + attempt));
      }
    }

    const groundY = enemy.userData.groundOffset ?? 0;
    enemy.position.set(x, groundY, z);
    enemy.userData.baseY = groundY;
    // Do not gift lastSeenAt at spawn — only mark when actually on-screen so
    // per-attacker fair-damage cannot leak from never-seen / behind hostiles.
    enemy.userData.lastSeenAt = 0;
    state.scene.add(enemy);
    state.enemies.push(enemy);
  }

  function canMoveTo(state: GameState, position: THREE.Vector3) {
    const box = new THREE.Box3().setFromCenterAndSize(position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0.85, 1.9, 0.85));
    return !state.colliders.some((collider) => collider.intersectsBox(box));
  }

  /** Ray vs AABB for cover impacts / blocking shots that hit solid geometry first. */
  function raycastWorldCover(
    state: GameState,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): { point: THREE.Vector3; normal: THREE.Vector3; distance: number; metal: boolean } | null {
    const hit = raycastColliders(state.colliders, origin, dir, maxDist);
    return hit
      ? { point: hit.point, normal: hit.normal, distance: hit.distance, metal: hit.surface !== "dirt" }
      : null;
  }

  function tryMove(state: GameState, from: THREE.Vector3, delta: THREE.Vector3) {
    if (delta.lengthSq() <= 0.000001) {
      return { position: from.clone(), moved: false, stuck: false };
    }
    const full = from.clone().add(delta);
    if (canMoveTo(state, full)) return { position: full, moved: true, stuck: false };

    const xOnly = from.clone().add(new THREE.Vector3(delta.x, 0, 0));
    if (Math.abs(delta.x) > 0.0001 && canMoveTo(state, xOnly)) return { position: xOnly, moved: true, stuck: false };

    const zOnly = from.clone().add(new THREE.Vector3(0, 0, delta.z));
    if (Math.abs(delta.z) > 0.0001 && canMoveTo(state, zOnly)) return { position: zOnly, moved: true, stuck: false };

    const sideLen = delta.length();
    if (sideLen > 0.0001) {
      const side = new THREE.Vector3(-delta.z, 0, delta.x).normalize().multiplyScalar(sideLen);
      const left = from.clone().add(side);
      if (canMoveTo(state, left)) return { position: left, moved: true, stuck: false };
      const right = from.clone().add(side.multiplyScalar(-1));
      if (canMoveTo(state, right)) return { position: right, moved: true, stuck: false };
    }

    return { position: from.clone(), moved: false, stuck: true };
  }

  const _losFrom = new THREE.Vector3();
  const _losTo = new THREE.Vector3();
  const _losDelta = new THREE.Vector3();
  let losCacheFrame = -1;
  const losCache = new Map<string, boolean>();

  function hasLineOfSight(state: GameState, from: THREE.Vector3, to: THREE.Vector3) {
    const frame = state.renderer.info.render.frame;
    if (frame !== losCacheFrame) {
      losCacheFrame = frame;
      losCache.clear();
    }
    const key = `${from.x.toFixed(1)},${from.z.toFixed(1)}>${to.x.toFixed(1)},${to.z.toFixed(1)}`;
    const cached = losCache.get(key);
    if (cached !== undefined) return cached;

    _losFrom.set(from.x, from.y + 1.5, from.z);
    _losTo.set(to.x, to.y + 1.6, to.z);
    _losDelta.copy(_losTo).sub(_losFrom);
    const dist = _losDelta.length();
    if (dist < 0.2) {
      losCache.set(key, true);
      return true;
    }
    _losDelta.multiplyScalar(1 / dist);
    const clear = raycastColliders(state.colliders, _losFrom, _losDelta, Math.max(0, dist - 0.3)) == null;
    losCache.set(key, clear);
    return clear;
  }

  function effectiveFxQuality(state: GameState) {
    const preset = state.xr?.presenting
      ? xrGraphicsConfig().particles
      : graphicsConfig(isTouchDevice() ? "low" : state.settings.graphics).particles;
    return preset * state.quality.getFxScale();
  }

  function flashHitMarker(kind: HitMarkerKind = "hit") {
    setHitMarker(kind);
    gameRef.current?.xr?.reticle.flashHit(kind);
    if (hitMarkerTimerRef.current != null) window.clearTimeout(hitMarkerTimerRef.current);
    const duration = kind === "kill" ? 220 : kind === "armor" ? 120 : 90;
    hitMarkerTimerRef.current = window.setTimeout(() => setHitMarker(null), duration);
  }

  function getDamageBearing(state: GameState, from: THREE.Vector3): DamageBearing {
    const dx = from.x - state.player.position.x;
    const dz = from.z - state.player.position.z;
    if (dx * dx + dz * dz < 0.01) return "front";
    const toEnemy = Math.atan2(dx, -dz);
    let delta = toEnemy - state.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const abs = Math.abs(delta);
    if (abs <= Math.PI * 0.35) return "front";
    if (abs >= Math.PI * 0.72) return "rear";
    return delta > 0 ? "right" : "left";
  }

  function isEnemyOnScreen(state: GameState, enemy: THREE.Group) {
    const aimPoint = new THREE.Vector3(
      enemy.position.x,
      enemy.position.y + 1.55,
      enemy.position.z
    );
    // View-space Z: Three.js camera looks down -Z, so in-front targets have z < 0.
    // Projection alone can false-positive for points behind the camera.
    const viewPos = aimPoint.clone().applyMatrix4(state.camera.matrixWorldInverse);
    if (viewPos.z >= -0.35) return false;
    aimPoint.project(state.camera);
    return aimPoint.z < 1 && Math.abs(aimPoint.x) < 1.05 && Math.abs(aimPoint.y) < 1.15;
  }

  function isEnemyInForwardHemisphere(state: GameState, enemy: THREE.Group) {
    const dx = enemy.position.x - state.player.position.x;
    const dz = enemy.position.z - state.player.position.z;
    if (dx * dx + dz * dz < 0.01) return true;
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const toEnemy = new THREE.Vector3(dx, 0, dz).normalize();
    return forward.dot(toEnemy) >= 0.05;
  }

  function canEnemyDealDamage(state: GameState, enemy: THREE.Group, distance: number) {
    // Strictly per-attacker: eligibility never inherits from other hostiles.
    if (distance > FAIR_DAMAGE_RANGE) return false;
    if (!hasLineOfSight(state, enemy.position, state.player.position)) return false;
    if (isEnemyOnScreen(state, enemy)) return true;
    const lastSeen = enemy.userData.lastSeenAt || 0;
    // lastSeenAt === 0 means never seen (do not treat epoch-0 as "recent").
    const recentlySeen = lastSeen > 0 && performance.now() - lastSeen < ENEMY_SEEN_MEMORY_MS;
    if (recentlySeen) return true;
    // Unseen rear/side shooters may intimidate with tracers but deal no HP.
    if (!isEnemyInForwardHemisphere(state, enemy)) return false;
    return distance <= 9;
  }

  function canEnemyThrowGrenadeType(typeName: string): boolean {
    return typeName === "Heavy" || typeName === "Commander";
  }

  function soloEnemyDamage(amount: number, gameMode: GameMode): number {
    if (gameMode !== "solo" || amount <= 0) return amount;
    return Math.max(1, Math.round(amount * SOLO_ENEMY_DAMAGE_MUL));
  }

  function shouldEnemyThrowGrenade(
    state: GameState,
    enemy: THREE.Group,
    distance: number,
    steerResult: ReturnType<typeof computeEnemySteer>,
    aiNow: number,
  ) {
    if (distance < ENEMY_GRENADE_MIN_RANGE || distance > ENEMY_GRENADE_MAX_RANGE) return false;
    if (aiNow < (enemy.userData.nextGrenadeAt || Number.POSITIVE_INFINITY)) return false;
    if (aiNow < state.enemyGrenadeLockUntil) return false;
    if (state.grenades.some((grenade) => grenade.owner === "enemy")) return false;
    if (!hasLineOfSight(state, enemy.position, state.player.position)) return false;
    if (steerResult.retreating) return false;

    const typeName = String(enemy.userData.enemyType || "");
    if (!canEnemyThrowGrenadeType(typeName)) return false;

    const healthRatio = state.health / Math.max(1, state.maxHealth);
    if (healthRatio <= ENEMY_GRENADE_MIN_PLAYER_HP) return false;
    if (state.combatFx.suppression >= ENEMY_GRENADE_MAX_SUPPRESSION) return false;

    const playerCamped =
      state.crouching
      && state.playerStationarySec >= ENEMY_GRENADE_STATIONARY_SEC;
    if (!playerCamped) return false;

    const inCoverStance =
      steerResult.intent === "cover"
      || steerResult.intent === "hold";
    if (!inCoverStance) return false;

    return Math.random() < ENEMY_GRENADE_THROW_CHANCE;
  }

  function turnEnemyTowardPlayer(enemy: THREE.Group, player: THREE.Vector3, dt: number) {
    const current =
      (enemy.userData.combatFacingQuaternion as THREE.Quaternion | undefined) || enemy.quaternion.clone();
    enemy.lookAt(player.x, enemy.position.y, player.z);
    // Mixamo + procedural soldiers are authored facing local -Z; lookAt aims +Z.
    enemy.rotateY(MIXAMO_LOOKAT_YAW_OFFSET);
    const desired = enemy.quaternion.clone();
    current.slerp(desired, 1 - Math.exp(-dt * 9));
    enemy.userData.combatFacingQuaternion = current;
    enemy.quaternion.copy(current);
    const error = current.angleTo(desired);
    enemy.userData.turnError = error;
    return error;
  }

  function pulseEnemyMuzzleFlash(enemy: THREE.Group) {
    enemy.userData.muzzleFlashUntil = performance.now() + 90;
    // Mesh/sprite flash only — per-enemy PointLights were flooding the light budget.
  }

  function updateEnemyMuzzleFlash(enemy: THREE.Group) {
    // Kept for call-site compatibility; light-based muzzle FX removed for FPS.
    void enemy;
  }

  function requestAimLock(element: HTMLCanvasElement) {
    if (isTouchDevice() || xrPresentingRef.current || gameRef.current?.xr?.presenting) return;
    if (document.pointerLockElement === element) return;
    try {
      const lockResult = element.requestPointerLock?.();
      if (lockResult instanceof Promise) void lockResult.catch(() => undefined);
    } catch {
      // Drag-to-aim remains available when pointer lock is unsupported.
    }
  }

  function freezeMissionTime(state: GameState) {
    if (state.missionStartedAt > 0) {
      state.lastMissionTime = formatMissionTime(state.clock.getElapsed() - state.missionStartedAt);
    }
  }

  function applyMissionEndProgression(state: GameState, won: boolean) {
    const playSec = state.missionStartedAt > 0 ? state.clock.getElapsed() - state.missionStartedAt : 0;
    const prevUnlocks = new Set(progressionRef.current.unlockedAttachments);
    const prevDiffs = new Set(progressionRef.current.unlockedDifficulties);
    const nextStats = recordMissionEnd(progressionRef.current, {
      kills: state.sessionKills,
      score: state.score,
      wave: state.wave,
      won,
      playSec,
      difficulty: state.difficulty,
    });
    const newAttach = nextStats.unlockedAttachments.filter((id) => !prevUnlocks.has(id));
    const newDiff = nextStats.unlockedDifficulties.filter((id) => !prevDiffs.has(id));
    if (newAttach.length || newDiff.length) {
      const parts = [
        ...newAttach.map((id) => ATTACHMENTS[id]?.name || id),
        ...newDiff.map((id) => DIFFICULTY[id]?.label || id),
      ];
      setUnlockToast(`UNLOCKED · ${parts.join(" · ")}`);
      window.setTimeout(() => setUnlockToast(""), 5000);
    }
    setProgression(nextStats);
    setHud((prev) => ({
      ...prev,
      health: won ? prev.health : 0,
      missionTime: state.lastMissionTime || prev.missionTime,
      rank: rankFromXp(nextStats.xp).rank,
      score: state.score,
      wave: state.wave,
    }));
  }

  /** Successful helicopter extract — play land/board/flyaway, then show victory AAR. */
  function completeExtractionVictory(state: GameState) {
    if (state.extractSucceeded) return;
    state.extractSucceeded = true;
    state.extractCinematic = true;
    freezeMissionTime(state);
    state.running = false;
    state.score += state.activeMission?.scoreBonus || 0;
    if (state.extractionHeli) {
      // Ensure bird is visible and begins landing cinematic.
      if (state.extractionHeli.phase === "hidden") {
        startHeliInbound(state.extractionHeli);
        state.extractionHeli.root.position.set(
          state.extractionHeli.lzX,
          state.extractionHeli.hoverY,
          state.extractionHeli.lzZ,
        );
      }
      updateExtractionHelicopter(state.extractionHeli, {
        dt: 0,
        holdProgress: 1,
        readyToBoard: true,
        extracted: true,
        fxScale: state.quality.getFxScale(),
      });
    }
    clearAllEnemies(state);
    state.audio.playRadio(extractSuccessLine(), { channel: "mission" });
    setMissionBanner("BIRD ON THE PAD — Boarding");
    applyMissionEndProgression(state, true);
    if (document.pointerLockElement) document.exitPointerLock();
    // Keep the 3D view alive for the cinematic; AAR opens after flyaway.
    setStarted(true);
  }

  // Expose for Playwright extract cinematic tests.
  if (typeof window !== "undefined" && (window as unknown as { __darkSector?: GameState }).__darkSector) {
    (
      window as unknown as {
        __darkSector: GameState & { completeExtractionVictory?: (s: GameState) => void };
      }
    ).__darkSector.completeExtractionVictory = completeExtractionVictory;
  }

  function finishExtractCinematic(state: GameState) {
    if (!state.extractCinematic) return;
    state.extractCinematic = false;
    setMissionBanner("EXTRACT SUCCESS — Bird outbound");
    setMissionOutcome("extracted");
    setGameOver(true);
    setStarted(false);
  }

  function updateExtractCinematicCamera(state: GameState, dt: number) {
    const heli = state.extractionHeli;
    if (!heli || !state.extractCinematic) return;

    if (heli.phase === "hidden") {
      finishExtractCinematic(state);
      return;
    }

    heli.root.updateMatrixWorld(true);
    if (heli.root.userData.cinematicBanner !== heli.phase) {
      heli.root.userData.cinematicBanner = heli.phase;
      if (heli.phase === "land") setMissionBanner("BIRD DESCENDING — Clear the skids");
      else if (heli.phase === "board") setMissionBanner("BOARDING — Spooling for lift-off");
      else if (heli.phase === "depart") setMissionBanner("EXTRACT SUCCESS — Bird outbound");
    }

    const hx = heli.root.position.x;
    const hy = heli.root.position.y;
    const hz = heli.root.position.z;

    const cabinAnchor =
      heli.body.getObjectByName("Dash")
      || heli.body.getObjectByName("CabinDome")
      || heli.body.getObjectByName("HeliCabinInterior");
    const windAnchor =
      heli.body.getObjectByName("CabinWindshield")
      || heli.body.getObjectByName("Windshield");

    const seatWorld = new THREE.Vector3();
    if (cabinAnchor) {
      cabinAnchor.getWorldPosition(seatWorld);
      if (cabinAnchor.name === "Dash") {
        seatWorld.y += 0.55;
        seatWorld.z -= 1.05;
      } else if (cabinAnchor.name === "CabinDome") {
        seatWorld.y -= 0.65;
        seatWorld.z -= 0.35;
      }
    } else {
      heli.root.localToWorld(seatWorld.copy(HELI_CABIN_CAMERA_OFFSET));
    }

    const lookWorld = new THREE.Vector3();
    if (windAnchor) {
      windAnchor.getWorldPosition(lookWorld);
      lookWorld.y += 0.1;
    } else {
      heli.root.localToWorld(lookWorld.set(0.1, 1.7, 4.2));
    }

    if (heli.phase === "land") {
      const lookFrom = new THREE.Vector3(heli.lzX + 10.5, 2.3, heli.lzZ + 9.5);
      state.camera.position.lerp(lookFrom, Math.min(1, dt * 2.6));
      state.camera.lookAt(hx, hy + 1.0, hz);
    } else if (heli.phase === "board") {
      state.camera.position.lerp(seatWorld, Math.min(1, dt * 7));
      state.camera.lookAt(lookWorld);
    } else if (heli.phase === "depart") {
      state.camera.position.copy(seatWorld);
      lookWorld.y += heli.phaseT * 2.2;
      state.camera.lookAt(lookWorld);
    } else if (heli.phase === "inbound" || heli.phase === "hover") {
      const lookFrom = new THREE.Vector3(heli.lzX + 11, 2.6, heli.lzZ + 10);
      state.camera.position.lerp(lookFrom, Math.min(1, dt * 2));
      state.camera.lookAt(hx, hy + 1.2, hz);
    }
  }

  function weaponAmmoCaps() {
    const loadout = progressionRef.current.loadout;
    return {
      m4: applyAttachmentMods(WEAPONS.m4, loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo,
      smg: applyAttachmentMods(WEAPONS.smg, loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo,
      pistol: applyAttachmentMods(WEAPONS.pistol, loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo,
    };
  }

  function consumeMedkit(state: GameState): boolean {
    if (!canUseMedkit(state.medkits, state.health, state.maxHealth)) return false;
    state.medkits -= 1;
    state.health = applyMedkitHeal(state.health, state.maxHealth);
    state.audio.playReloadComplete();
    return true;
  }

  function collectCompoundPickups(state: GameState, interactPressed: boolean) {
    if (state.gameMode !== "solo" || state.activeSceneId !== "compound" || !state.pickups || !state.running) return;
    const lowPower = isXrPresenting(state.renderer, state.xr) || isTouchDevice();
    const result = updatePickups(state.pickups, {
      playerX: state.player.position.x,
      playerZ: state.player.position.z,
      elapsed: state.clock.getElapsed(),
      interactPressed,
      lowPower,
    });
    state.pickupPrompt = result.prompt;
    if (!result.effects.length) return;
    const caps = weaponAmmoCaps();
    for (const effect of result.effects) {
      const patch = {
        health: state.health,
        maxHealth: state.maxHealth,
        medkits: state.medkits,
        grenadesRemaining: state.grenadesRemaining,
        score: state.score,
        activeWeapon: state.activeWeapon,
        weaponAmmo: state.weaponAmmo,
        ammo: state.ammo,
        maxAmmo: state.maxAmmo,
      };
      const toast = applyPickupEffect(patch, effect.kind, caps);
      state.health = patch.health;
      state.medkits = patch.medkits;
      state.grenadesRemaining = patch.grenadesRemaining;
      state.score = patch.score;
      state.weaponAmmo = patch.weaponAmmo as Record<WeaponId, number>;
      state.ammo = patch.ammo;
      state.maxAmmo = patch.maxAmmo;
      if (toast) {
        setMissionBanner(`${effect.label.toUpperCase()} — ${toast}`);
        window.setTimeout(() => setMissionBanner(""), 2400);
      }
    }
  }

  function damagePlayer(state: GameState, amount: number, from?: THREE.Vector3) {
    if (state.playerDamageCooldown > 0 || !state.running) return;
    if (state.gameMode === "range") return;
    if (state.gameMode === "pvp" && !state.pvpAlive) return;
    state.health -= amount;
    state.playerDamageCooldown = PLAYER_DAMAGE_COOLDOWN;
    state.killStreak = 0;
    if (from) {
      state.lastDamageBearing = getDamageBearing(state, from);
      state.contactUntil = performance.now() + 1600;
      flashHitMarker();
      addDamageShake(state.combatFx, 0.22 + amount * 0.02, state.lastDamageBearing);
      state.audio.playSuppression();
      if (allowRadioCue("contact", 14000)) {
        state.audio.playRadio(contactLine(), { channel: radioChannelForMode(state.gameMode) });
      }
    }
    if (state.health <= 0) {
      state.health = 0;
      if (state.gameMode === "pvp") {
        // Authoritative death comes from the PVP server; keep local soft-lock until then.
        state.pvpAlive = false;
        return;
      }
      freezeMissionTime(state);
      state.running = false;
      applyMissionEndProgression(state, false);
      if (document.pointerLockElement) document.exitPointerLock();
      setMissionOutcome("failed");
      setGameOver(true);
      setStarted(false);
    }
  }

  function applyPvpDamage(state: GameState, amount: number, health: number) {
    if (!state.running || state.gameMode !== "pvp") return;
    state.health = health;
    state.playerDamageCooldown = 0.35;
    state.killStreak = 0;
    if (amount > 0) flashHitMarker();
    if (health <= 0) {
      state.pvpAlive = false;
      state.health = 0;
    }
  }

  function animateSoldier(group: THREE.Group, dt: number, moving: boolean, gaitRate = 1, kneelBlend = 0) {
    group.userData.actionLock = Math.max(0, (group.userData.actionLock || 0) - dt);

    if (group.userData.modelType === "mixamo-glb" || group.userData.modelType === "fbx-mixamo") return;

    const rate = THREE.MathUtils.clamp(gaitRate, 0.7, 1.65);
    const k = THREE.MathUtils.clamp(kneelBlend, 0, 1);
    const plantMoving = moving && k < 0.35;
    group.userData.walkTime = (group.userData.walkTime || 0) + dt * (plantMoving ? 7.5 * rate : 2.2);
    const t = group.userData.walkTime;
    const limbs = group.userData.limbs;
    if (!limbs) return;

    const walk = Math.sin(t);
    const walkOpp = Math.sin(t + Math.PI);
    const bob = plantMoving ? Math.abs(Math.sin(t)) * 0.09 : Math.sin(t * 0.65) * 0.012;
    const shootKick = Math.max(0, group.userData.shootRecoil || 0);
    group.userData.shootRecoil = Math.max(0, shootKick - dt * 1.9);
    const sway = plantMoving ? Math.sin(t * 0.5) * 0.035 : Math.sin(t * 0.35) * 0.01;

    // Standing locomotion
    const standLLegX = walk * (plantMoving ? 0.82 : 0.04);
    const standRLegX = walkOpp * (plantMoving ? 0.82 : 0.04);
    const standLLegZ = Math.cos(t) * (plantMoving ? 0.08 : 0.01);
    const standRLegZ = -Math.cos(t) * (plantMoving ? 0.08 : 0.01);
    const standLArmX = walkOpp * (plantMoving ? 0.45 : 0.035) - 0.14;
    const standRArmX = walk * (plantMoving ? 0.38 : 0.035) - 0.12;
    const standLArmZ = -0.25 + Math.cos(t) * (plantMoving ? 0.08 : 0.02);
    const standRArmZ = 0.25 - Math.cos(t) * (plantMoving ? 0.06 : 0.02);
    const standTorsoY = 1.55 + bob;
    const standHipsY = 0.95 + bob * 0.75;
    const standTorsoX = plantMoving ? -0.12 : Math.sin(t * 0.5) * 0.015;
    const standHeadY = 2.23 + bob * 0.45;
    const standRifleY = 1.52 + bob * 0.8;
    const standRifleZ = -0.47;

    // Asymmetric kneel-fire: front foot planted, rear knee down, torso upright to aim.
    const kneelLLegX = 0.95;
    const kneelRLegX = 1.55;
    const kneelLLegZ = -0.08;
    const kneelRLegZ = 0.12;
    const kneelLArmX = -0.55;
    const kneelRArmX = -0.72;
    const kneelLArmZ = -0.32;
    const kneelRArmZ = 0.28;
    const kneelTorsoY = 1.12;
    const kneelHipsY = 0.52;
    const kneelTorsoX = 0.06;
    const kneelHeadY = 1.78;
    const kneelRifleY = 1.18;
    const kneelRifleZ = -0.42;

    limbs.lLeg.rotation.x = THREE.MathUtils.lerp(standLLegX, kneelLLegX, k);
    limbs.rLeg.rotation.x = THREE.MathUtils.lerp(standRLegX, kneelRLegX, k);
    limbs.lLeg.rotation.z = THREE.MathUtils.lerp(standLLegZ, kneelLLegZ, k);
    limbs.rLeg.rotation.z = THREE.MathUtils.lerp(standRLegZ, kneelRLegZ, k);

    limbs.lArm.rotation.x = THREE.MathUtils.lerp(standLArmX, kneelLArmX, k);
    limbs.rArm.rotation.x = THREE.MathUtils.lerp(standRArmX, kneelRArmX, k);
    limbs.lArm.rotation.z = THREE.MathUtils.lerp(standLArmZ, kneelLArmZ, k);
    limbs.rArm.rotation.z = THREE.MathUtils.lerp(standRArmZ, kneelRArmZ, k);

    limbs.torso.position.y = THREE.MathUtils.lerp(standTorsoY, kneelTorsoY, k);
    limbs.hips.position.y = THREE.MathUtils.lerp(standHipsY, kneelHipsY, k);
    limbs.torso.rotation.x = THREE.MathUtils.lerp(standTorsoX, kneelTorsoX, k);
    limbs.torso.rotation.z = sway * (1 - k * 0.85);
    limbs.head.position.y = THREE.MathUtils.lerp(standHeadY, kneelHeadY, k);
    limbs.head.rotation.y = Math.sin(t * 0.45) * (plantMoving ? 0.03 : 0.012) * (1 - k);
    limbs.head.rotation.x = plantMoving ? 0.035 * (1 - k) : 0;

    limbs.rifle.position.y = THREE.MathUtils.lerp(standRifleY, kneelRifleY, k);
    limbs.rifle.rotation.z = Math.sin(t) * (plantMoving ? 0.025 : 0.008) * (1 - k);
    limbs.rifle.rotation.x = -0.02 + Math.cos(t * 0.8) * (plantMoving ? 0.018 : 0.006) * (1 - k) - shootKick * 0.55;
    limbs.rifle.position.z = THREE.MathUtils.lerp(standRifleZ, kneelRifleZ, k) + shootKick * 0.22;
    limbs.rArm.rotation.x -= shootKick * 0.9;
    limbs.lArm.rotation.x -= shootKick * 0.55;
    limbs.torso.rotation.x -= shootKick * 0.18;

    group.position.y = group.userData.baseY + bob * 0.2 * (1 - k) - k * 0.28;
  }

  function triggerSoldierShootAnimation(state: GameState, soldier: THREE.Group) {
    if (soldier.userData.modelType === "fbx-mixamo" || soldier.userData.modelType === "mixamo-glb") {
      const clips = [...Object.values(state.fbxClips), ...state.enemyAnimations];
      if (soldier.userData.mixer) {
        playOrSwitch(soldier.userData.mixer as THREE.AnimationMixer, soldier, clips, "fire", {
          force: true,
          loop: false,
          fade: 0.04,
        });
      } else {
        switchEnemyAnimation(state, soldier, ["shoot", "fire", "attack"], true);
        soldier.userData.actionLock = SHOOT_ANIMATION_LOCK_SECONDS;
      }
    } else {
      soldier.userData.shootRecoil = 0.18;
    }
  }

  function shoot(state: GameState, shotPose?: ShotPose | null) {
    if (state.fireCooldown > 0 || state.reload > 0 || !state.running) return;
    if (state.gameMode === "pvp" && !state.pvpAlive) return;
    const weapon = WEAPONS[state.activeWeapon];
    const loadoutAttachments = progressionRef.current.loadout.find((l) => l.weapon === state.activeWeapon)?.attachments || [];
    const mods = applyAttachmentMods(weapon, loadoutAttachments);
    const infiniteAmmo = state.gameMode === "range";
    if (state.ammo <= 0) {
      state.audio.playEmpty();
      beginReload(state);
      return;
    }
    if (!infiniteAmmo) {
      state.ammo -= 1;
      state.weaponAmmo[state.activeWeapon] = state.ammo;
    }
    state.fireCooldown = mods.fireInterval;
    const kick = weaponRecoilKick(state.activeWeapon, mods.recoil, state.adsBlend);
    state.recoil = Math.min(0.28, state.recoil + kick.pitch);
    state.recoilYaw = THREE.MathUtils.clamp(state.recoilYaw + kick.yaw, -0.06, 0.06);
    if (!state.xr?.presenting) {
      addRecoilShake(state.combatFx, kick.shake);
      state.combatFx.cameraPunch.x += kick.yaw * 1.4;
      state.viewmodelPoses[state.activeWeapon].recoilKick = Math.min(
        0.35,
        state.viewmodelPoses[state.activeWeapon].recoilKick + kick.pitch * 2.4
      );
    }
    state.audio.playWeaponFire(state.activeWeapon);
    if (!infiniteAmmo && state.ammo <= 0) beginReload(state);
    if (!isXrPresenting(state.renderer, state.xr)) {
      state.camera.updateMatrixWorld(true);
    }

    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    if (shotPose) {
      origin.copy(shotPose.origin);
      dir.copy(shotPose.direction);
      right.copy(shotPose.right);
      up.copy(shotPose.up);
    } else {
      state.camera.getWorldPosition(origin);
      dir.set(0, 0, -1).applyQuaternion(state.camera.quaternion).normalize();
      right.set(1, 0, 0).applyQuaternion(state.camera.quaternion).normalize();
      up.set(0, 1, 0).applyQuaternion(state.camera.quaternion).normalize();
    }
    const adsSpreadMultiplier = THREE.MathUtils.lerp(1, 0.48, state.adsBlend);
    const accuracyMultiplier = Math.max(0.65, 1 - mods.accuracyBonus);
    const keys = keysRef.current;
    const moving =
      Boolean(keys.w || keys.a || keys.s || keys.d || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight);
    const sprinting = moving && Boolean(keys.shift);
    const moveSpread = sprinting ? 0.0042 : moving ? 0.002 : 0;
    const spread =
      (weapon.baseSpread + weapon.sustainedSpread * state.fireHeat + moveSpread) *
      adsSpreadMultiplier *
      accuracyMultiplier;
    dir
      .addScaledVector(right, (Math.random() - 0.5) * 2 * spread)
      .addScaledVector(up, (Math.random() - 0.5) * 2 * spread)
      .normalize();
    state.fireHeat = weapon.automatic ? Math.min(1, state.fireHeat + 0.16) : 0;
    const fxQuality = effectiveFxQuality(state);
    if (!isXrPresenting(state.renderer, state.xr)) {
      spawnShellCasing(
        state.combatFx,
        origin.clone().add(right.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, -0.15, 0)),
        right,
        fxQuality,
      );
      state.audio.playShellCasing();
    }

    if (state.gameMode === "range" && state.shootingRange) {
      const rangeHit = state.shootingRange.tryHit(origin, dir);
      if (rangeHit) {
        spawnBulletImpact(state.combatFx, rangeHit.point, dir.clone().multiplyScalar(-1), "metal", fxQuality);
        state.audio.playImpact("metal");
        flashHitMarker("hit");
        state.audio.playHitConfirm();
        state.score = state.shootingRange.stats.score;
        state.killStreak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.killStreak);
      } else {
        state.shootingRange.registerMiss();
        const impactPoint = origin.clone().add(dir.clone().multiplyScalar(28));
        impactPoint.y = Math.max(0.05, impactPoint.y - 0.2);
        spawnBulletImpact(state.combatFx, impactPoint, new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? "metal" : "dirt", fxQuality);
        state.audio.playImpact(Math.random() < 0.5 ? "metal" : "dirt");
        if (Math.random() < 0.2) state.audio.playRicochet();
        state.killStreak = 0;
      }
      const muzzle = origin.clone().add(dir.clone().multiplyScalar(0.35));
      spawnMuzzleBlast(state.combatFx, muzzle, dir, fxQuality, { color: 0xffc878 });
      const bullet = spawnTracer({
        origin: origin.clone().add(dir.clone().multiplyScalar(1.4)),
        direction: dir,
        speed: 55,
        life: 0.35,
        color: rangeHit ? 0xff6a3a : 0xffe6a8,
        quality: fxQuality,
      });
      state.scene.add(bullet);
      state.bullets.push(bullet);
      return;
    }

    let closestHit: { enemy: THREE.Group; distance: number; remoteId?: string; point: THREE.Vector3 } | null = null;
    const coverHit = state.gameMode === "solo" ? raycastWorldCover(state, origin, dir, 90) : null;
    if (state.gameMode === "solo") suppressEnemiesNearShot(state.enemies, origin, dir, 90);

    if (state.gameMode === "solo") {
      for (const enemy of state.enemies) {
        if (!enemy.userData.alive) continue;
        const target = enemy.position.clone().add(new THREE.Vector3(0, 1.7 * enemy.scale.y, 0));
        const toTarget = target.clone().sub(origin);
        const distanceAlongShot = toTarget.dot(dir);
        if (distanceAlongShot <= 0 || distanceAlongShot > 90) continue;
        if (coverHit && coverHit.distance < distanceAlongShot - 0.15) continue;
        const closestPoint = origin.clone().add(dir.clone().multiplyScalar(distanceAlongShot));
        const hitRadius = (enemy.userData.enemyType === "Heavy" || enemy.userData.enemyType === "Commander" ? 1.55 : 1.35) * enemy.scale.x;
        if (closestPoint.distanceTo(target) <= hitRadius && (!closestHit || distanceAlongShot < closestHit.distance)) {
          closestHit = { enemy, distance: distanceAlongShot, point: closestPoint };
        }
      }
    } else {
      for (const [remoteId, avatar] of state.remotePlayers) {
        if (!avatar.userData.alive || !avatar.visible) continue;
        const height = Math.max(1.5, 1.7 * Math.min(avatar.scale.y, 1.4));
        const target = avatar.position.clone().add(new THREE.Vector3(0, height, 0));
        const toTarget = target.clone().sub(origin);
        const distanceAlongShot = toTarget.dot(dir);
        if (distanceAlongShot <= 0 || distanceAlongShot > 90) continue;
        const closestPoint = origin.clone().add(dir.clone().multiplyScalar(distanceAlongShot));
        const hitRadius = 1.4;
        if (closestPoint.distanceTo(target) <= hitRadius && (!closestHit || distanceAlongShot < closestHit.distance)) {
          closestHit = { enemy: avatar, distance: distanceAlongShot, remoteId, point: closestPoint };
        }
      }
    }

    if (closestHit) {
      const enemy = closestHit.enemy;
      const isArmored =
        enemy.userData.enemyType === "Heavy" || enemy.userData.enemyType === "Commander";
      spawnBulletImpact(state.combatFx, closestHit.point, dir.clone().multiplyScalar(-1), "flesh", fxQuality);
      applyHitReact(enemy, 0.22);
      if (closestHit.remoteId) {
        pvpClientRef.current?.sendHit(closestHit.remoteId, mods.damage);
        enemy.userData.hitReact = 0.18;
        flashHitMarker("hit");
        state.audio.playGoreImpact("hit");
        state.audio.playHitConfirm();
        applyEnemyBloodFlash(enemy, "hit");
      } else {
        const damage = damageAtRange(mods.damage, closestHit.distance, isArmored);
        const willKill = enemy.userData.health - damage <= 0;
        enemy.userData.health -= damage;
        enemy.userData.hitReact = 0.18;
        state.audio.playGoreImpact(willKill ? "kill" : "hit");
        applyEnemyBloodFlash(enemy, willKill ? "kill" : "hit");
        if (willKill) {
          flashHitMarker("kill");
          state.audio.playKillConfirm();
        } else if (isArmored) {
          flashHitMarker("armor");
          state.audio.playArmorHit();
        } else {
          flashHitMarker("hit");
          state.audio.playHitConfirm();
        }
        // Trigger hit / death animation when clips exist
        if (enemy.userData.mixer && enemy.userData.health > 0) {
          const clips = [...Object.values(state.fbxClips), ...state.enemyAnimations];
          playOrSwitch(enemy.userData.mixer as THREE.AnimationMixer, enemy, clips, "hit", { force: true, loop: false });
        }
        if (enemy.userData.health <= 0) {
          spawnFleshDeathGore(state.combatFx, closestHit.point, dir, fxQuality);
          spawnGroundBloodPool(
            state.combatFx,
            enemy.position.clone().setY(0.02),
            1.1,
            fxQuality,
          );
          enemy.userData.alive = false;
          enemy.userData.dying = true;
          enemy.userData.deathT = 0;
          state.sessionKills += 1;
          if (enemy.userData.mixer) {
            const clips = [...Object.values(state.fbxClips), ...state.enemyAnimations];
            playOrSwitch(enemy.userData.mixer as THREE.AnimationMixer, enemy, clips, "death", { force: true, loop: false, fade: 0.05 });
          }
          state.dyingEnemies.push(enemy);
          state.score += enemy.userData.scoreValue || 100;
          state.killStreak += 1;
          state.bestStreak = Math.max(state.bestStreak, state.killStreak);
          if (state.gameMode === "solo" && allowRadioCue("killConfirm", 12000)) {
            state.audio.playRadio(killConfirmLine(), { channel: "mission" });
          }
          // Fake grenade threat reaction for nearby AI when a heavy dies
          if (enemy.userData.enemyType === "Heavy" || enemy.userData.enemyType === "Commander") {
            signalGrenadeThreat(state.enemies, enemy.position.x, enemy.position.z, 12);
            spawnDestructionBurst(state.scene, enemy.position.x, enemy.position.z, state.atmosphere);
            state.audio.playExplosion(8);
          }
        }
      }
    } else {
      // World impact — prefer real cover surfaces for dust / metal debris.
      const world = coverHit ?? raycastWorldCover(state, origin, dir, 55);
      if (world) {
        state.destruction.damageAt(world.point, mods.damage);
        spawnBulletImpact(state.combatFx, world.point, world.normal, world.metal ? "metal" : "dirt", fxQuality);
        state.audio.playImpact(world.metal ? "metal" : "dirt");
        if (world.metal || Math.random() < 0.3) state.audio.playRicochet();
      } else {
        const impactPoint = origin.clone().add(dir.clone().multiplyScalar(22));
        impactPoint.y = Math.max(0.05, impactPoint.y - 0.4);
        spawnBulletImpact(state.combatFx, impactPoint, new THREE.Vector3(0, 1, 0), Math.random() < 0.35 ? "metal" : "dirt", fxQuality);
        state.audio.playImpact(Math.random() < 0.35 ? "metal" : "dirt");
        if (Math.random() < 0.25) state.audio.playRicochet();
      }
    }

    const bullet = spawnTracer({
      origin: origin.clone().add(dir.clone().multiplyScalar(1.4)),
      direction: dir,
      speed: 55,
      life: 0.35,
      color: closestHit ? 0xff6a3a : 0xffe6a8,
      quality: fxQuality,
    });
    state.scene.add(bullet);
    state.bullets.push(bullet);

    const muzzle = origin.clone().add(dir.clone().multiplyScalar(0.35));
    const muzzleQuality = fxQuality * THREE.MathUtils.lerp(1, 0.72, state.adsBlend);
    spawnMuzzleBlast(state.combatFx, muzzle, dir, muzzleQuality, { color: 0xffc878 });
  }

  function throwPlayerGrenade(state: GameState, shotPose?: ShotPose | null) {
    if (!state.running || state.gameMode !== "solo" || state.grenadesRemaining <= 0) return false;
    if (!isXrPresenting(state.renderer, state.xr)) {
      state.camera.updateMatrixWorld(true);
    }
    const origin = shotPose?.origin.clone() ?? state.camera.getWorldPosition(new THREE.Vector3());
    const direction = shotPose?.direction.clone()
      ?? new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion).normalize();
    origin.addScaledVector(direction, 0.45);
    const velocity = direction.multiplyScalar(12).add(new THREE.Vector3(0, 4.2, 0));
    state.grenades.push(createGrenade(state.scene, origin, velocity, "player"));
    state.grenadesRemaining -= 1;
    signalGrenadeThreat(state.enemies, origin.x + velocity.x, origin.z + velocity.z, 12);
    return true;
  }

  function throwEnemyGrenade(state: GameState, enemy: THREE.Group) {
    const origin = getEnemyMuzzleWorldPos(enemy).add(new THREE.Vector3(0, 0.25, 0));
    const target = state.player.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    const direction = target.sub(origin).normalize();
    state.grenades.push(createGrenade(
      state.scene,
      origin,
      direction.multiplyScalar(9.5).add(new THREE.Vector3(0, 5.4, 0)),
      "enemy",
    ));
    enemy.userData.nextGrenadeAt = performance.now() / 1000 + 80 + Math.random() * 40;
    state.enemyGrenadeLockUntil = performance.now() / 1000 + ENEMY_GRENADE_GLOBAL_COOLDOWN + Math.random() * 18;
  }

  function explodeGrenade(state: GameState, grenade: GrenadeProjectile) {
    const point = grenade.mesh.position.clone();
    state.scene.remove(grenade.mesh);
    spawnDestructionBurst(state.scene, point.x, point.z, state.atmosphere);
    state.audio.playExplosion(point.distanceTo(state.player.position));
    state.destruction.damageAt(point, 120, grenade.radius);

    if (grenade.owner === "player") {
      for (const enemy of state.enemies) {
        if (!enemy.userData.alive) continue;
        const distance = enemy.position.distanceTo(point);
        if (distance > grenade.radius || !hasLineOfSight(state, point, enemy.position)) continue;
        enemy.userData.health -= Math.round(120 * (1 - distance / grenade.radius));
        enemy.userData.suppression = 1;
        if (enemy.userData.health <= 0) {
          enemy.userData.alive = false;
          enemy.userData.dying = true;
          enemy.userData.deathT = 0;
          const gorePoint = enemy.position.clone().add(new THREE.Vector3(0, 0.9, 0));
          spawnFleshDeathGore(state.combatFx, gorePoint, new THREE.Vector3(0, -0.4, 0), effectiveFxQuality(state));
          spawnGroundBloodPool(state.combatFx, enemy.position.clone().setY(0.02), 1.2, effectiveFxQuality(state));
          state.dyingEnemies.push(enemy);
          state.score += enemy.userData.scoreValue || 100;
          state.sessionKills += 1;
          state.audio.playGoreImpact("kill");
          applyEnemyBloodFlash(enemy, "kill");
        }
      }
    } else {
      const distance = state.player.position.distanceTo(point);
      if (distance <= grenade.radius && hasLineOfSight(state, point, state.player.position)) {
        const raw = Math.round(40 * (1 - distance / grenade.radius));
        damagePlayer(state, soloEnemyDamage(raw, state.gameMode), point);
      }
    }
  }

  function syncMissionMarkers(state: GameState) {
    state.missionMarkers.forEach((m) => state.scene.remove(m));
    state.missionMarkers = [];
    const mission = state.activeMission;
    if (!mission || mission.type === "waves") return;
    for (const marker of mission.markers) {
      const g = new THREE.Group();
      const isExtract = marker.kind === "extract" || mission.type === "extraction";
      const color = isExtract ? 0xf59e0b : 0xfbbf24;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(marker.radius * 0.82, marker.radius, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: isExtract ? 0.55 : 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      if (isExtract) {
        const inner = new THREE.Mesh(
          new THREE.RingGeometry(marker.radius * 0.35, marker.radius * 0.42, 32),
          new THREE.MeshBasicMaterial({
            color: 0xfde68a,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        inner.rotation.x = -Math.PI / 2;
        inner.position.y = 0.02;
        g.add(inner);
      }
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, isExtract ? 3.2 : 2.4, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isExtract ? 0.7 : 0.55 })
      );
      beacon.position.y = isExtract ? 1.6 : 1.2;
      g.add(beacon);
      g.position.set(marker.x, 0.05, marker.z);
      g.userData.markerId = marker.id;
      g.userData.extractRing = isExtract;
      state.scene.add(g);
      state.missionMarkers.push(g);
    }
  }

  function beginWaveContent(state: GameState) {
    state.coverPoints = buildCoverPointsFromColliders(state.colliders);
    const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
    const count = waveEnemyTarget(state.wave, diff.enemyCountMul);
    const typePool = [...ENEMY_TYPES];
    for (let i = typePool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [typePool[i], typePool[j]] = [typePool[j], typePool[i]];
    }
    for (let i = 0; i < count; i += 1) {
      try {
        spawnEnemy(state, typePool[i % typePool.length]);
      } catch (err) {
        console.warn("[BDS] spawnEnemy failed", err);
      }
    }
    state.squads = assignSquads(state.enemies);
    state.activeMission = pickMissionForWave(state.wave, state.activeSceneId);
    state.extractAnnouncedPhase = -1;
    state.extractReinforceAt = state.clock.getElapsed() + 8;
    if (state.extractionHeli) resetExtractionHelicopter(state.extractionHeli);
    syncMissionMarkers(state);
    if (state.activeMission.type === "extraction") {
      state.audio.playRadio(extractInboundLine(), { channel: "mission" });
      setMissionBanner("EXTRACT AUTHORIZED — Reach the amber LZ and hold for the bird");
      window.setTimeout(() => setMissionBanner(""), 5200);
    } else if (state.activeMission.type !== "waves") {
      state.audio.playRadio(missionBriefLine(state.activeMission.title, state.activeMission.briefing), {
        channel: "mission",
      });
    }
  }

  function updateGame(state: GameState, dt: number) {
    const keys = keysRef.current;
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.recoil = Math.max(0, state.recoil - dt * 0.5);
    state.recoilYaw = THREE.MathUtils.damp(state.recoilYaw, 0, 14, dt);
    state.playerDamageCooldown = Math.max(0, state.playerDamageCooldown - dt);
    state.enemyVolleyCooldown = Math.max(0, state.enemyVolleyCooldown - dt);
    const playerDelta = Math.hypot(
      state.player.position.x - state.lastPlayerX,
      state.player.position.z - state.lastPlayerZ,
    );
    if (playerDelta < 0.04) {
      state.playerStationarySec += dt;
    } else {
      state.playerStationarySec = 0;
    }
    state.lastPlayerX = state.player.position.x;
    state.lastPlayerZ = state.player.position.z;
    if (state.reload > 0) {
      state.reload -= dt;
      if (state.reload <= 0) {
        state.reload = 0;
        state.ammo = state.maxAmmo;
        state.weaponAmmo[state.activeWeapon] = state.ammo;
        state.audio.playReloadComplete();
      }
    }

    const canControl = state.gameMode === "solo" || state.gameMode === "range" || state.pvpAlive;
    const xr = state.xr;
    // Prefer renderer flag too — never let desktop pose writes run during immersive frames.
    const inXr = isXrPresenting(state.renderer, xr);

    if (canControl && inXr && xr) {
      const frame = xr.input.poll(state.settings.snapTurnDegrees);
      const selectEdge = frame.fire && !xr.selectWasDown;
      xr.selectWasDown = frame.fire;

      if (frame.menu) {
        if (xr.menu.isOpen()) {
          xr.menu.hide();
          if (state.running) xr.hud.setVisible(true);
        } else if (state.running) {
          xr.hud.setVisible(false);
          xr.menu.showPause();
        } else xr.menu.showMain();
      }

      if (frame.snapRadians !== 0) {
        xr.rig.snapTurn(frame.snapRadians);
      }
      state.yaw = xr.rig.getYaw();

      xr.menu.updatePose(state.player.position, state.yaw);
      if (xr.menu.isOpen()) {
        xr.menu.updateInteraction(xr.input.getUiRayTarget(), frame.fire, selectEdge);
        xr.reticle.setVisible(false);
        xr.rig.setFloorPosition(state.player.position.x, state.player.position.y, state.player.position.z);
        updateComfortVignette(xr, false, state.settings.comfortVignette, dt);
        state.triggerLatched = frame.fire;
      } else if (state.running) {
        // Attach when missing OR when the resolved weapon grip changes (Quest often
        // reports handedness late — first attach can land on the wrong controller).
        const grip = xr.input.getWeaponGrip();
        const needsAttach =
          Boolean(grip) &&
          (!xr.weaponsOnGrip || state.weaponViews[state.activeWeapon].parent !== grip);
        if (needsAttach) attachWeaponsToGrip(xr, state.weaponViews, state.activeWeapon);
        xr.hud.setVisible(true);
        xr.input.setRaysVisible(false);

        state.crouching = frame.crouch;
        state.adsHeld = frame.ads;
        const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
        const move = new THREE.Vector3();
        move.addScaledVector(forward, frame.moveY);
        move.addScaledVector(right, frame.moveX);
        const moving = move.lengthSq() > 0;
        if (move.lengthSq() > 1) move.normalize();
        const sprinting = frame.sprint && !state.crouching;
        const aiming = state.adsHeld && !sprinting;
        state.adsBlend = THREE.MathUtils.damp(state.adsBlend, aiming ? 1 : 0, 13, dt);
        const baseSpeed = Math.min(6, Math.max(3.5, state.settings.xrMoveSpeed));
        const speed = state.crouching ? baseSpeed * 0.55 : sprinting ? baseSpeed * 1.35 : baseSpeed;
        const desired = move.multiplyScalar(speed * dt);
        const moved = tryMove(state, state.player.position, desired);
        state.player.position.copy(moved.position);
        // Floor origin only — never copy headset pose onto the rig (that head-locks the world).
        xr.rig.setFloorPosition(state.player.position.x, state.player.position.y, state.player.position.z);
        updateComfortVignette(xr, moving, state.settings.comfortVignette && !state.settings.reduceMotion, dt);

        if (moving) {
          state.footstepAccum += dt * (sprinting ? 2.4 : state.crouching ? 1.1 : 1.7);
          if (state.footstepAccum >= 1) {
            state.footstepAccum = 0;
            state.audio.playFootstep(surfaceAtPosition(state.player.position.x, state.player.position.z));
          }
        }

        state.player.rotation.y = state.yaw + Math.PI;
        // Headset owns camera pose — do not write position/rotation/shake or force matrix updates.

        const triggerDown = frame.fire;
        state.fireHeat = Math.max(0, state.fireHeat - dt * (triggerDown ? 0.08 : 1.8));
        const weaponConfig = WEAPONS[state.activeWeapon];
        const pose = xr.input.getShotPose();
        // Match the website crosshair visually, but keep it weapon-aimed in VR.
        xr.reticle.update(pose, !aiming);
        if (weaponConfig.automatic) {
          if (triggerDown) shoot(state, pose);
        } else if (triggerDown && !state.triggerLatched) {
          shoot(state, pose);
        }
        state.triggerLatched = triggerDown;

        if (frame.reload) beginReload(state);
        if (frame.interact) state.interactPulse = true;
        if (frame.swap) switchWeapon(state, nextWeapon(state.activeWeapon));
        if (frame.throwGrenade) throwPlayerGrenade(state, pose);
        if (frame.medkit) consumeMedkit(state);
        collectCompoundPickups(state, frame.interact);
        xr.hud.updatePose(state.player.position, state.yaw);
      } else {
        xr.reticle.setVisible(false);
        xr.rig.setFloorPosition(state.player.position.x, state.player.position.y, state.player.position.z);
      }
    } else if (canControl) {
      if (keys.ArrowLeft) state.yaw += dt * 1.9;
      if (keys.ArrowRight) state.yaw -= dt * 1.9;
      if (keys.ArrowUp) state.pitch += dt * 1.1 * (state.settings.invertY ? -1 : 1);
      if (keys.ArrowDown) state.pitch -= dt * 1.1 * (state.settings.invertY ? -1 : 1);
      state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.45);

      state.crouching = Boolean(keys.c || keys.Control || mobileInputRef.current.crouching);
      const eyeHeight = state.crouching ? 1.35 : 1.95;

      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
      const move = new THREE.Vector3();
      if (keys.w) move.add(forward);
      if (keys.s) move.sub(forward);
      if (keys.d) move.add(right);
      if (keys.a) move.sub(right);
      if (Math.abs(mobileInputRef.current.moveY) > 0.001) {
        move.addScaledVector(forward, -mobileInputRef.current.moveY);
      }
      if (Math.abs(mobileInputRef.current.moveX) > 0.001) {
        move.addScaledVector(right, mobileInputRef.current.moveX);
      }
      const moving = move.lengthSq() > 0;
      if (move.lengthSq() > 1) move.normalize();
      const sprinting = Boolean(keys.shift) && !state.crouching;
      const aiming = state.adsHeld && !sprinting;
      state.adsBlend = THREE.MathUtils.damp(state.adsBlend, aiming ? 1 : 0, 13, dt);
      const targetFov = aiming ? adsFov(state.settings.fov, state.activeWeapon) : state.settings.fov;
      const nextFov = THREE.MathUtils.damp(state.camera.fov, targetFov, 11, dt);
      if (Math.abs(nextFov - state.camera.fov) > 0.001) {
        state.camera.fov = nextFov;
        state.camera.updateProjectionMatrix();
      }
      const speed = state.crouching ? 2.6 : sprinting ? 8.2 : 5.2;
      const desired = move.multiplyScalar(speed * dt);
      const moved = tryMove(state, state.player.position, desired);
      state.player.position.copy(moved.position);

      if (moving) {
        state.footstepAccum += dt * (sprinting ? 2.4 : state.crouching ? 1.1 : 1.7);
        if (state.footstepAccum >= 1) {
          state.footstepAccum = 0;
          state.audio.playFootstep(surfaceAtPosition(state.player.position.x, state.player.position.z));
        }
      }

      state.player.rotation.y = state.yaw + Math.PI;
      state.camera.position.copy(state.player.position).add(new THREE.Vector3(0, eyeHeight, 0));
      applyCameraShake(
        state.camera,
        state.combatFx,
        state.pitch - state.recoil,
        state.yaw + state.recoilYaw,
        dt,
        state.settings.reduceMotion
      );
      state.camera.updateMatrixWorld(true);

      updateViewmodel(state.weapon, state.viewmodelPoses[state.activeWeapon], dt, {
        moving,
        sprinting,
        reloading: state.reload > 0,
        crouching: state.crouching,
        aiming,
        weapon: state.activeWeapon,
      });

      // Sticky Space pulse: survives keyup-before-frame and retries if fireCooldown blocks.
      const spacePulse = Boolean(keys.__spacePulse);
      const triggerDown = Boolean(keys[" "] || mouseRef.current.firing);
      state.fireHeat = Math.max(0, state.fireHeat - dt * (triggerDown ? 0.08 : 1.8));
      const weaponConfig = WEAPONS[state.activeWeapon];
      if (weaponConfig.automatic) {
        if (triggerDown || spacePulse) shoot(state);
        keys.__spacePulse = false;
      } else if (spacePulse || (triggerDown && !state.triggerLatched)) {
        const ammoBefore = state.ammo;
        const reloadBefore = state.reload;
        const cdBefore = state.fireCooldown;
        shoot(state);
        const accepted = state.ammo < ammoBefore || state.reload !== reloadBefore || state.fireCooldown > cdBefore;
        if (spacePulse && (accepted || (state.ammo <= 0 && state.reload <= 0 && state.fireCooldown <= 0))) {
          keys.__spacePulse = false;
        }
      }
      state.triggerLatched = triggerDown;
      if (keys.r) beginReload(state);
      if (keys.e && !keys.__interactHeld) {
        state.interactPulse = true;
        keys.__interactHeld = true;
      }
      if (!keys.e) keys.__interactHeld = false;
      if (!keys.f) {
        keys.__medkitHeld = false;
      } else if (!keys.__medkitHeld) {
        consumeMedkit(state);
        keys.__medkitHeld = true;
      }
      collectCompoundPickups(state, Boolean(keys.e && keys.__interactHeld));
    } else {
      if (!inXr) {
        state.camera.position.copy(state.player.position).add(new THREE.Vector3(0, 1.95, 0));
        state.camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
      }
      state.triggerLatched = false;
    }

    if (inXr && xr) {
      xr.hud.update({
        health: state.health,
        maxHealth: state.maxHealth,
        ammo: state.reload > 0 ? "…" : state.ammo,
        weapon: WEAPONS[state.activeWeapon].name,
        score: state.score,
        wave: state.wave,
        objective: state.activeMission
          ? missionHudText(state.activeMission).objective
          : state.gameMode === "range"
            ? "Range bay live"
            : "Hold the compound",
        contact: state.contactUntil > performance.now() ? String(state.lastDamageBearing || "").toUpperCase() : "",
        mode: state.gameMode,
        missionTitle: state.activeMission?.title || "",
        rangeHits: state.shootingRange?.stats.hits ?? 0,
        rangeAccuracy: state.shootingRange
          ? Math.round(
              (state.shootingRange.stats.hits /
                Math.max(1, state.shootingRange.stats.hits + state.shootingRange.stats.misses)) *
                100
            )
          : 0,
        rangeChallengeActive: Boolean(state.shootingRange?.stats.challengeActive),
        rangeChallengeTime: state.shootingRange?.stats.challengeTimeLeft ?? 0,
        subtitle: "",
        medkits: state.medkits,
        grenades: state.grenadesRemaining,
      });
    }

    const pvpClient = pvpClientRef.current;
    if (state.gameMode === "pvp" && pvpClient) {
      updateRemoteAvatars(state, pvpClient, dt);
      state.pvpSendAccum += dt;
      if (state.pvpSendAccum >= 0.05 && state.pvpAlive) {
        state.pvpSendAccum = 0;
        pvpClient.sendState({
          x: state.player.position.x,
          y: state.player.position.y,
          z: state.player.position.z,
          yaw: state.yaw,
          pitch: state.pitch,
          weapon: state.activeWeapon,
        });
      }
    }

    // Allies disabled until real FBX ally models are added, preventing old procedural characters from appearing.

    if (state.gameMode === "range" && state.shootingRange) {
      state.shootingRange.update(dt);
      // Detect challenge completion (timer or forced end) and surface after-action report.
      const challengeActive = state.shootingRange.stats.challengeActive;
      if (rangeChallengeWasActiveRef.current && !challengeActive) {
        const result = state.shootingRange.stats.lastResult;
        if (result && result.endedAt !== lastRangeResultAtRef.current) {
          lastRangeResultAtRef.current = result.endedAt;
          setRangeResult(result);
          if (result.newlyUnlocked.length) {
            const awarded = awardRangeBadgeXp(loadProgression(), result.newlyUnlocked, RANGE_BADGE_XP);
            if (awarded.xpGained > 0) {
              setProgression(awarded.stats);
              const names = result.newlyUnlocked.map((id) => badgeLabel(id)).join(" · ");
              setUnlockToast(`RANGE QUAL · ${names} · +${awarded.xpGained} XP`);
              window.setTimeout(() => setUnlockToast(""), 5000);
            }
          }
          const verdict = result.passed
            ? rangePassLine(badgeLabel(result.badge))
            : rangeFailLine();
          state.audio.playRangeChallengeBeep("end");
          state.audio.playRadio(verdict, { channel: "range" });
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
      rangeChallengeWasActiveRef.current = challengeActive;
      // Practice mode: keep magazines topped off; proximity to refill crate also tops off.
      if (state.ammo < state.maxAmmo && state.reload <= 0) {
        state.ammo = state.maxAmmo;
        state.weaponAmmo[state.activeWeapon] = state.ammo;
      }
      if (state.shootingRange.nearRefill(state.player.position) || state.interactPulse) {
        const refill = state.shootingRange.refillWeapons();
        const m4Max = applyAttachmentMods(WEAPONS.m4, progressionRef.current.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
        const smgMax = applyAttachmentMods(WEAPONS.smg, progressionRef.current.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
        const pistolMax = applyAttachmentMods(WEAPONS.pistol, progressionRef.current.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
        state.weaponAmmo = {
          m4: Math.max(refill.m4, m4Max),
          smg: smgMax,
          pistol: Math.max(refill.pistol, pistolMax),
        };
        state.maxAmmo = state.weaponAmmo[state.activeWeapon];
        state.ammo = state.weaponAmmo[state.activeWeapon];
        state.reload = 0;
      }
      state.interactPulse = false;
      const keysRange = keysRef.current;
      if (keysRange.t && !keysRange.__challengeHeld) {
        keysRange.__challengeHeld = true;
        if (!state.shootingRange.stats.challengeActive && !state.shootingRange.stats.lastResult) {
          state.shootingRange.startChallenge();
          setRangeResult(null);
          state.audio.playRangeChallengeBeep("start");
          state.audio.playRadio(rangeChallengeStartLine(), {
            channel: "range",
          });
        }
      }
      if (!keysRange.t) keysRange.__challengeHeld = false;
    } else {
      rangeChallengeWasActiveRef.current = false;
    }

    if (state.gameMode === "solo") {
      // During XR, WebXRManager owns camera matrices — do not force-update the user camera.
      if (!isXrPresenting(state.renderer, state.xr)) {
        state.camera.updateMatrixWorld();
      }
      const aiCtx = {
        player: state.player.position.clone(),
        colliders: state.colliders,
        coverPoints: state.coverPoints,
        dt,
        now: state.clock.getElapsed(),
        tryMove: (from: THREE.Vector3, delta: THREE.Vector3) => tryMove(state, from, delta),
        hasLos: (from: THREE.Vector3, to: THREE.Vector3) => hasLineOfSight(state, from, to),
      };
      updateSquadCoordination(state.squads, aiCtx);

      state.enemies.forEach((enemy) => {
      if (!enemy.userData.alive) return;
      enemy.userData.actionLock = Math.max(0, (enemy.userData.actionLock || 0) - dt);
      tickHitReact(enemy, dt);

      if (isEnemyOnScreen(state, enemy)) {
        enemy.userData.lastSeenAt = performance.now();
      }
      updateEnemyMuzzleFlash(enemy);

      const toPlayer = state.player.position.clone().sub(enemy.position);
      const distance = toPlayer.length();
      const range = enemy.userData.range || 5;
      // Stagger heavy AI for distant hostiles — keep locomotion from cached steer.
      enemy.userData._aiFrame = ((enemy.userData._aiFrame as number) || 0) + 1;
      const aiStride = distance > 22 ? 3 : distance > 14 ? 2 : 1;
      const skipHeavyAi = aiStride > 1 && (enemy.userData._aiFrame as number) % aiStride !== 0;
      const cachedSteer = enemy.userData._cachedSteerResult as
        | ReturnType<typeof computeEnemySteer>
        | undefined;
      const steerResult = skipHeavyAi && cachedSteer
        ? cachedSteer
        : computeEnemySteer(enemy, aiCtx);
      if (!skipHeavyAi) enemy.userData._cachedSteerResult = steerResult;
      const speedMul = enemy.userData.aiSpeedMul || 1;
      const smoothedSteer = (enemy.userData.smoothedSteer as THREE.Vector3 | undefined) || new THREE.Vector3();
      enemy.userData.smoothedSteer = smoothedSteer;
      const aiNowEarly = performance.now() / 1000;
      const hasEngageLane =
        !skipHeavyAi
        && !enemyShouldHoldFire(enemy)
        && distance <= range
        && distance >= (enemy.userData.minimumDistance || 5) * 0.85
        && hasLineOfSight(state, enemy.position, state.player.position);
      // Brief plant-to-fire beats once settled on a fighting position — never
      // interrupt long relocates (cover far away / advance / retreat).
      const coverPoint = enemy.userData.coverTarget as { x: number; z: number } | null;
      const coverDist = coverPoint
        ? Math.hypot(coverPoint.x - enemy.position.x, coverPoint.z - enemy.position.z)
        : Infinity;
      const settledForVolley =
        steerResult.intent === "hold"
        || steerResult.intent === "strafe"
        || (steerResult.intent === "cover" && coverDist <= 2.1);
      const mayPlantToFire =
        hasEngageLane
        && enemy.userData.cooldown <= 0
        && (enemy.userData.burstShotsRemaining || 0) <= 0
        && aiNowEarly >= (enemy.userData.nextFireHoldAt || 0)
        && settledForVolley
        && !steerResult.retreating;
      if (mayPlantToFire) {
        enemy.userData.fireHoldUntil = aiNowEarly + 0.42 + Math.random() * 0.28;
        enemy.userData.nextFireHoldAt = aiNowEarly + 2.8 + Math.random() * 1.4;
      }
      const fireHolding = aiNowEarly < (enemy.userData.fireHoldUntil || 0);
      const relocatingCandidate =
        !fireHolding
        && (
          steerResult.intent === "cover"
          || steerResult.intent === "advance"
          || steerResult.intent === "retreat"
          || steerResult.intent === "strafe"
        );
      const kneelStance = updateEnemyKneelStance(enemy, {
        now: aiNowEarly,
        dt,
        distance,
        fireHolding,
        relocating: relocatingCandidate,
        intent: steerResult.intent,
        wantCover: steerResult.wantCover,
        fireHoldUntil: enemy.userData.fireHoldUntil || 0,
      });
      // Refresh after kneel may extend the plant window.
      const fireHoldingNow = aiNowEarly < (enemy.userData.fireHoldUntil || 0);
      const relocating = relocatingCandidate && !kneelStance.planted;
      const planted = fireHoldingNow || kneelStance.planted;
      const steeringResponse =
        planted
          ? 16
          : steerResult.intent === "retreat" || steerResult.intent === "advance"
            ? 11
            : steerResult.intent === "cover"
              ? 9
              : 7;
      const desiredSteer = planted ? new THREE.Vector3() : steerResult.steer;
      smoothedSteer.lerp(desiredSteer, 1 - Math.exp(-dt * steeringResponse));
      if (desiredSteer.lengthSq() < 0.0001 && smoothedSteer.lengthSq() < 0.0025) smoothedSteer.set(0, 0, 0);
      // Plant firmly while firing / kneeling; do not crawl-damp while relocating through a burst.
      const bursting = (enemy.userData.burstShotsRemaining || 0) > 0;
      if (planted) {
        // Hard plant — no residual slide / moonwalk in kneel or fire-hold.
        smoothedSteer.set(0, 0, 0);
      } else if (bursting && !relocating) {
        smoothedSteer.multiplyScalar(Math.exp(-dt * 16));
      }

      const steerMag = Math.min(1, smoothedSteer.length());
      const step = smoothedSteer.clone().multiplyScalar(enemy.userData.speed * speedMul * dt);
      const before = enemy.position.clone();
      const result = planted
        ? { position: before.clone(), moved: false, stuck: false }
        : tryMove(state, enemy.position, step);
      enemy.position.copy(result.position);
      const groundY = enemy.userData.groundOffset ?? enemy.userData.baseY ?? 0;
      const kneelDrop = (kneelStance.kneelBlend || 0) * 0.28;
      enemy.position.y = groundY - kneelDrop;
      enemy.userData.baseY = groundY;
      if (result.stuck && !planted) {
        enemy.userData.stuckTime = (enemy.userData.stuckTime || 0) + dt;
        if (state.clock.getElapsed() >= (enemy.userData.nextFlankFlipAt || 0)) {
          enemy.userData.flank *= -1;
          enemy.userData.nextFlankFlipAt = state.clock.getElapsed() + 0.8;
        }
        if (enemy.userData.stuckTime > 1.25) {
          const toward = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, -1);
          const flankDir = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(enemy.userData.flank || 1);
          const escape = toward
            .clone()
            .multiplyScalar(0.35)
            .addScaledVector(flankDir, 0.75)
            .normalize()
            .multiplyScalar(enemy.userData.speed * speedMul * dt);
          const bump = tryMove(state, enemy.position, escape);
          enemy.position.copy(bump.position);
          enemy.position.y = groundY - kneelDrop;
          enemy.userData.stuckTime = bump.moved ? 0.8 : 1.1;
        }
      } else if (before.distanceToSquared(enemy.position) > 0.00001) {
        enemy.userData.stuckTime = 0;
      }

      const turnError = turnEnemyTowardPlayer(enemy, state.player.position, dt);
      const movedDistance = before.distanceTo(enemy.position);
      const motionSpeed = movedDistance / Math.max(dt, 0.001);
      const intendedSpeed = enemy.userData.speed * speedMul * steerMag;
      // Prefer intended pace when a collider nibble keeps displacement tiny for a frame.
      const animSpeed = resolveEnemyAnimSpeed(motionSpeed, intendedSpeed, relocating && !planted && steerMag > 0.2);
      enemy.userData.motionSpeed = motionSpeed;
      enemy.userData.intendedSpeed = intendedSpeed;
      // Prefer locomotion clips whenever steer/step says we should be moving,
      // even if a collider nibble keeps world displacement tiny for a frame.
      const wantsLocomotion = relocating && !planted && smoothedSteer.lengthSq() > 0.04;
      const enemyMoving = !planted && (movedDistance > 0.0015 || wantsLocomotion);
      if (enemy.userData.modelType === "fbx-mixamo" || enemy.userData.modelType === "mixamo-glb") {
        if (kneelStance.kneelBlend > 0.45 && !enemyMoving) {
          switchEnemyAnimation(state, enemy, ["kneel", "kneeling", "crouch", "idle_gun_pointing", "aim", "idle"]);
        } else if ((fireHoldingNow || (steerResult.wantCover && steerResult.intent === "hold")) && !enemyMoving) {
          switchEnemyAnimation(state, enemy, ["idle_gun_pointing", "idle_gun", "aim", "idle"]);
        } else {
          // Quaternius Walk/Run are unarmed — using them while the rifle is
          // parented to WristR makes the gun look slung on the back. Always
          // prefer Run_Shoot (gun-ready locomotion) and scale its playback.
          switchEnemyAnimation(
            state,
            enemy,
            enemyMoving
              ? ["run_shoot", "idle_gun_shoot", "idle_gun_pointing", "idle_gun"]
              : ["idle_gun_pointing", "idle_gun", "aim", "idle"]
          );
        }
        syncEnemyLocomotionTimeScale(enemy, enemyMoving ? animSpeed : 0);
      }
      const gaitRate = enemyMoving ? THREE.MathUtils.clamp(animSpeed / 3.2, 0.75, 1.55) : 1;
      animateSoldier(enemy, dt, enemyMoving, gaitRate, kneelStance.kneelBlend);
      enemy.userData.cooldown -= dt;
      enemy.userData.burstShotTimer = Math.max(0, (enemy.userData.burstShotTimer || 0) - dt);
      const aiNow = aiNowEarly;
      if ((enemy.userData.reloadUntil || 0) > 0 && aiNow >= enemy.userData.reloadUntil) {
        enemy.userData.magazine = enemy.userData.magazineSize || 24;
        enemy.userData.reloadUntil = 0;
      }
      if ((enemy.userData.magazine || 0) <= 0 && (enemy.userData.reloadUntil || 0) <= 0) {
        enemy.userData.reloadUntil = aiNow + 1.7 + Math.random() * 0.8;
        enemy.userData.burstShotsRemaining = 0;
      }
      if (
        shouldEnemyThrowGrenade(
          state,
          enemy,
          distance,
          steerResult,
          aiNow,
        )
      ) {
        throwEnemyGrenade(state, enemy);
      }

      const mayDamage = canEnemyDealDamage(state, enemy, distance);
      const holding = enemyShouldHoldFire(enemy);
      const aimSettled =
        turnError < 0.16
        && (planted || fireHoldingNow || motionSpeed < 0.95 || steerResult.intent === "hold");
      const hasFiringLane = !holding
        && distance <= range
        && hasLineOfSight(state, enemy.position, state.player.position);

      if (
        hasFiringLane
        && aimSettled
        && enemy.userData.cooldown <= 0
        && (enemy.userData.burstShotsRemaining || 0) <= 0
      ) {
        const typeName = String(enemy.userData.enemyType || "");
        enemy.userData.burstShotsRemaining =
          typeName === "Sniper" ? 1 : typeName === "Heavy" ? 4 : typeName === "Scout" ? 2 : 3;
        enemy.userData.burstShotTimer = 0;
        enemy.userData.fireHoldUntil = Math.max(
          enemy.userData.fireHoldUntil || 0,
          aiNow + 0.32 + (enemy.userData.burstShotsRemaining || 1) * 0.12
        );
      }

      const canShootBurstRound =
        hasFiringLane
        && turnError < 0.18
        && (planted || motionSpeed < 1.15)
        && (enemy.userData.burstShotsRemaining || 0) > 0
        && enemy.userData.burstShotTimer <= 0;
      if (canShootBurstRound) {
        // Fire-time aim telemetry — async QA probes read these instead of racing the frame loop.
        enemy.userData.lastShotTurnError = turnError;
        enemy.userData.lastShotMotionSpeed = planted ? 0 : motionSpeed;
        triggerSoldierShootAnimation(state, enemy);
        pulseEnemyMuzzleFlash(enemy);
        enemy.userData.burstShotsRemaining -= 1;
        enemy.userData.magazine = Math.max(0, (enemy.userData.magazine || 0) - 1);
        const typeName = String(enemy.userData.enemyType || "");
        enemy.userData.burstShotTimer = typeName === "Heavy" ? 0.16 : typeName === "Scout" ? 0.21 : 0.13;
        if (enemy.userData.burstShotsRemaining <= 0) {
          enemy.userData.cooldown = (enemy.userData.fireCooldownMax || 0.8) * (0.9 + Math.random() * 0.25);
        }

        const damageEligibleThisRound = mayDamage && state.enemyVolleyCooldown <= 0;
        if (damageEligibleThisRound) state.enemyVolleyCooldown = 0.68;
        const accuracy = Math.min(0.5, 0.1 + (1 - distance / Math.max(range, 1)) * 0.34);
        const hit = Math.random() < accuracy;
        const fxQuality = effectiveFxQuality(state);

        const from = getEnemyMuzzleWorldPos(enemy);
        const to = state.player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        const shotDir = to.sub(from.clone()).normalize();
        if (!hit || !damageEligibleThisRound) {
          shotDir.x += (Math.random() - 0.5) * 0.2;
          shotDir.y += (Math.random() - 0.5) * 0.12;
          shotDir.z += (Math.random() - 0.5) * 0.2;
          shotDir.normalize();
          if (!mayDamage) {
            addSuppression(state.combatFx, 0.05);
            if (Math.random() < 0.35) state.audio.playSuppression();
          }
        }
        spawnMuzzleBlast(state.combatFx, from, shotDir, fxQuality, {
          color: 0xffb86a,
          smoke: fxQuality >= 0.7,
          light: false, // pulseEnemyMuzzleFlash already owns the attached light
        });
        const tracer = spawnTracer({
          origin: from.clone().add(shotDir.clone().multiplyScalar(0.35)),
          direction: shotDir,
          speed: 48,
          life: 0.45,
          color: hit && damageEligibleThisRound ? 0xff8a4a : 0xe8d29a,
          quality: fxQuality,
          enemyProjectile: true,
          enemyDamage: hit && damageEligibleThisRound ? enemy.userData.damage || 7 : 0,
          sourcePosition: enemy.position.clone(),
        });
        state.scene.add(tracer);
        state.bullets.push(tracer);
      }
    });

      // Death animations / cleanup
      state.dyingEnemies = state.dyingEnemies.filter((enemy) => {
        const soft = Boolean(enemy.userData.animState === "death" || /death/i.test(String(enemy.userData.currentClipName || "")));
        const finished = applyProceduralDeath(enemy, dt, { soft });
        if (!finished) return true;
        if (enemy.userData.mixer) {
          state.mixers = state.mixers.filter((mixer) => mixer !== enemy.userData.mixer);
        }
        state.scene.remove(enemy);
        return false;
      });
    }

    state.bullets.forEach((bullet) => {
      const velocity = bullet.userData.velocity as THREE.Vector3;
      if (bullet.userData.enemyProjectile) {
        const playerCenter = state.player.position.clone().add(new THREE.Vector3(0, state.crouching ? 0.9 : 1.4, 0));
        const result = sweepBullet(bullet.position, velocity, dt, state.colliders, playerCenter, 0.58);
        bullet.position.copy(result.end);
        if (result.worldHit) {
          spawnBulletImpact(
            state.combatFx,
            result.worldHit.point,
            result.worldHit.normal,
            result.worldHit.surface === "dirt" ? "dirt" : "metal",
            effectiveFxQuality(state),
          );
          state.audio.playImpact(result.worldHit.surface === "dirt" ? "dirt" : "metal");
          bullet.userData.life = 0;
        } else if (result.targetHit && bullet.userData.enemyDamage > 0) {
          damagePlayer(
            state,
            soloEnemyDamage(bullet.userData.enemyDamage, state.gameMode),
            bullet.userData.sourcePosition || bullet.position,
          );
          bullet.userData.life = 0;
        } else if (result.targetHit) {
          addSuppression(state.combatFx, 0.12);
          bullet.userData.life = 0;
        } else if (bullet.position.distanceTo(playerCenter) < 1.7) {
          addSuppression(state.combatFx, 0.1);
          if (!bullet.userData.nearMissPlayed && (bullet.userData.enemyDamage || 0) <= 0) {
            bullet.userData.nearMissPlayed = true;
            if (Math.random() < 0.5) state.audio.playNearMiss();
          }
        }
      } else {
        bullet.position.addScaledVector(velocity, dt);
      }
      bullet.userData.life -= dt;
      if (bullet.userData.pooledTracer) orientTracer(bullet);
    });
    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.userData.life > 0) return true;
      if (bullet.userData.pooledTracer) releaseTracer(bullet);
      else state.scene.remove(bullet);
      return false;
    });

    state.grenades = state.grenades.filter((grenade) => {
      if (!stepGrenade(grenade, dt, state.colliders)) return true;
      explodeGrenade(state, grenade);
      return false;
    });

    updateCombatFx(state.combatFx, dt);
    updateDestruction(state.atmosphere, dt);
    state.quality.update(dt);

    // Hard cap live tracers — Quest Browser GC / compositor spikes hard past ~20.
    const maxBullets = state.xr?.presenting || isTouchDevice() ? 16 : 48;
    while (state.bullets.length > maxBullets) {
      const oldest = state.bullets.shift();
      if (!oldest) break;
      if (oldest.userData.pooledTracer) releaseTracer(oldest);
      else state.scene.remove(oldest);
    }

    if (state.gameMode === "solo") {
      state.enemies = state.enemies.filter((enemy) => enemy.userData.alive);

      if (state.activeSceneId === "compound") {
        if (state.interactPulse && tryAlliedNpcTalk(state.alliedNpcState, buildAlliedNpcContext(state, true))) {
          state.interactPulse = false;
        }
        updateAlliedNpcs(state.alliedNpcState, buildAlliedNpcContext(state));
      }

      if (state.activeMission) {
        const prevComplete = state.activeMission.complete;
        const prevPhase = state.activeMission.phase;
        state.activeMission = updateMission(state.activeMission, {
          playerX: state.player.position.x,
          playerZ: state.player.position.z,
          enemiesAlive: state.enemies.length,
          killsThisFrame: 0,
          dt,
          interactPressed: state.interactPulse,
          roomId:
            state.activeSceneId === "compound"
              ? warehouseRoomAt(state.player.position.x, state.player.position.z)
              : null,
        });
        state.interactPulse = false;
        if (state.activeMission.type === "rescue") {
          const asset = state.activeMission.markers.find((m) => m.id === "asset");
          const marker = state.missionMarkers.find((g) => g.userData.markerId === "asset");
          if (asset && marker) marker.position.set(asset.x, 0.05, asset.z);
        }

        if (state.activeMission.type === "extraction" && state.extractionHeli && state.activeSceneId === "compound") {
          const m = state.activeMission;
          if (m.phase >= 1 && state.extractionHeli.phase === "hidden") {
            startHeliInbound(state.extractionHeli);
          }
          if (m.phase !== state.extractAnnouncedPhase) {
            state.extractAnnouncedPhase = m.phase;
            if (m.phase === 1 && prevPhase < 1) {
              state.audio.playRadio(extractHoldLine(), { channel: "mission" });
              setMissionBanner("HOLD THE LZ — Leaving pauses extract");
              window.setTimeout(() => setMissionBanner(""), 4000);
            } else if (m.phase === 2 && prevPhase < 2) {
              state.audio.playRadio(extractBoardLine(), { channel: "mission" });
              setMissionBanner("BIRD ON STATION — Board the helicopter");
              window.setTimeout(() => setMissionBanner(""), 4500);
            }
          }
          // Pulse extract markers during hold.
          for (const g of state.missionMarkers) {
            if (!g.userData.extractRing) continue;
            const pulse = 0.45 + Math.sin(state.clock.getElapsed() * 3.2) * 0.2;
            g.children.forEach((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                child.material.opacity = Math.min(0.85, pulse + (m.phase >= 2 ? 0.2 : 0));
              }
            });
          }
          // Timed pressure while holding — keeps extract contested even if some hostiles remain.
          if (m.phase === 1 && !m.complete && state.clock.getElapsed() >= state.extractReinforceAt) {
            const need = Math.max(0, 6 - state.enemies.length);
            for (let i = 0; i < Math.min(3, need); i += 1) spawnEnemy(state);
            if (need > 0) state.squads = assignSquads(state.enemies);
            state.extractReinforceAt = state.clock.getElapsed() + 7 + Math.random() * 4;
          }
        }

        if (state.activeMission.complete && !prevComplete) {
          if (state.activeMission.endsRun || state.activeMission.type === "extraction") {
            completeExtractionVictory(state);
            return;
          }
          state.score += state.activeMission.scoreBonus;
          state.audio.playRadio(objectiveCompleteLine(state.activeMission.title), {
            channel: "mission",
          });
          setMissionBanner(`MISSION COMPLETE — ${state.activeMission.title}  (+${state.activeMission.scoreBonus})`);
          window.setTimeout(() => setMissionBanner(""), 4200);
          if (state.activeMission.type === "sabotage") {
            for (const tank of state.activeMission.markers.filter((m) => m.id.startsWith("tank"))) {
              spawnDestructionBurst(state.scene, tank.x, tank.z, state.atmosphere);
            }
            state.audio.playExplosion(12);
          }
        }
      }

      // Reinforcements during incomplete structured missions (was unreachable: waveClear
      // previously required missionDone, which needs complete for non-wave missions).
      if (state.running && state.enemies.length === 0) {
        const mission = state.activeMission;
        const structuredIncomplete = mission && mission.type !== "waves" && !mission.complete;
        if (structuredIncomplete) {
          for (let i = 0; i < 4; i += 1) spawnEnemy(state);
          state.squads = assignSquads(state.enemies);
        } else {
          const missionDone = !mission || mission.complete || mission.type === "waves";
          if (missionDone && !state.extractSucceeded) {
            state.wave += 1;
            state.health = Math.min(state.maxHealth, state.health + WAVE_CLEAR_ARMOR_BONUS);
            const m4Max = applyAttachmentMods(WEAPONS.m4, progressionRef.current.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
            const smgMax = applyAttachmentMods(WEAPONS.smg, progressionRef.current.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
            const pistolMax = applyAttachmentMods(WEAPONS.pistol, progressionRef.current.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
            state.weaponAmmo = { m4: m4Max, smg: smgMax, pistol: pistolMax };
            state.maxAmmo = state.weaponAmmo[state.activeWeapon];
            state.ammo = state.weaponAmmo[state.activeWeapon];
            state.grenadesRemaining = Math.min(MAX_GRENADES, state.grenadesRemaining + 1);
            if (state.wave % 2 === 0) state.medkits += 1;
            if (state.pickups) respawnPickupsAfterWave(state.pickups, state.clock.getElapsed(), state.wave);
            beginWaveContent(state);
          }
        }
      }

      const missionElapsed = state.clock.getElapsed() - state.missionStartedAt;

      // Mid-wave pressure — never let the yard go quiet for long.
      if (
        state.running
        && state.enemies.length > 0
        && state.enemies.length <= PRESSURE_SPAWN_THRESHOLD
        && missionElapsed >= state.nextPressureSpawnAt
      ) {
        const cap = MAX_ALIVE_ENEMIES() - state.enemies.length;
        const toSpawn = Math.min(state.activeSceneId === "compound" ? 3 : 2, cap);
        for (let i = 0; i < toSpawn; i += 1) spawnEnemy(state);
        if (toSpawn > 0) state.squads = assignSquads(state.enemies);
        state.nextPressureSpawnAt = missionElapsed + 9 + Math.random() * 5;
      }

      const fxQuality = effectiveFxQuality(state);
      const inCombat = state.enemies.length >= 2;
      state.battlefieldChaos.active = true;
      updateBattlefieldChaos(
        state.battlefieldChaos,
        state.scene,
        state.atmosphere,
        {
          fxScale: state.quality.getFxScale(),
          lowPower: state.atmosphere.lowPower,
          elapsed: missionElapsed,
          playerX: state.player.position.x,
          playerZ: state.player.position.z,
          inCombat,
          onDistantExplosion: (x, z, dist) => {
            state.audio.playExplosion(dist);
            if (fxQuality >= 0.35) {
              spawnAmbientImpactSpark(
                state.combatFx,
                new THREE.Vector3(x, 0.15, z),
                fxQuality,
              );
            }
          },
          onArtilleryThump: () => {
            state.audio.playArtilleryThump();
            if (allowRadioCue("artillery", 12000)) {
              state.audio.playRadio(battlefieldChaosLine(), { channel: "mission" });
            }
          },
          onDistantGunfire: () => {
            if (Math.random() < 0.55) state.audio.playDistantGunfire();
          },
          onRadioLine: (kind) => {
            if (kind === "qrf" && allowRadioCue("qrf", 22000)) {
              state.audio.playRadio(qrfInboundLine(), { channel: "mission" });
            } else if (kind === "vehicle" && allowRadioCue("vehicle", 16000)) {
              state.audio.playRadio(vehicleBoomLine(), { channel: "mission" });
              state.audio.playVehicleBoom();
            }
          },
        },
        dt,
      );

      if (state.wave > state.announcedWave) {
        state.announcedWave = state.wave;
        state.nextRadioAt = missionElapsed + 18 + Math.random() * 10;
        state.audio.playRadio(waveInboundLine(state.wave), {
          channel: "mission",
        });
      } else if (missionElapsed >= state.nextRadioAt) {
        state.audio.playRadio(missionAmbientLine(), { channel: "mission" });
        state.nextRadioAt = missionElapsed + 18 + Math.random() * 12;
      }

      if (missionElapsed >= state.nextDistantFireAt) {
        state.audio.playDistantGunfire();
        state.nextDistantFireAt = missionElapsed + 5 + Math.random() * 7;
      }
      if (missionElapsed >= state.nextCalloutAt && state.enemies.length > 0) {
        const callout = Math.random() < 0.42 ? contactDirectionLine() : enemyCalloutLine();
        state.audio.playEnemyCallout(callout);
        state.nextCalloutAt = missionElapsed + 6 + Math.random() * 7;
      }
    }

    const missionText = state.activeMission && state.gameMode === "solo"
      ? missionHudText(state.activeMission)
      : null;
    const rangeStats = state.shootingRange?.stats;
    const directive = state.gameMode === "pvp"
      ? {
          objective: state.pvpRespawnBanner || "Eliminate rival operatives in the compound.",
          intel: `Room ${pvpRoomInput || DEFAULT_PVP_ROOM} · ${1 + state.remotePlayers.size} linked · Sync ${pvpClient?.getStatus() || "offline"}`,
        }
      : state.gameMode === "range"
        ? {
            objective: rangeStats?.challengeActive
              ? `Timed challenge — ${Math.ceil(rangeStats.challengeTimeLeft)}s left`
              : "Engage silhouettes and plates at 10m · 25m · 50m. Press T for qualification.",
            intel: rangeStats?.challengeActive
              ? `Qual score ${rangeStats.challengeScore} · Acc ${rangeStats.challengeAccuracy.toFixed(0)}% · Best ${rangeStats.bestChallengeScore}`
              : `Hits ${rangeStats?.hits ?? 0} · Acc ${(rangeStats?.accuracy ?? 0).toFixed(0)}% · Badge ${badgeLabel(rangeStats?.highestBadge ?? loadHighestBadge())} · T starts ${RANGE_CHALLENGE_SECONDS}s · Esc leaves`,
          }
        : missionText || getWaveDirective(state.wave);
    if (state.running && state.missionStartedAt > 0) {
      state.lastMissionTime = formatMissionTime(state.clock.getElapsed() - state.missionStartedAt);
    }
    const missionTime = state.lastMissionTime || "00:00";

    const nowMs = performance.now();
    const contactActive = nowMs < state.contactUntil;
    if (!contactActive) state.lastDamageBearing = null;
    const interactNear = state.gameMode === "solo"
      ? nearestInteractMarker(state.activeMission, state.player.position.x, state.player.position.z)
      : null;
    const alliedNear =
      state.gameMode === "solo" && state.activeSceneId === "compound"
        ? nearestAlliedPrompt(state.alliedNpcState, state.player.position.x, state.player.position.z)
        : null;
    const alliedSubtitle =
      state.gameMode === "solo" && state.activeSceneId === "compound" && state.settings.subtitles
        ? alliedRadioSubtitle(state.alliedNpcState, nowMs)
        : "";
    const subtitle =
      alliedSubtitle ||
      (state.settings.subtitles && state.gameMode === "solo" && state.activeMission
        ? state.activeMission.briefing
        : "");

    const hudKeys = keysRef.current;
    const hudMoving =
      Boolean(hudKeys.w || hudKeys.a || hudKeys.s || hudKeys.d || hudKeys.ArrowUp || hudKeys.ArrowDown || hudKeys.ArrowLeft || hudKeys.ArrowRight);
    const hudSprinting = hudMoving && Boolean(hudKeys.shift) && !state.crouching;
    const loadoutAttachments =
      progressionRef.current.loadout.find((l) => l.weapon === state.activeWeapon)?.attachments || [];
    const spreadRing = computeSpreadVisual(
      WEAPONS[state.activeWeapon],
      state.fireHeat,
      state.adsBlend,
      {
        moving: hudMoving,
        sprinting: hudSprinting,
        accuracyBonus: applyAttachmentMods(WEAPONS[state.activeWeapon], loadoutAttachments).accuracyBonus,
      },
    );

    const nextHud: Hud = {
      health: Math.round(state.health),
      maxHealth: state.maxHealth,
      ammo: state.reload > 0 ? "RELOAD" : state.ammo,
      activeWeapon: state.activeWeapon,
      m4Ammo: state.weaponAmmo.m4,
      smgAmmo: state.weaponAmmo.smg,
      pistolAmmo: state.weaponAmmo.pistol,
      grenades: state.grenadesRemaining,
      score: state.gameMode === "range"
        ? (rangeStats?.challengeActive ? rangeStats.challengeScore : (rangeStats?.score ?? state.score))
        : state.score,
      enemies: state.gameMode === "pvp"
        ? state.remotePlayers.size
        : state.gameMode === "range"
          ? (rangeStats?.challengeActive ? rangeStats.challengeHits : (rangeStats?.hits ?? 0))
          : state.enemies.length,
      wave: state.wave,
      objective: directive.objective,
      intel: directive.intel,
      streak: state.bestStreak,
      medkits: state.medkits,
      missionTime: state.gameMode === "range" && rangeStats?.challengeActive
        ? `${Math.ceil(rangeStats.challengeTimeLeft)}s`
        : missionTime,
      gameMode: state.gameMode,
      kills: state.pvpKills,
      deaths: state.pvpDeaths,
      pvpPlayers: 1 + state.remotePlayers.size,
      pvpStatus: pvpClient?.getStatus() || "offline",
      contact: contactActive ? "CONTACT" : "",
      damageBearing: contactActive ? state.lastDamageBearing : null,
      missionTitle: state.gameMode === "range"
        ? (rangeStats?.challengeActive ? "Qualification Challenge" : "Shooting Range")
        : state.activeMission?.title || `Wave ${state.wave}`,
      missionProgress: state.gameMode === "range" && rangeStats?.challengeActive
        ? 1 - rangeStats.challengeTimeLeft / RANGE_CHALLENGE_SECONDS
        : state.activeMission?.progress || 0,
      suppression: suppressionHudOpacity(state.combatFx),
      spreadRing,
      rank: rankFromXp(progressionRef.current.xp).rank,
      difficulty: state.difficulty,
      crouching: state.crouching,
      aiming: state.adsBlend > 0.35,
      subtitle: state.gameMode === "range"
        ? "Infinite ammo · T qualification · amber crate refill · Esc menu"
        : subtitle,
      interactPrompt: state.gameMode === "range" && state.shootingRange?.nearRefill(state.player.position)
        ? "Ammo station — magazines topped"
        : state.pickupPrompt
          ? state.pickupPrompt
          : alliedNear && (!interactNear || alliedNear.dist <= interactNear.dist)
            ? alliedNear.prompt
            : interactNear?.prompt || "",
      missionBanner,
      unlockNotice: unlockToast,
      supplyNotice: "",
      rangeHits: rangeStats?.challengeActive ? rangeStats.challengeHits : (rangeStats?.hits ?? 0),
      rangeMisses: rangeStats?.challengeActive ? rangeStats.challengeMisses : (rangeStats?.misses ?? 0),
      rangeShots: rangeStats?.challengeActive ? rangeStats.challengeShots : (rangeStats?.shots ?? 0),
      rangeAccuracy: rangeStats?.challengeActive ? rangeStats.challengeAccuracy : (rangeStats?.accuracy ?? 0),
      rangeDistance: rangeStats?.lastHitDistance ?? 0,
      rangeChallengeActive: Boolean(rangeStats?.challengeActive),
      rangeChallengeTime: rangeStats?.challengeTimeLeft ?? 0,
      rangeChallengeScore: rangeStats?.challengeScore ?? 0,
      rangeBestScore: rangeStats?.bestChallengeScore ?? loadBestChallengeScore(),
      rangeHighestBadge: rangeStats?.highestBadge ?? loadHighestBadge(),
      rangeUnlockedBadges: rangeStats?.unlockedBadges ?? loadUnlockedBadges(),
      modelMode: state.fbxModeLoaded
        ? `FBX soldier + ${Object.keys(state.fbxClips).length} animations`
        : state.enemyModelLoaded
          ? state.enemyAnimations.length
            ? `Detailed soldier (${state.enemyAnimations.length} animations)`
            : "Detailed soldier loaded"
          : "procedural 3D fallback",
    };

    hudTimerRef.current += dt;
    const hudKey = `${nextHud.health}|${nextHud.ammo}|${nextHud.activeWeapon}|${nextHud.m4Ammo}|${nextHud.smgAmmo}|${nextHud.pistolAmmo}|${nextHud.grenades}|${nextHud.score}|${nextHud.enemies}|${nextHud.wave}|${nextHud.missionTime}|${nextHud.medkits}|${nextHud.streak}|${nextHud.modelMode}|${nextHud.gameMode}|${nextHud.kills}|${nextHud.deaths}|${nextHud.pvpPlayers}|${nextHud.pvpStatus}|${nextHud.objective}|${nextHud.contact}|${nextHud.damageBearing}|${nextHud.missionTitle}|${nextHud.missionProgress.toFixed(2)}|${nextHud.suppression.toFixed(2)}|${nextHud.spreadRing.toFixed(2)}|${nextHud.crouching}|${nextHud.aiming}|${nextHud.subtitle}|${nextHud.interactPrompt}|${nextHud.missionBanner}|${nextHud.unlockNotice}|${nextHud.rangeHits}|${nextHud.rangeMisses}|${nextHud.rangeAccuracy.toFixed(0)}|${nextHud.rangeChallengeActive}|${nextHud.rangeChallengeScore}|${nextHud.rangeHighestBadge}|${rangeResult?.endedAt ?? 0}`;
    // Skip React HUD writes while immersive — world-space XRHud already covers this, and
    // React re-renders during XR frames contribute to Quest compositor freezes.
    const immersive = isXrPresenting(state.renderer, state.xr);
    if (!immersive && (hudTimerRef.current >= 0.1 || hudKey !== lastHudKeyRef.current)) {
      hudTimerRef.current = 0;
      if (hudKey !== lastHudKeyRef.current) {
        lastHudKeyRef.current = hudKey;
        setHud(nextHud);
      }
    }
  }

  function runSmokeTests() {
    console.assert(ENEMY_TYPES.length === 5, "There should be five enemy soldier types.");
    const testSoldier = makeRealisticProceduralSoldier("Test", 0x4b563d, true);
    console.assert(testSoldier.children.length > 20, "Procedural soldier should have detailed body and facial parts.");
    console.assert(Boolean(testSoldier.userData.limbs?.head), "Procedural soldier should track head animation data.");
    console.assert(Boolean(testSoldier.userData.limbs?.rifle), "Procedural soldier should track rifle animation data.");
    console.assert(testSoldier.userData.alive === true, "Procedural test soldier factory should still work only as an internal fallback test, not as visible gameplay characters.");
    console.assert(SOLDIER_MODEL_URL.endsWith(".glb"), "Primary soldier model should be a web-ready GLB.");
    console.assert(WEAPON_MODEL_URL.endsWith(".fbx"), "Primary weapon model should be an FBX.");
    console.assert(PISTOL_MODEL_URL.endsWith(".glb"), "Secondary weapon model should be a web-ready GLB.");
    console.assert(WEAPONS.m4.automatic && !WEAPONS.pistol.automatic, "M4 should be automatic and pistol semi-automatic.");
    console.assert(60 / WEAPONS.m4.fireInterval >= 650, "M4 rapid fire should run at least 650 RPM.");
    console.assert(WEAPONS.m4.sustainedSpread > WEAPONS.m4.baseSpread, "M4 sustained fire should increase spread.");
    console.assert(ENEMY_TYPES.every((t) => t.range > 0 && t.damage > 0), "Every enemy type should define range and damage.");
    console.assert(
      ENEMY_TYPES.every((t) => t.speed >= 3.2 && t.speed <= 6),
      "Enemy world speeds should sit in a tactical jog band (not slow-mo shuffle)."
    );
    console.assert(
      (ENEMY_TYPES.find((t) => t.name === "Scout")?.speed || 0)
        > (ENEMY_TYPES.find((t) => t.name === "Heavy")?.speed || 0),
      "Scout should outpace Heavy."
    );
    console.assert(SHOOT_ANIMATION_LOCK_SECONDS > 0, "Shoot animation lock should be positive.");
    const thinPools = assertRadioPoolsVaried(2);
    console.assert(thinPools.length === 0, `Radio pools need variety: ${thinPools.join(", ")}`);
    console.assert(
      poolRotatesWithoutImmediateRepeat("missionAmbient", MISSION_AMBIENT_LINES),
      "Mission ambient radio should rotate without immediate repeats."
    );
    const extractWave = pickMissionForWave(14);
    console.assert(extractWave.type === "extraction", "Wave 14 should schedule helicopter extraction.");
    console.assert(extractWave.endsRun === true, "Extraction mission should end the solo run.");
    let extract = createExtractionMission();
    const lz = extract.markers[0]!;
    extract = updateMission(extract, {
      playerX: lz.x,
      playerZ: lz.z,
      enemiesAlive: 3,
      killsThisFrame: 0,
      dt: 0.5,
      interactPressed: false,
    });
    console.assert(extract.objectives[0]?.done === true, "Standing on LZ should complete reach objective.");
    console.assert(extract.phase === 1, "Extraction should enter hold phase on the LZ.");
    const paused = updateMission(extract, {
      playerX: lz.x + 40,
      playerZ: lz.z,
      enemiesAlive: 3,
      killsThisFrame: 0,
      dt: 5,
      interactPressed: false,
    });
    console.assert(paused.progress === extract.progress, "Leaving the LZ should pause hold progress.");
    extract = updateMission(extract, {
      playerX: lz.x,
      playerZ: lz.z,
      enemiesAlive: 2,
      killsThisFrame: 0,
      dt: EXTRACT_HOLD_SEC + 1,
      interactPressed: false,
    });
    console.assert(extract.objectives[1]?.done === true, "Full hold on LZ should ready the bird.");
    console.assert(extract.complete && extract.endsRun, "Holding through ready while on the LZ should board and end the run.");
  }

  function resetLoadout(state: GameState) {
    const m4Max = applyAttachmentMods(WEAPONS.m4, progressionRef.current.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
    const smgMax = applyAttachmentMods(WEAPONS.smg, progressionRef.current.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
    const pistolMax = applyAttachmentMods(WEAPONS.pistol, progressionRef.current.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
    const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
    state.maxHealth = maxHealthForDifficulty(diff.playerHpMul);
    state.health = state.maxHealth;
    state.weaponAmmo = { m4: m4Max, smg: smgMax, pistol: pistolMax };
    state.activeWeapon = "m4";
    state.weapon = state.weaponViews.m4;
    applyPlayerWeaponVisibility(state.weaponViews);
    state.ammo = state.weaponAmmo.m4;
    state.maxAmmo = m4Max;
    state.reload = 0;
    state.triggerLatched = false;
    state.fireHeat = 0;
    state.fireCooldown = 0;
    state.recoil = 0;
    state.recoilYaw = 0;
    state.adsHeld = false;
    state.adsBlend = 0;
    state.grenadesRemaining = 3;
    state.camera.fov = state.settings.fov;
    if (!isXrPresenting(state.renderer, state.xr)) {
      state.camera.updateProjectionMatrix();
    }
  }

  function disconnectPvp() {
    pvpClientRef.current?.disconnect();
    pvpClientRef.current = null;
    setPvpConnecting(false);
  }

  function disposeShootingRange(state: GameState) {
    if (!state.shootingRange) return;
    state.shootingRange.dispose(state.scene);
    state.shootingRange = null;
    state.colliders = state.compoundColliders;
  }

  function leaveShootingRange() {
    const state = gameRef.current;
    if (!state) return;
    disposeShootingRange(state);
    activateCombatScene(state, selectedScene);
    state.audio.stopRangeAudio();
    state.audio.setGameMode("solo");
    state.running = false;
    state.gameMode = "solo";
    state.activeMission = null;
    state.player.position.set(0, 0, 10);
    state.yaw = 0;
    state.pitch = 0;
    rangeChallengeWasActiveRef.current = false;
    setRangeResult(null);
    if (document.pointerLockElement) document.exitPointerLock();
    lastHudKeyRef.current = "";
    setStarted(false);
    setGameOver(false);
    setMissionOutcome(null);
  }

  function startShootingRange() {
    const state = gameRef.current;
    if (!state) return;
    disconnectPvp();
    clearRemotePlayers(state);
    clearAllEnemies(state);
    disposeShootingRange(state);
    state.activeMission = null;
    state.missionMarkers.forEach((m) => state.scene.remove(m));
    state.missionMarkers = [];
    state.dyingEnemies = [];
    state.gameMode = "range";
    state.pvpAlive = true;
    state.pvpRespawnBanner = "";
    state.running = true;
    resetLoadout(state);
    state.score = 0;
    state.wave = 0;
    state.sessionKills = 0;
    state.killStreak = 0;
    state.bestStreak = 0;
    state.medkits = 0;
    state.health = 100;
    state.missionStartedAt = state.clock.getElapsed();
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 0;
    state.enemyVolleyCooldown = 0;
    state.enemyGrenadeLockUntil = 0;
    state.playerStationarySec = 0;
    state.lastPlayerX = state.player.position.x;
    state.lastPlayerZ = state.player.position.z;
    state.nextRadioAt = Number.POSITIVE_INFINITY;
    state.nextDistantFireAt = Number.POSITIVE_INFINITY;
    state.nextCalloutAt = Number.POSITIVE_INFINITY;
    state.audio.unlock();
    state.audio.setMuted(audioMuted);
    state.audio.setVolumes({
      master: settings.masterVolume,
      sfx: settings.sfxVolume,
      radio: settings.radioVolume,
    });
    state.audio.setGameMode("range");
    state.settings = settings;
    state.camera.fov = settings.fov;
    if (!isXrPresenting(state.renderer, state.xr)) {
      state.camera.updateProjectionMatrix();
    }

    const range = createShootingRange(state.scene);
    state.shootingRange = range;
    state.colliders = range.colliders;
    state.player.position.copy(range.spawnWorld);
    state.player.userData.baseY = 0;
    state.yaw = range.lookYaw;
    state.pitch = 0;
    state.crouching = false;
    state.contactUntil = 0;
    state.lastDamageBearing = null;
    state.audio.startRangeAmbience();
    state.audio.playRadio(rangeOnlineLine(), { channel: "range" });
    lastHudKeyRef.current = "";
    rangeChallengeWasActiveRef.current = false;
    setRangeResult(null);
    setPvpError(null);
    setStarted(true);
    setGameOver(false);
    syncXrAfterModeStart(state);
    requestAimLock(state.renderer.domElement);
  }

  function syncXrAfterModeStart(state: GameState) {
    if (!state.xr?.presenting) return;
    state.xr.menu.hide();
    state.xr.hud.setVisible(true);
    state.xr.rig.syncFromPlayer(state.player.position, state.yaw);
    attachWeaponsToGrip(state.xr, state.weaponViews, state.activeWeapon);
  }

  function refreshAlliedNpcs(state: GameState) {
    if (state.activeSceneId !== "compound") {
      resetAlliedNpcSession(state.alliedNpcState);
      return;
    }
    ensureAlliedNpcs(state.alliedNpcState, buildAlliedNpcContext(state));
  }

  function startMission() {
    const state = gameRef.current;
    if (!state) return;
    const sceneId = selectedScene;
    const forceExtract =
      sceneId === "compound" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("forceExtract");

    disconnectPvp();
    clearRemotePlayers(state);
    disposeShootingRange(state);
    state.audio.stopRangeAudio();
    state.audio.setGameMode("solo");
    state.gameMode = "solo";
    state.difficulty = selectedDifficulty;
    state.pvpAlive = true;
    state.pvpRespawnBanner = "";
    state.pvpKills = 0;
    state.pvpDeaths = 0;
    state.running = true;
    state.extractSucceeded = false;
    state.extractCinematic = false;
    activateCombatScene(state, sceneId);
    resetLoadout(state);
    state.score = 0;
    state.wave = forceExtract ? 14 : 1;
    state.sessionKills = 0;
    state.killStreak = 0;
    state.bestStreak = 0;
    state.medkits = 2;
    state.missionStartedAt = state.clock.getElapsed();
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 3;
    state.enemyVolleyCooldown = 1.25;
    state.enemyGrenadeLockUntil = state.clock.getElapsed() + 18;
    state.playerStationarySec = 0;
    state.audio.unlock();
    state.audio.setMuted(audioMuted);
    state.audio.setVolumes({
      master: settings.masterVolume,
      sfx: settings.sfxVolume,
      radio: settings.radioVolume,
    });
    state.settings = settings;
    state.camera.fov = settings.fov;
    if (!isXrPresenting(state.renderer, state.xr)) {
      state.camera.updateProjectionMatrix();
    }
    state.audio.playRadio(forceExtract ? extractInboundLine() : missionStartLine(), {
      channel: "mission",
    });
    state.nextRadioAt = 16 + Math.random() * 8;
    state.nextDistantFireAt = 6;
    state.nextCalloutAt = 5;
    state.nextPressureSpawnAt = 7 + Math.random() * 3;
    state.battlefieldChaos = initBattlefieldChaos();
    state.battlefieldChaos.active = true;
    state.announcedWave = forceExtract ? 14 : 1;
    const spawn =
      sceneId === "compound"
        ? { x: forceExtract ? -18 : 0, z: forceExtract ? 8 : 10, yaw: 0 }
        : {
            x: state.altSceneSession?.playerStart.x ?? 0,
            z: state.altSceneSession?.playerStart.z ?? 10,
            yaw: state.altSceneSession?.playerStart.yaw ?? 0,
          };
    state.player.position.set(spawn.x, 0, spawn.z);
    state.player.userData.baseY = 0;
    state.yaw = spawn.yaw;
    state.lastPlayerX = spawn.x;
    state.lastPlayerZ = spawn.z;
    state.pitch = 0;
    state.contactUntil = 0;
    state.lastDamageBearing = null;
    state.crouching = false;
    state.dyingEnemies = [];
    resetAlliedNpcSession(state.alliedNpcState);
    refreshAlliedNpcs(state);
    if (sceneId === "compound" && state.pickups) resetPickupSession(state.pickups);
    clearAllEnemies(state);
    if (forceExtract) {
      // Ensure extract mission even if pool rotation changes.
      state.coverPoints = buildCoverPointsFromColliders(state.colliders);
      const token = (state.waveContentToken = (state.waveContentToken || 0) + 1);
      void (async () => {
        await waitForEnemyTemplate(state);
        if (state.disposed || !state.running || state.waveContentToken !== token) return;
        const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
        const count = waveEnemyTarget(state.wave, diff.enemyCountMul);
        for (let i = 0; i < count; i += 1) {
          try {
            spawnEnemy(state);
          } catch (err) {
            console.warn("[BDS] spawnEnemy failed", err);
          }
        }
        state.squads = assignSquads(state.enemies);
        state.activeMission = createExtractionMission();
        state.extractAnnouncedPhase = -1;
        state.extractReinforceAt = state.clock.getElapsed() + 6;
        if (state.extractionHeli) resetExtractionHelicopter(state.extractionHeli);
        syncMissionMarkers(state);
        setMissionBanner("EXTRACT AUTHORIZED — Reach the amber LZ and hold for the bird");
        window.setTimeout(() => setMissionBanner(""), 5200);
      })();
    } else {
      scheduleWaveContent(state);
    }
    const nextProg = { ...progression, preferredDifficulty: selectedDifficulty };
    saveProgression(nextProg);
    setProgression(nextProg);
    lastHudKeyRef.current = "";
    setPvpError(null);
    setStarted(true);
    setGameOver(false);
    setMissionOutcome(null);
    syncXrAfterModeStart(state);
    requestAimLock(state.renderer.domElement);
  }

  function beginPvpSession(spawnX: number, spawnZ: number) {
    const state = gameRef.current;
    if (!state) return;
    clearAllEnemies(state);
    disposeShootingRange(state);
    state.audio.stopRangeAudio();
    state.audio.setGameMode("pvp");
    state.gameMode = "pvp";
    state.running = true;
    state.pvpAlive = true;
    state.pvpRespawnBanner = "";
    state.pvpKills = 0;
    state.pvpDeaths = 0;
    state.score = 0;
    state.wave = 0;
    state.killStreak = 0;
    state.bestStreak = 0;
    state.medkits = 2;
    state.missionStartedAt = state.clock.getElapsed();
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 0;
    state.enemyVolleyCooldown = 0;
    state.enemyGrenadeLockUntil = 0;
    state.playerStationarySec = 0;
    state.lastPlayerX = spawnX;
    state.lastPlayerZ = spawnZ;
    state.nextRadioAt = Number.POSITIVE_INFINITY;
    resetLoadout(state);
    state.player.position.set(spawnX, 0, spawnZ);
    state.player.userData.baseY = 0;
    state.yaw = 0;
    state.pitch = 0;
    state.audio.unlock();
    state.audio.setMuted(audioMuted);
    state.audio.playRadio(pvpStartLine(), {
      channel: "pvp",
    });
    lastHudKeyRef.current = "";
    setPvpConnecting(false);
    setPvpError(null);
    setStarted(true);
    setGameOver(false);
    requestAimLock(state.renderer.domElement);
  }

  function startPvpMultiplayer() {
    const state = gameRef.current;
    if (!state || pvpConnecting) return;
    setPvpError(null);
    setPvpConnecting(true);
    disconnectPvp();
    clearRemotePlayers(state);
    clearAllEnemies(state);

    const client = new PvpClient(
      {
        onStatus: (status, detail) => {
          if (status === "error" || status === "disconnected") {
            setPvpConnecting(false);
            if (detail) setPvpError(detail);
            if (status === "error") {
              const live = gameRef.current;
              if (live?.gameMode === "pvp" && !live.running) {
                // stay on menu
              }
            }
          }
          lastHudKeyRef.current = "";
        },
        onWelcome: (payload) => {
          beginPvpSession(payload.spawn.x, payload.spawn.z);
          for (const player of payload.players) {
            createRemoteAvatar(state, player.id, player.name).position.set(player.x, player.y, player.z);
          }
        },
        onPlayerJoined: (player) => {
          const live = gameRef.current;
          if (!live || live.gameMode !== "pvp") return;
          const avatar = createRemoteAvatar(live, player.id, player.name);
          avatar.position.set(player.x, player.y, player.z);
          avatar.userData.alive = player.alive;
          avatar.visible = player.alive;
        },
        onPlayerLeft: (id) => {
          const live = gameRef.current;
          if (!live) return;
          removeRemoteAvatar(live, id);
        },
        onDamage: (amount, _fromId, health) => {
          const live = gameRef.current;
          if (live) applyPvpDamage(live, amount, health);
        },
        onRemoteHealth: (id, health, alive) => {
          const live = gameRef.current;
          const avatar = live?.remotePlayers.get(id);
          if (!avatar) return;
          avatar.userData.health = health;
          avatar.userData.alive = alive;
          avatar.visible = alive;
        },
        onKill: (payload) => {
          const live = gameRef.current;
          if (!live) return;
          const localId = pvpClientRef.current?.getId();
          if (payload.killerId === localId) {
            live.pvpKills = payload.killerKills;
            live.score += 250;
            live.killStreak += 1;
            live.bestStreak = Math.max(live.bestStreak, live.killStreak);
          }
          if (payload.victimId === localId) {
            live.pvpDeaths = payload.victimDeaths;
          }
        },
        onStats: (kills, deaths) => {
          const live = gameRef.current;
          if (!live) return;
          live.pvpKills = kills;
          live.pvpDeaths = deaths;
        },
        onYouDied: (respawnInMs) => {
          const live = gameRef.current;
          if (!live) return;
          live.pvpAlive = false;
          live.health = 0;
          live.pvpRespawnBanner = `Downed — respawning in ${(respawnInMs / 1000).toFixed(1)}s`;
          if (document.pointerLockElement) document.exitPointerLock();
        },
        onRespawn: (x, z, health) => {
          const live = gameRef.current;
          if (!live) return;
          live.pvpAlive = true;
          live.health = health;
          live.pvpRespawnBanner = "";
          resetLoadout(live);
          live.health = health;
          live.player.position.set(x, 0, z);
          live.medkits = Math.max(live.medkits, 1);
          requestAimLock(live.renderer.domElement);
        },
        onRemoteRespawn: (id, x, z, health) => {
          const live = gameRef.current;
          if (!live) return;
          const avatar = live.remotePlayers.get(id) || createRemoteAvatar(live, id, id);
          avatar.position.set(x, 0, z);
          avatar.userData.alive = true;
          avatar.userData.health = health;
          avatar.visible = true;
        },
        onMatchOver: (payload) => {
          const live = gameRef.current;
          if (!live) return;
          live.pvpRespawnBanner = `Match over — Team ${payload.winnerTeam + 1} wins (${payload.teamScores[0]}-${payload.teamScores[1]})`;
          live.audio.playRadio(pvpMatchOverLine(payload.winnerTeam, payload.teamScores[0], payload.teamScores[1]), {
            channel: "pvp",
          });
        },
      },
      { room: pvpRoomInput.trim() || DEFAULT_PVP_ROOM },
    );
    pvpClientRef.current = client;
    client.connect();
  }

  // Global input listeners bind once; handlers reach live game state through refs.
  useEffect(() => {
    runSmokeTests();
    const down = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " ";
      const key = isSpace ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[key] = true;
      const state = gameRef.current;
      if (state?.running && !e.repeat) {
        if (key === "1") switchWeapon(state, "m4");
        if (key === "2") switchWeapon(state, "smg");
        if (key === "3") switchWeapon(state, "pistol");
        if (key === "q") switchWeapon(state, nextWeapon(state.activeWeapon));
        if (key === "g") throwPlayerGrenade(state);
        if (isSpace) {
          // Sticky pulse so brief taps register even if keyup beats the next frame.
          keysRef.current.__spacePulse = true;
          if (!WEAPONS[state.activeWeapon].automatic) {
            const ammoBefore = state.ammo;
            const cdBefore = state.fireCooldown;
            const reloadBefore = state.reload;
            shoot(state);
            const accepted = state.ammo < ammoBefore || state.reload !== reloadBefore || state.fireCooldown > cdBefore;
            if (accepted) {
              keysRef.current.__spacePulse = false;
              state.triggerLatched = true;
            }
          }
        }
      }
      if (state?.running && key === "r") beginReload(state);
      if (state?.running && (key === "Escape" || e.code === "Escape") && state.gameMode === "range") {
        leaveShootingRange();
        e.preventDefault();
      }
      if (
        state?.running &&
        state.gameMode === "range" &&
        state.shootingRange &&
        key === "t" &&
        !e.repeat &&
        !keysRef.current.__challengeHeld
      ) {
        keysRef.current.__challengeHeld = true;
        if (!state.shootingRange.stats.challengeActive && !state.shootingRange.stats.lastResult) {
          state.shootingRange.startChallenge();
          setRangeResult(null);
          state.audio.playRangeChallengeBeep("start");
          state.audio.playRadio(rangeChallengeStartLine(), {
            channel: "range",
          });
        }
      }
      if (state?.running && key === "f" && !keysRef.current.__medkitHeld) {
        if (gameRef.current && consumeMedkit(gameRef.current)) keysRef.current.__medkitHeld = true;
      }
      if (isSpace) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " ";
      const key = isSpace ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[key] = false;
      if (key === "t") keysRef.current.__challengeHeld = false;
      if (key === "f") keysRef.current.__medkitHeld = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Game bootstrap runs once per mount; the loop reads live state, not render closures.
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;
    const state = makeGame(container);
    gameRef.current = state;

    state.xr = createXRRuntime(state.renderer, state.scene, state.camera, container, {
      onPresentingChange: (presenting) => {
        xrPresentingRef.current = presenting;
        setXrPresenting(presenting);
        if (presenting) {
          state.quality.setTier("xr", xrGraphicsConfig().pixelRatioCap);
          setAtmosphereLowPower(state.atmosphere, true);
          if (document.pointerLockElement) document.exitPointerLock();
          state.xr?.rig.syncFromPlayer(state.player.position, state.yaw);
          if (!state.running) state.xr?.menu.showMain();
          else {
            state.xr?.menu.hide();
            state.xr?.hud.setVisible(true);
          }
          // QA: ?autoSolo=1 starts compound shortly after immersive present (Quest playtest).
          try {
            if (
              !state.running &&
              typeof window !== "undefined" &&
              new URLSearchParams(window.location.search).has("autoSolo")
            ) {
              window.setTimeout(() => {
                if (!gameRef.current?.xr?.presenting || gameRef.current.running) return;
                xrMenuHandlerRef.current("solo");
              }, 1400);
            }
          } catch {
            /* ignore */
          }
        } else if (state.xr) {
          detachWeaponsFromGrip(state.xr, state.camera, state.weaponViews);
          const mobile = isTouchDevice();
          state.quality.setTier(
            mobile ? "mobile" : "desktop",
            mobile ? 1.25 : graphicsConfig(state.settings.graphics).pixelRatioCap,
          );
          setAtmosphereLowPower(state.atmosphere, mobile || state.settings.graphics === "low");
        }
      },
      onMenuAction: (action) => xrMenuHandlerRef.current(action),
    });

    const onResize = () => {
      if (state.renderer.xr.isPresenting) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      state.camera.aspect = width / height;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(width, height);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) e.preventDefault();
      if (state.running && document.pointerLockElement !== state.renderer.domElement) {
        requestAimLock(state.renderer.domElement);
      }
      mouseRef.current.dragging = true;
      if (e.button === 0) mouseRef.current.firing = true;
      if (e.button === 2 && state.running) state.adsHeld = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onMouseUp = (e: MouseEvent) => {
      mouseRef.current.dragging = false;
      if (e.button === 0) mouseRef.current.firing = false;
      if (e.button === 2) state.adsHeld = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onMouseMove = (e: MouseEvent) => {
      if (isXrPresenting(state.renderer, state.xr)) return;
      const locked = document.pointerLockElement === state.renderer.domElement;
      if (locked) {
        const adsScale = THREE.MathUtils.lerp(1, ADS_SENSITIVITY_MULTIPLIER, state.adsBlend);
        const sens = 0.0022 * (gameRef.current?.settings.mouseSensitivity || 1) * adsScale;
        const invert = gameRef.current?.settings.invertY ? -1 : 1;
        state.yaw -= e.movementX * sens;
        state.pitch -= e.movementY * sens * 0.9 * invert;
        state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.45);
        return;
      }
      if (!mouseRef.current.dragging) return;
      const dx = e.clientX - mouseRef.current.lastX;
      const dy = e.clientY - mouseRef.current.lastY;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      const adsScale = THREE.MathUtils.lerp(1, ADS_SENSITIVITY_MULTIPLIER, state.adsBlend);
      const sens = 0.004 * (gameRef.current?.settings.mouseSensitivity || 1) * adsScale;
      const invert = gameRef.current?.settings.invertY ? -1 : 1;
      state.yaw -= dx * sens;
      state.pitch -= dy * sens * 0.75 * invert;
      state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.45);
    };
    const onClick = () => {
      if (performance.now() - mobileInputRef.current.lastTouchAt < 700) return;
      if (state.running && document.pointerLockElement !== state.renderer.domElement) {
        requestAimLock(state.renderer.domElement);
      }
      if (!WEAPONS[state.activeWeapon].automatic) shoot(state);
    };
    const onWheel = (e: WheelEvent) => {
      if (!state.running || e.deltaY === 0) return;
      switchWeapon(state, nextWeapon(state.activeWeapon));
    };

    const onTouchPointerDown = (e: PointerEvent) => {
      if (isXrPresenting(state.renderer, state.xr)) return;
      if (e.pointerType !== "touch" || e.clientX < window.innerWidth * 0.44) return;
      e.preventDefault();
      mobileInputRef.current.lastTouchAt = performance.now();
      mobileInputRef.current.lookPointerId = e.pointerId;
      mobileInputRef.current.lookX = e.clientX;
      mobileInputRef.current.lookY = e.clientY;
      state.renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onTouchPointerMove = (e: PointerEvent) => {
      if (isXrPresenting(state.renderer, state.xr)) return;
      if (e.pointerType !== "touch" || mobileInputRef.current.lookPointerId !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - mobileInputRef.current.lookX;
      const dy = e.clientY - mobileInputRef.current.lookY;
      mobileInputRef.current.lookX = e.clientX;
      mobileInputRef.current.lookY = e.clientY;
      const adsScale = THREE.MathUtils.lerp(1, ADS_SENSITIVITY_MULTIPLIER, state.adsBlend);
      const sensitivity = state.settings.mouseSensitivity * adsScale;
      state.yaw -= dx * 0.004 * sensitivity;
      state.pitch -= dy * 0.003 * sensitivity * (state.settings.invertY ? -1 : 1);
      state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.45);
    };
    const onTouchPointerEnd = (e: PointerEvent) => {
      if (mobileInputRef.current.lookPointerId !== e.pointerId) return;
      mobileInputRef.current.lookPointerId = null;
      mobileInputRef.current.lastTouchAt = performance.now();
    };
    const preventGesture = (e: Event) => {
      if (state.running) e.preventDefault();
    };
    const onGlobalPointerEnd = (e: PointerEvent) => {
      if (mobileInputRef.current.firePointerId !== e.pointerId) return;
      mobileInputRef.current.firePointerId = null;
      mouseRef.current.firing = false;
    };

    window.addEventListener("resize", onResize);
    state.renderer.domElement.addEventListener("mousedown", onMouseDown);
    state.renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    state.renderer.domElement.addEventListener("click", onClick);
    state.renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    state.renderer.domElement.addEventListener("pointerdown", onTouchPointerDown);
    state.renderer.domElement.addEventListener("pointermove", onTouchPointerMove);
    state.renderer.domElement.addEventListener("pointerup", onTouchPointerEnd);
    state.renderer.domElement.addEventListener("pointercancel", onTouchPointerEnd);
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    window.addEventListener("pointerup", onGlobalPointerEnd, true);
    window.addEventListener("pointercancel", onGlobalPointerEnd, true);

    let xrFrameCount = 0;
    const animate = () => {
      if (state.disposed) return;
      try {
        const gl = state.renderer.getContext() as WebGLRenderingContext & { isContextLost?: () => boolean };
        if (gl?.isContextLost?.()) return;

        const presenting = Boolean(state.xr?.presenting || state.renderer.xr.isPresenting);
        // XR: tighter dt cap so a dropped frame cannot become a multi-meter locomote jump.
        state.clock.update();
        const dt = Math.min(presenting ? 0.022 : 0.033, state.clock.getDelta());
        if (state.running || presenting) updateGame(state, dt);
        // Keep extract bird animating through approach / depart after run end.
        if (state.extractionHeli && state.extractionHeli.phase !== "hidden") {
          const mission = state.activeMission;
          const extract = mission?.type === "extraction" ? mission : null;
          updateExtractionHelicopter(state.extractionHeli, {
            dt,
            holdProgress: extract?.progress ?? (state.extractSucceeded ? 1 : 0),
            readyToBoard: Boolean(extract && extract.phase >= 2) || state.extractSucceeded,
            extracted: state.extractSucceeded,
            fxScale: state.quality.getFxScale(),
            playerX: state.player.position.x,
            playerZ: state.player.position.z,
          });
          if (state.extractCinematic) {
            updateExtractCinematicCamera(state, dt);
          }
          if (presenting) {
            state.audio.setRotorAudio(
              heliAudioProximity(state.extractionHeli, state.player.position.x, state.player.position.z),
            );
          }
        } else if (state.extractionHeli) {
          if (state.extractCinematic) {
            finishExtractCinematic(state);
          }
          state.audio.stopRotorAudio();
        }
        state.mixers.forEach((mixer) => {
          const root = mixer.getRoot?.() as THREE.Object3D | undefined;
          if (root?.userData?.enemy) {
            const dx = root.position.x - state.player.position.x;
            const dz = root.position.z - state.player.position.z;
            const distSq = dx * dx + dz * dz;
            // Far enemy clips at half rate — big CPU win with little visual cost.
            if (distSq > 28 * 28 && (xrFrameCount & 1) === 1) return;
          }
          mixer.update(dt);
        });
        // Atmosphere every other frame on XR always; on desktop when under load (fxScale).
        xrFrameCount += 1;
        const atmoStride = presenting || state.quality.getFxScale() < 0.85 ? 2 : 1;
        if (xrFrameCount % atmoStride === 0) {
          updateAtmosphereSystem(state.atmosphere, state.scene, state.clock.getElapsed(), dt * atmoStride);
        }
        if (state.renderer.shadowMap.enabled && xrFrameCount % 3 === 0) {
          state.renderer.shadowMap.needsUpdate = true;
        }
        state.renderer.render(state.scene, state.camera);
      } catch (error) {
        // Never let a single frame exception kill the XR animation loop (frozen HMD).
        console.warn("[BDS] XR/frame update error", error);
      }
    };
    state.renderer.setAnimationLoop(animate);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("[BDS] WebGL context lost — ending XR session if active");
      void endXRSession(state.renderer).catch(() => undefined);
    };
    const onContextRestored = () => {
      console.warn("[BDS] WebGL context restored — reload recommended for VR");
    };
    state.renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    state.renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

    return () => {
      state.disposed = true;
      state.clock.disconnect();
      const win = window as unknown as { __darkSector?: GameState };
      if (win.__darkSector === state) delete win.__darkSector;
      state.renderer.setAnimationLoop(null);
      if (state.xr) {
        disposeXRRuntime(state.xr, state.renderer, state.scene, state.camera, state.weaponViews);
        state.xr = null;
      }
      state.renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      state.renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("resize", onResize);
      state.renderer.domElement.removeEventListener("mousedown", onMouseDown);
      state.renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      state.renderer.domElement.removeEventListener("click", onClick);
      state.renderer.domElement.removeEventListener("wheel", onWheel);
      state.renderer.domElement.removeEventListener("pointerdown", onTouchPointerDown);
      state.renderer.domElement.removeEventListener("pointermove", onTouchPointerMove);
      state.renderer.domElement.removeEventListener("pointerup", onTouchPointerEnd);
      state.renderer.domElement.removeEventListener("pointercancel", onTouchPointerEnd);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("pointerup", onGlobalPointerEnd, true);
      window.removeEventListener("pointercancel", onGlobalPointerEnd, true);
      disconnectPvp();
      clearRemotePlayers(state);
      disposeShootingRange(state);
      if (state.extractionHeli) {
        disposeExtractionHelicopter(state.extractionHeli, state.scene);
        state.extractionHeli = null;
      }
      state.audio.stopRotorAudio();
      state.audio.dispose();
      state.renderer.dispose();
      if (state.renderer.domElement.parentElement) state.renderer.domElement.parentElement.removeChild(state.renderer.domElement);
    };
  }, []);

  xrMenuHandlerRef.current = (action) => {
    const state = gameRef.current;
    if (!state?.xr) return;
    switch (action) {
      case "solo":
        state.xr.menu.hide();
        state.xr.hud.setVisible(true);
        startMission();
        break;
      case "range":
        state.xr.menu.hide();
        state.xr.hud.setVisible(true);
        startShootingRange();
        break;
      case "resume":
        state.xr.menu.hide();
        state.xr.hud.setVisible(true);
        break;
      case "settings": {
        const order: Array<30 | 45 | 90> = [30, 45, 90];
        const idx = Math.max(0, order.indexOf(state.settings.snapTurnDegrees));
        const nextDeg = order[(idx + 1) % order.length];
        const next = {
          ...state.settings,
          snapTurnDegrees: nextDeg,
          comfortVignette: !state.settings.comfortVignette,
        };
        state.settings = next;
        setSettings(next);
        saveSettings(next);
        setUnlockToast(`VR · snap ${nextDeg}° · vignette ${next.comfortVignette ? "on" : "off"}`);
        window.setTimeout(() => setUnlockToast(""), 2500);
        break;
      }
      case "exitVr":
        void endXRSession(state.renderer);
        break;
      case "close":
        state.xr.menu.hide();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="relative h-[100dvh] w-full select-none overflow-hidden overscroll-none bg-black text-white touch-none"
      data-active-weapon={hud.activeWeapon}
      data-ads={hud.aiming ? "true" : "false"}
      data-xr={xrPresenting ? "true" : "false"}
      onContextMenu={(e) => {
        if (started) e.preventDefault();
      }}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <div ref={mountRef} className="absolute inset-0 touch-none" data-testid="game-canvas" />
      {!xrPresenting && touchDevice && started && !gameOver ? (
        <>
          <button
            type="button"
            aria-label={audioMuted ? "Unmute game audio" : "Mute game audio"}
            aria-pressed={audioMuted}
            data-hud-zone="utilities"
            onClick={() => {
              const nextMuted = !audioMuted;
              setAudioMuted(nextMuted);
              gameRef.current?.audio.setMuted(nextMuted);
            }}
            className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(6.35rem,env(safe-area-inset-top)+6.35rem)] z-30 border border-slate-300/25 bg-black/70 px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-300 backdrop-blur hover:bg-slate-900 landscape:top-[max(4.85rem,env(safe-area-inset-top)+4.85rem)]"
          >
            Audio {audioMuted ? "off" : "on"}
          </button>
          <button
            type="button"
            data-hud-zone="utilities"
            onClick={() => setShowSettings((v) => !v)}
            className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(6.35rem,env(safe-area-inset-top)+6.35rem)] z-30 border border-slate-300/25 bg-black/70 px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-300 backdrop-blur hover:bg-slate-900 landscape:top-[max(4.85rem,env(safe-area-inset-top)+4.85rem)]"
          >
            Settings
          </button>
        </>
      ) : null}
      {!xrPresenting && !(touchDevice && started && !gameOver) ? (
        <div className={`absolute z-30 flex flex-col gap-1.5 ${touchDevice ? "left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] items-start" : "right-4 top-[9.75rem] items-end"}`} data-hud-zone="utilities">
          <button
            type="button"
            aria-label={audioMuted ? "Unmute game audio" : "Mute game audio"}
            aria-pressed={audioMuted}
            onClick={() => {
              const nextMuted = !audioMuted;
              setAudioMuted(nextMuted);
              gameRef.current?.audio.setMuted(nextMuted);
            }}
            className="border border-slate-300/25 bg-black/70 px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-300 backdrop-blur hover:bg-slate-900 md:text-[9px]"
          >
            Audio {audioMuted ? "off" : "on"}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="border border-slate-300/25 bg-black/70 px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-300 backdrop-blur hover:bg-slate-900 md:text-[9px]"
          >
            Settings
          </button>
        </div>
      ) : null}

      {!xrPresenting && hud.suppression > 0.05 ? (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            boxShadow: `inset 0 0 ${80 + hud.suppression * 120}px rgba(40,10,10,${hud.suppression})`,
          }}
        />
      ) : null}

      {!xrPresenting && (hud.missionBanner || missionBanner) ? (
        <div className="pointer-events-none absolute left-1/2 top-[max(11.25rem,24%)] z-30 w-[min(90vw,28rem)] -translate-x-1/2 border border-emerald-300/60 bg-black/80 px-5 py-3 text-center shadow-[0_0_32px_rgba(52,211,153,.25)]" data-hud-zone="banner">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-200">Objective Secured</div>
          <div className="mt-1 text-sm font-black text-white sm:text-base">{hud.missionBanner || missionBanner}</div>
        </div>
      ) : null}

      {!xrPresenting && !(hud.missionBanner || missionBanner) && (hud.unlockNotice || unlockToast) ? (
        <div className="pointer-events-none absolute left-1/2 top-[max(11.25rem,28%)] z-30 w-[min(90vw,24rem)] -translate-x-1/2 border border-cyan-300/50 bg-black/80 px-4 py-2 text-center" data-hud-zone="unlock">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-200">{hud.unlockNotice || unlockToast}</div>
        </div>
      ) : null}

      {!xrPresenting && hud.interactPrompt ? (
        <div className={`pointer-events-none absolute bottom-[max(7.5rem,22%)] left-1/2 z-30 w-[min(90vw,22rem)] -translate-x-1/2 border border-amber-300/55 bg-black/80 px-3 py-2 text-center backdrop-blur-sm ${settings.reduceMotion ? "" : "animate-pulse"}`} data-hud-zone="interact">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-100 sm:text-xs">
            <span className="mr-2 inline-block border border-amber-200/60 bg-amber-200/10 px-1.5 py-0.5 font-mono font-black">E</span>
            {hud.interactPrompt.replace(/^\[?E\]?\s*[·:-]?\s*/i, "")}
          </div>
        </div>
      ) : null}

      {!xrPresenting ? (
        <GameplayHud
          hud={hud}
          pvpRoom={pvpRoomInput || DEFAULT_PVP_ROOM}
          touchDevice={touchDevice}
          reduceMotion={settings.reduceMotion}
        />
      ) : null}

      {!xrPresenting && hud.aiming && hud.activeWeapon === "m4" ? (
        <div
          data-testid="rifle-scope-overlay"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[15] aspect-square w-[clamp(280px,62vmin,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-[clamp(12px,2.2vmin,28px)] border-[#080a0a] bg-[radial-gradient(circle,rgba(47,91,76,.08)_0%,rgba(12,30,24,.13)_58%,rgba(0,0,0,.42)_100%)] shadow-[0_0_0_200vmax_rgba(0,0,0,.83),inset_0_0_42px_14px_rgba(0,0,0,.88),0_0_18px_rgba(110,180,150,.18)]"
        >
          <div className="absolute inset-[4%] rounded-full border border-emerald-100/25" />
          <div className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-emerald-50/80 shadow-[0_0_3px_rgba(167,243,208,.8)]" />
          <div className="absolute left-[8%] top-1/2 h-px w-[84%] -translate-y-1/2 bg-emerald-50/80 shadow-[0_0_3px_rgba(167,243,208,.8)]" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-50/90" />
          {[38, 44, 56, 62].map((top) => (
            <div key={top} className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-50/80" style={{ top: `${top}%` }} />
          ))}
          <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-[0.25em] text-emerald-100/55">
            {RIFLE_SCOPE_MAGNIFICATION.toFixed(1)}×
          </div>
        </div>
      ) : null}

      {!xrPresenting && hud.aiming && hud.activeWeapon === "pistol" ? (
        <div data-testid="pistol-iron-sight" className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-16 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute bottom-0 left-0 h-5 w-1.5 bg-slate-950 ring-1 ring-slate-300/70" />
          <div className="absolute bottom-0 right-0 h-5 w-1.5 bg-slate-950 ring-1 ring-slate-300/70" />
          <div className="absolute bottom-0 left-1/2 h-3 w-1 -translate-x-1/2 bg-slate-950 ring-1 ring-slate-200/80" />
        </div>
      ) : !xrPresenting && !hud.aiming ? (
        <>
          {hud.spreadRing > 0.06 ? (
            <div
              data-testid="combat-spread-ring"
              className="pointer-events-none absolute left-1/2 top-1/2 z-[19] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e7eadf]/40 transition-all duration-75"
              style={{
                width: `${36 + hud.spreadRing * 52}px`,
                height: `${36 + hud.spreadRing * 52}px`,
                opacity: 0.28 + hud.spreadRing * 0.42,
              }}
            />
          ) : null}
          <div
            data-testid="combat-crosshair"
            className={`pointer-events-none absolute left-1/2 top-1/2 z-20 h-9 w-9 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] transition-transform duration-75 ${
              hitMarker === "kill" ? "scale-150" : hitMarker ? "scale-125" : ""
            }`}
          >
            <div
              className={`absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 border-y border-black/55 ${
                hitMarker === "kill"
                  ? "bg-white"
                  : hitMarker === "armor"
                    ? "bg-amber-300"
                    : hitMarker
                      ? "bg-rose-300"
                      : "bg-[#e7eadf]"
              }`}
            />
            <div
              className={`absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 border-y border-black/55 ${
                hitMarker === "kill"
                  ? "bg-white"
                  : hitMarker === "armor"
                    ? "bg-amber-300"
                    : hitMarker
                      ? "bg-rose-300"
                      : "bg-[#e7eadf]"
              }`}
            />
            <div
              className={`absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 border-x border-black/55 ${
                hitMarker === "kill"
                  ? "bg-white"
                  : hitMarker === "armor"
                    ? "bg-amber-300"
                    : hitMarker
                      ? "bg-rose-300"
                      : "bg-[#e7eadf]"
              }`}
            />
            <div
              className={`absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 border-x border-black/55 ${
                hitMarker === "kill"
                  ? "bg-white"
                  : hitMarker === "armor"
                    ? "bg-amber-300"
                    : hitMarker
                      ? "bg-rose-300"
                      : "bg-[#e7eadf]"
              }`}
            />
            <div
              className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/80 ${
                hitMarker === "kill"
                  ? "bg-white"
                  : hitMarker === "armor"
                    ? "bg-amber-200"
                    : hitMarker
                      ? "bg-rose-300"
                      : "bg-[#dce2cf]"
              }`}
            />
            {hitMarker === "kill" ? (
              <div className="absolute inset-[-10px] rounded-full border-2 border-white/95 shadow-[0_0_12px_rgba(255,255,255,.55)]" />
            ) : hitMarker === "armor" ? (
              <div className="absolute inset-[-6px] rounded-full border-2 border-amber-400/90" />
            ) : hitMarker ? (
              <div className="absolute inset-[-6px] rounded-full border-2 border-rose-400/90" />
            ) : null}
          </div>
        </>
      ) : null}

      {!xrPresenting && hud.contact && !(hud.missionBanner || missionBanner) ? (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 text-center ${
            touchDevice
              ? "top-[max(8.5rem,env(safe-area-inset-top)+8.5rem)] landscape:top-[max(6.75rem,env(safe-area-inset-top)+6.75rem)]"
              : "top-[10.5rem]"
          }`}
          data-hud-zone="contact"
        >
          <div className={`border-x border-amber-300/60 bg-black/70 px-3 py-1 text-[10px] font-black tracking-[0.3em] text-amber-100 ${settings.reduceMotion ? "" : "animate-pulse"}`}>
            {hud.contact}
          </div>
          <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-200">
            Incoming · {hud.damageBearing || "front"}
          </div>
        </div>
      ) : null}

      {!xrPresenting && hud.damageBearing === "left" ? (
        <div className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2 border-l-4 border-rose-400 pl-2 text-2xl font-black text-rose-300">‹</div>
      ) : null}
      {!xrPresenting && hud.damageBearing === "right" ? (
        <div className="pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2 border-r-4 border-rose-400 pr-2 text-2xl font-black text-rose-300">›</div>
      ) : null}
      {!xrPresenting && hud.damageBearing === "rear" ? (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-30 -translate-x-1/2 border border-rose-400/70 bg-black/70 px-3 py-1 text-[10px] font-black tracking-[0.3em] text-rose-200">
          REAR
        </div>
      ) : null}

      {started && !gameOver && hud.gameMode === "range" && rangeResult ? (
        <RangeChallengeResultCard
          result={rangeResult}
          onDismiss={() => {
            const state = gameRef.current;
            state?.shootingRange?.clearLastResult();
            setRangeResult(null);
            if (state) requestAimLock(state.renderer.domElement);
          }}
        />
      ) : null}

      {!xrPresenting && started && !gameOver ? (
        <>
          {hud.gameMode === "range" ? (
            <button
              type="button"
              onClick={leaveShootingRange}
              data-hud-zone="leave-range"
              className="absolute right-4 top-[13.5rem] z-30 rounded border border-emerald-300/40 bg-black/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 backdrop-blur hover:bg-emerald-950/80"
            >
              Leave Range
            </button>
          ) : null}
          {touchDevice ? (
          <div className="absolute inset-0 z-30" style={{ pointerEvents: "none" }} data-testid="mobile-controls">
            <div
              ref={joystickRef}
              data-testid="movement-joystick"
              aria-label="Movement joystick"
              role="application"
              className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] h-28 w-28 rounded-full border-2 border-cyan-100/35 bg-black/35 shadow-[inset_0_0_28px_rgba(34,211,238,.12)] touch-none landscape:h-24 landscape:w-24"
              style={{ pointerEvents: "auto" }}
              onPointerDown={updateJoystick}
              onPointerMove={(e) => {
                if (joystickPointerRef.current === e.pointerId) updateJoystick(e);
              }}
              onPointerUp={releaseJoystick}
              onPointerCancel={releaseJoystick}
              onLostPointerCapture={() => releaseJoystick()}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/70 bg-cyan-200/25 shadow-[0_0_18px_rgba(34,211,238,.35)]"
                style={{ transform: `translate(calc(-50% + ${joystickKnob.x}px), calc(-50% + ${joystickKnob.y}px))` }}
              />
            </div>

            <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] flex flex-col items-center gap-1.5" style={{ pointerEvents: "auto" }}>
              <button
                type="button"
                data-testid="mobile-aim"
                aria-label="Toggle aim down sights"
                aria-pressed={hud.aiming}
                className={`flex h-14 w-14 items-center justify-center rounded-full border text-[10px] font-black shadow-xl ${hud.aiming ? "border-amber-100 bg-amber-200 text-slate-950" : "border-amber-200/60 bg-black/70 text-amber-100"}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const state = gameRef.current;
                  if (state) state.adsHeld = !state.adsHeld;
                }}
              >
                AIM
              </button>
              <button
                type="button"
                data-testid="mobile-fire"
                aria-label="Fire weapon"
                className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-cyan-300 text-xs font-black text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.45)] touch-none"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const state = gameRef.current;
                  if (!state) return;
                  mobileInputRef.current.firePointerId = e.pointerId;
                  mouseRef.current.firing = true;
                  if (!WEAPONS[state.activeWeapon].automatic) {
                    shoot(state);
                    state.triggerLatched = true;
                  }
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  if (mobileInputRef.current.firePointerId !== e.pointerId) return;
                  mobileInputRef.current.firePointerId = null;
                  mouseRef.current.firing = false;
                }}
                onPointerCancel={() => {
                  mobileInputRef.current.firePointerId = null;
                  mouseRef.current.firing = false;
                }}
                onLostPointerCapture={() => {
                  mobileInputRef.current.firePointerId = null;
                  mouseRef.current.firing = false;
                }}
              >
                FIRE
              </button>
            </div>

            <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] left-[calc(env(safe-area-inset-left)+0.75rem)] right-[calc(env(safe-area-inset-right)+6.5rem)] flex items-center justify-center gap-1.5 landscape:bottom-[calc(env(safe-area-inset-bottom)+6.35rem)] landscape:right-[calc(env(safe-area-inset-right)+5.75rem)]" style={{ pointerEvents: "auto" }} data-hud-zone="mobile-actions">
              {[
                ["RLD", "Reload weapon", () => gameRef.current && beginReload(gameRef.current)],
                ["SWAP", "Swap weapon", () => {
                  const state = gameRef.current;
                  if (state) switchWeapon(state, nextWeapon(state.activeWeapon));
                }],
                ["GRND", "Throw grenade", () => {
                  const state = gameRef.current;
                  if (state) throwPlayerGrenade(state);
                }],
                ["USE", "Interact", () => {
                  const state = gameRef.current;
                  if (state) state.interactPulse = true;
                }],
                ["CROUCH", "Toggle crouch", () => {
                  mobileInputRef.current.crouching = !mobileInputRef.current.crouching;
                }],
                ["MED", "Use medkit", () => {
                  const state = gameRef.current;
                  if (state) consumeMedkit(state);
                }],
              ].map(([label, ariaLabel, action]) => (
                <button
                  key={label as string}
                  type="button"
                  aria-label={ariaLabel as string}
                  data-testid={`mobile-${(label as string).toLowerCase()}`}
                  className="min-h-10 min-w-10 rounded border border-slate-200/45 bg-black/75 px-2 text-[8px] font-black tracking-wide text-slate-100 backdrop-blur touch-none"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (action as () => void)();
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>

            <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+0.35rem)] left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-bold uppercase tracking-wider text-white/55">
              Drag left to move · Swipe right to look
            </div>
          </div>
          ) : null}
        </>
      ) : null}

      {!xrPresenting && !started && !gameOver ? (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-[#060806]/88 backdrop-blur-[3px]">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(45,97,86,.22),transparent_34%),radial-gradient(circle_at_18%_82%,rgba(160,76,31,.14),transparent_32%),linear-gradient(115deg,rgba(2,5,3,.98)_15%,rgba(8,12,9,.78)_55%,rgba(3,5,4,.96))]" />
          <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/55 to-transparent" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent" />

          <main className="relative mx-auto flex min-h-full w-full max-w-7xl items-center px-4 py-5 sm:px-8 sm:py-8 lg:px-12">
            <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)] lg:gap-10">
              <section className="flex flex-col justify-center">
                <div className="mb-4 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.28em] text-cyan-100/75 sm:text-[11px]">
                  <span className="h-px w-8 bg-cyan-200/70 sm:w-12" />
                  Joint Operations Command
                  <span className="rounded-sm border border-amber-200/25 bg-amber-300/10 px-2 py-1 text-[8px] tracking-[0.18em] text-amber-100">Eyes Only</span>
                </div>

                <h1 className="max-w-4xl text-[clamp(3.15rem,10vw,7.75rem)] font-black uppercase leading-[0.78] tracking-[-0.065em] text-slate-100 drop-shadow-[0_12px_28px_rgba(0,0,0,.8)]">
                  Bradley&apos;s
                  <span className="mt-2 block text-cyan-100 [text-shadow:0_0_34px_rgba(103,232,249,.25)]">Dark Sector</span>
                </h1>

                <div className="mt-5 max-w-2xl border-l-2 border-amber-300/70 pl-4 sm:mt-7 sm:pl-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-200/85">{sceneMeta(selectedScene).subtitle}</div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
                    {sceneMeta(selectedScene).briefing}
                  </p>
                </div>

                <div className="mt-6 flex w-full max-w-sm flex-col gap-3 sm:mt-8">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Combat AO
                    <select
                      value={selectedScene}
                      onChange={(e) => setSelectedScene(e.target.value as CombatSceneId)}
                      data-testid="scene-select"
                      className="mt-1 w-full border border-slate-500/40 bg-black/70 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-100"
                    >
                      {COMBAT_SCENE_IDS.map((id) => (
                        <option key={id} value={id}>{sceneMeta(id).title}</option>
                      ))}
                    </select>
                  </label>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Quick load: add <span className="font-mono text-cyan-200/80">?scene=desert</span>,{" "}
                    <span className="font-mono text-cyan-200/80">urban</span>, or{" "}
                    <span className="font-mono text-cyan-200/80">mountain</span> to the URL.
                  </p>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Difficulty
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value as DifficultyId)}
                      className="mt-1 w-full border border-slate-500/40 bg-black/70 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-100"
                    >
                      {(Object.keys(DIFFICULTY) as DifficultyId[])
                        .filter((id) => progression.unlockedDifficulties.includes(id))
                        .map((id) => (
                          <option key={id} value={id}>{DIFFICULTY[id].label}</option>
                        ))}
                    </select>
                  </label>
                  <div className="text-[10px] text-slate-500">
                    Rank {rankFromXp(progression.xp).rank} · XP {progression.xp} · Best wave {progression.bestWave}
                  </div>
                  <button
                    type="button"
                    onClick={startMission}
                    className="group flex min-h-14 w-full items-center justify-between border border-cyan-100/60 bg-cyan-100 px-5 text-left text-slate-950 shadow-[0_0_36px_rgba(103,232,249,.16)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200 sm:min-h-16 sm:px-6"
                  >
                    <span>
                      <span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-slate-600">Solo · Clear hostiles</span>
                      <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.12em] sm:text-base">
                        Deploy — {sceneMeta(selectedScene).title}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-1">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={startShootingRange}
                    className="group flex min-h-14 w-full items-center justify-between border border-emerald-200/50 bg-emerald-200/90 px-5 text-left text-slate-950 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 sm:min-h-16 sm:px-6"
                  >
                    <span>
                      <span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-slate-700">Practice · No hostiles</span>
                      <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.12em] sm:text-base">Shooting Range</span>
                    </span>
                    <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-1">◎</span>
                  </button>
                  <div className="rounded border border-emerald-300/20 bg-black/40 px-3 py-2" data-testid="menu-range-badges">
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Range Qual · Best {loadBestChallengeScore()} · {badgeLabel(loadHighestBadge())}
                    </div>
                    <RangeBadgeRow unlocked={loadUnlockedBadges()} highest={loadHighestBadge()} compact />
                  </div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    PVP room
                    <input
                      value={pvpRoomInput}
                      onChange={(e) => setPvpRoomInput(e.target.value.slice(0, 24))}
                      className="mt-1 w-full border border-slate-500/40 bg-black/70 px-3 py-2 font-mono text-xs text-slate-100"
                      placeholder={DEFAULT_PVP_ROOM}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={startPvpMultiplayer}
                    disabled={pvpConnecting}
                    className="group flex min-h-14 w-full items-center justify-between border border-amber-200/50 bg-amber-200/90 px-5 text-left text-slate-950 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200 disabled:opacity-60 sm:min-h-16 sm:px-6"
                  >
                    <span>
                      <span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-slate-700">PVP Multiplayer</span>
                      <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.12em] sm:text-base">
                        {pvpConnecting ? "Linking…" : `Join ${pvpRoomInput || DEFAULT_PVP_ROOM}`}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-1">⇄</span>
                  </button>
                  {pvpError ? <p className="text-xs leading-relaxed text-rose-300">{pvpError}</p> : (
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      Local/LAN PVP: run <span className="font-mono text-cyan-200/80">npm run pvp</span>, then open two tabs and both join the same room.
                    </p>
                  )}
                </div>
              </section>

              <aside className="border border-slate-300/20 bg-black/45 shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-slate-300/15 px-4 py-3 sm:px-5">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">Pre-mission package</div>
                    <div className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-slate-100">Field Briefing</div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.9)]" />
                    Link Secure
                  </div>
                </div>

                <div className="grid grid-cols-3 border-b border-slate-300/15">
                  {[
                    ["Threat", "Severe"],
                    ["AO", sceneMeta(selectedScene).title],
                    ["Support", selectedScene === "compound" ? "Extract" : "Limited"],
                  ].map(([label, value]) => (
                    <div key={label} className="border-r border-slate-300/10 px-3 py-3 last:border-r-0 sm:px-4">
                      <div className="text-[8px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase text-slate-200 sm:text-xs">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="p-4 sm:p-5">
                  <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-amber-200/80">Primary directive</div>
                  <p className="mt-2 text-base font-bold leading-snug text-white sm:text-lg">{hud.objective}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">{hud.intel}</p>

                  <div className="mt-4 border-t border-slate-300/15 pt-4 sm:mt-5 sm:pt-5">
                    <div className="mb-3 text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500">Combat controls</div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs">
                      {[
                        ["WASD", "Move"],
                        ["Mouse", "Aim"],
                        ["RMB", "Aim down sights"],
                        ["Click / Space", "Fire"],
                        ["Shift", "Sprint"],
                        ["C", "Crouch"],
                        ["R", "Reload"],
                        ["E", "Interact / plant"],
                        ["1 / 2 / Q", "Swap weapon"],
                        ["F", "Use medkit"],
                      ].map(([key, action]) => (
                        <div key={key} className="flex items-center justify-between gap-2 border-b border-slate-400/10 pb-2">
                          <span className="font-mono text-[10px] font-bold text-cyan-100">{key}</span>
                          <span className="text-right text-[10px] uppercase tracking-wider text-slate-500">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex items-start gap-3 bg-amber-200/[0.06] p-3 text-[10px] leading-relaxed text-amber-100/70">
                    <span aria-hidden="true" className="mt-0.5 text-amber-300">▲</span>
                    Survive each wave to resupply ammunition and armor. Additional medkits are issued every second wave.
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      ) : null}

      {showSettings ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-slate-400/30 bg-[#0a0e0c] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-cyan-100">Settings</h2>
              <button type="button" className="text-xs uppercase tracking-widest text-slate-400" onClick={() => setShowSettings(false)}>Close</button>
            </div>
            <div className="grid gap-3 text-xs">
              <label className="flex items-center justify-between gap-3">
                <span>Mouse sensitivity</span>
                <input
                  type="range"
                  min={0.4}
                  max={2.2}
                  step={0.05}
                  value={settings.mouseSensitivity}
                  onChange={(e) => {
                    const next = { ...settings, mouseSensitivity: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>FOV</span>
                <input
                  type="range"
                  min={60}
                  max={90}
                  step={1}
                  value={settings.fov}
                  onChange={(e) => {
                    const next = { ...settings, fov: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) {
                      gameRef.current.settings = next;
                      if (!isXrPresenting(gameRef.current.renderer, gameRef.current.xr)) {
                        gameRef.current.camera.fov = next.fov;
                        gameRef.current.camera.updateProjectionMatrix();
                      }
                    }
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Master volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.masterVolume}
                  onChange={(e) => {
                    const next = { ...settings, masterVolume: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                    gameRef.current?.audio.setVolumes({ master: next.masterVolume, sfx: next.sfxVolume, radio: next.radioVolume });
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>SFX volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => {
                    const next = { ...settings, sfxVolume: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                    gameRef.current?.audio.setVolumes({ master: next.masterVolume, sfx: next.sfxVolume, radio: next.radioVolume });
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Graphics</span>
                <select
                  value={settings.graphics}
                  onChange={(e) => {
                    const next = { ...settings, graphics: e.target.value as GameSettings["graphics"] };
                    setSettings(next);
                    saveSettings(next);
                    const state = gameRef.current;
                    if (state) {
                      state.settings = next;
                      // Avoid DPR / shadow map thrash while an immersive session owns the framebuffer.
                      if (state.xr?.presenting || state.renderer.xr.isPresenting) return;
                      const mobile = isTouchDevice();
                      const gfx = graphicsConfig(mobile ? "low" : next.graphics);
                      state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.1 : gfx.pixelRatioCap));
                      state.renderer.shadowMap.enabled = Boolean(gfx.enableShadows) && !mobile;
                      state.renderer.shadowMap.type = THREE.BasicShadowMap;
                      state.quality.setShadowsPreferred(Boolean(gfx.enableShadows) && !mobile);
                      state.quality.setTier(
                        mobile ? "mobile" : "desktop",
                        mobile ? 1.1 : gfx.pixelRatioCap,
                      );
                      limitPointLights(state.scene, gfx.maxPointLights);
                      setAtmosphereLowPower(state.atmosphere, mobile || next.graphics === "low");
                      if (state.scene.fog instanceof THREE.FogExp2) state.scene.fog.density = gfx.fogDensity;
                      state.scene.traverse((obj) => {
                        if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
                          obj.shadow.mapSize.set(gfx.shadowMapSize, gfx.shadowMapSize);
                          obj.shadow.map?.dispose();
                          obj.shadow.map = null as unknown as THREE.WebGLRenderTarget;
                          obj.shadow.needsUpdate = true;
                        }
                      });
                    }
                  }}
                  className="bg-black/60 px-2 py-1"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Subtitles</span>
                <input
                  type="checkbox"
                  checked={settings.subtitles}
                  onChange={(e) => {
                    const next = { ...settings, subtitles: e.target.checked };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Reduce motion / shake</span>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => {
                    const next = { ...settings, reduceMotion: e.target.checked };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Invert Y</span>
                <input
                  type="checkbox"
                  checked={settings.invertY}
                  onChange={(e) => {
                    const next = { ...settings, invertY: e.target.checked };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <div className="mt-2 border-t border-slate-500/30 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                Quest / WebXR comfort
              </div>
              <label className="flex items-center justify-between gap-3">
                <span>Snap turn</span>
                <select
                  value={settings.snapTurnDegrees}
                  onChange={(e) => {
                    const next = {
                      ...settings,
                      snapTurnDegrees: Number(e.target.value) as 30 | 45 | 90,
                    };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                  className="bg-black/60 px-2 py-1"
                >
                  <option value={30}>30°</option>
                  <option value={45}>45°</option>
                  <option value={90}>90°</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>VR move speed</span>
                <input
                  type="range"
                  min={3.5}
                  max={6}
                  step={0.1}
                  value={settings.xrMoveSpeed}
                  onChange={(e) => {
                    const next = { ...settings, xrMoveSpeed: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Comfort vignette (pref)</span>
                <input
                  type="checkbox"
                  checked={settings.comfortVignette}
                  onChange={(e) => {
                    const next = { ...settings, comfortVignette: e.target.checked };
                    setSettings(next);
                    saveSettings(next);
                    if (gameRef.current) gameRef.current.settings = next;
                  }}
                />
              </label>
              <p className="text-[10px] leading-relaxed text-slate-500">
                Unlocks: {progression.unlockedAttachments.join(", ") || "redDot"}. Attachments apply from your saved loadout on next spawn.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {gameOver ? (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-[#070707]/90 backdrop-blur-[4px]">
          <div
            className={`pointer-events-none fixed inset-0 ${
              missionOutcome === "extracted"
                ? "bg-[radial-gradient(circle_at_50%_20%,rgba(52,211,153,.18),transparent_38%),linear-gradient(135deg,rgba(4,10,8,.96),rgba(6,10,8,.86),rgba(2,3,3,.98))]"
                : "bg-[radial-gradient(circle_at_50%_20%,rgba(159,35,35,.2),transparent_38%),linear-gradient(135deg,rgba(4,7,6,.96),rgba(10,7,6,.86),rgba(2,3,3,.98))]"
            }`}
          />
          <div
            className={`pointer-events-none fixed inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent to-transparent ${
              missionOutcome === "extracted" ? "via-emerald-400/70" : "via-rose-500/70"
            }`}
          />

          <main className="relative mx-auto flex min-h-full w-full max-w-4xl items-center px-4 py-6 sm:px-8 sm:py-10">
            <section className="w-full border border-slate-200/15 bg-black/50 shadow-[0_30px_100px_rgba(0,0,0,.7)] backdrop-blur-md">
              <div className={`border-b px-5 py-5 sm:px-8 sm:py-7 ${missionOutcome === "extracted" ? "border-emerald-300/20" : "border-rose-300/15"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div
                    className={`flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.28em] sm:text-[10px] ${
                      missionOutcome === "extracted" ? "text-emerald-300/85" : "text-rose-300/80"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shadow-[0_0_12px_rgba(52,211,153,.9)] ${
                        missionOutcome === "extracted" ? "bg-emerald-400" : "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.9)]"
                      }`}
                    />
                    After-action report
                  </div>
                  <div
                    className={`border px-3 py-1 text-[8px] font-bold uppercase tracking-[0.22em] ${
                      missionOutcome === "extracted"
                        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                        : "border-rose-300/20 bg-rose-400/10 text-rose-200"
                    }`}
                  >
                    {missionOutcome === "extracted" ? "Mission status · Extracted" : "Mission status · Failed"}
                  </div>
                </div>
                <h2 className="mt-5 text-[clamp(2.65rem,9vw,6.5rem)] font-black uppercase leading-[0.82] tracking-[-0.055em] text-slate-100">
                  {missionOutcome === "extracted" ? (
                    <>
                      Bird
                      <span className="block text-emerald-400 [text-shadow:0_0_35px_rgba(52,211,153,.25)]">Outbound</span>
                    </>
                  ) : (
                    <>
                      Compound
                      <span className="block text-rose-400 [text-shadow:0_0_35px_rgba(251,113,133,.2)]">Overrun</span>
                    </>
                  )}
                </h2>
                <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                  {missionOutcome === "extracted"
                    ? "Helicopter extract secured. You held the LZ under fire, boarded the bird, and left the sector with a successful end-ex."
                    : "Defensive line collapsed under hostile pressure. Command has retained your combat telemetry for immediate redeployment."}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4">
                {[
                  ["Final score", hud.score.toLocaleString()],
                  ["Wave reached", String(hud.wave).padStart(2, "0")],
                  ["Best streak", String(hud.streak).padStart(2, "0")],
                  ["Time in sector", hud.missionTime],
                ].map(([label, value], index) => (
                  <div key={label} className={`border-b border-slate-200/10 px-4 py-4 sm:border-b-0 sm:px-5 sm:py-6 ${index % 2 === 0 ? "border-r" : ""} sm:border-r sm:last:border-r-0`}>
                    <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500 sm:text-[9px]">{label}</div>
                    <div className="mt-2 font-mono text-xl font-black text-slate-100 sm:text-2xl">{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4 border-t border-slate-200/15 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
                <div>
                  <div className={`text-[9px] font-bold uppercase tracking-[0.25em] ${missionOutcome === "extracted" ? "text-emerald-200/70" : "text-cyan-200/70"}`}>
                    Command recommendation
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {missionOutcome === "extracted"
                      ? "Solid extract. Reload, re-arm, and stand by for the next compound insertion."
                      : "Reload early, preserve medkits, and isolate fast-moving scouts."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startMission}
                  className={`group flex min-h-14 w-full items-center justify-between px-5 text-left text-slate-950 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 sm:w-64 ${
                    missionOutcome === "extracted"
                      ? "bg-emerald-200 focus-visible:outline-emerald-200"
                      : "bg-cyan-100 focus-visible:outline-cyan-200"
                  }`}
                >
                  <span>
                    <span className="block text-[8px] font-bold uppercase tracking-[0.22em] text-slate-600">
                      {missionOutcome === "extracted" ? "Authorize reinsertion" : "Authorize redeployment"}
                    </span>
                    <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.1em]">Restart mission</span>
                  </span>
                  <span aria-hidden="true" className="text-xl transition-transform group-hover:rotate-[-35deg]">↻</span>
                </button>
              </div>
            </section>
          </main>
        </div>
      ) : null}
    </div>
  );
}
