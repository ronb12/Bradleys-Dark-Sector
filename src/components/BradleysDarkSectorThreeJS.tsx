import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { PvpClient } from "../multiplayer/PvpClient";
import { DEFAULT_PVP_ROOM, DEFAULT_PVP_WS_URL } from "../multiplayer/protocol";
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
  createCombatFx,
  spawnBulletImpact,
  spawnShellCasing,
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
  updateSquadCoordination,
  type CoverPoint,
  type Squad,
} from "../game/ai";
import { raycastColliders } from "../game/collisionWorld";
import { DestructionSystem } from "../game/destruction";
import { createGrenade, stepGrenade, sweepBullet, type GrenadeProjectile } from "../game/projectiles";
import { DynamicQualityGovernor } from "../game/quality";
import { WEAPONS, nextWeapon, type WeaponId } from "../game/weapons";
import { createWarehouseInterior, warehouseRoomAt } from "../game/warehouse";
import { createImmersiveAudio, surfaceAtPosition, type ImmersiveAudio } from "../game/audio";
import {
  loadEnvironmentTextures,
  applyTexturedGround,
  addCombatCoverToCompound,
  createFallbackEnvTextures,
} from "../game/environment";
import { populateCompoundWithEnvironmentAssets } from "../game/envAssets";
import {
  COMPOUND_WALL,
  COMPOUND_SPAWN_HALF,
  COMPOUND_GROUND_SIZE,
} from "../game/compoundLayout";
import {
  allowRadioCue,
  assertRadioPoolsVaried,
  contactLine,
  enemyCalloutLine,
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
  waveInboundLine,
} from "../game/radioLines";
import {
  missionHudText,
  nearestInteractMarker,
  pickMissionForWave,
  updateMission,
  type ActiveMission,
} from "../game/missions";
import {
  initAtmosphere,
  setWeather,
  spawnDestructionBurst,
  updateAtmosphereSystem,
  updateDestruction,
  type AtmosphereState,
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
import { graphicsConfig, loadSettings, saveSettings, type GameSettings } from "../game/settings";
import { attachEnemyWeapon, getEnemyMuzzleWorldPos, pickEnemyWeapon, preloadEnemyWeapons } from "../game/enemyWeapons";
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
  attachWeaponsToGrip,
  createXRRuntime,
  detachWeaponsFromGrip,
  disposeXRRuntime,
  endXRSession,
  updateComfortVignette,
  type ShotPose,
  type XRMenuAction,
  type XRRuntime,
} from "../xr";

type GameMode = "solo" | "pvp" | "range";

type DamageBearing = "front" | "left" | "right" | "rear" | null;

type Hud = {
  health: number;
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
  rank: string;
  difficulty: DifficultyId;
  crouching: boolean;
  aiming: boolean;
  subtitle: string;
  interactPrompt: string;
  missionBanner: string;
  unlockNotice: string;
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
  clock: THREE.Clock;
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
  ammo: number;
  maxAmmo: number;
  score: number;
  wave: number;
  fireCooldown: number;
  reload: number;
  yaw: number;
  pitch: number;
  recoil: number;
  running: boolean;
  disposed: boolean;
  enemyTemplate: THREE.Group | null;
  enemyAnimations: THREE.AnimationClip[];
  fbxClips: Record<string, THREE.AnimationClip>;
  mixers: THREE.AnimationMixer[];
  enemyModelLoaded: boolean;
  fbxModeLoaded: boolean;
  killStreak: number;
  bestStreak: number;
  medkits: number;
  missionStartedAt: number;
  /** Frozen HUD timer shown after death / mission end; reset on restart. */
  lastMissionTime: string;
  playerDamageCooldown: number;
  enemyVolleyCooldown: number;
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
  activeMission: ActiveMission | null;
  coverPoints: CoverPoint[];
  squads: Squad[];
  viewmodelPoses: Record<WeaponId, ViewmodelPose>;
  crouching: boolean;
  footstepAccum: number;
  nextDistantFireAt: number;
  nextCalloutAt: number;
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
  xr: XRRuntime | null;
  destruction: DestructionSystem;
  quality: DynamicQualityGovernor;
};

const ENEMY_TYPES: EnemyType[] = [
  { name: "Rifleman", color: 0x747a4e, hp: 75, speed: 2.35, score: 100, range: 16, damage: 2, fireCooldown: 1.55, preferredDistance: 10, minimumDistance: 5 },
  { name: "Scout", color: 0x526f50, hp: 55, speed: 3.15, score: 130, range: 6, damage: 4, fireCooldown: 0.95, preferredDistance: 4.5, minimumDistance: 3.25 },
  { name: "Heavy", color: 0x877044, hp: 135, speed: 1.65, score: 220, range: 13, damage: 4, fireCooldown: 1.85, preferredDistance: 8, minimumDistance: 5.5 },
  { name: "Sniper", color: 0x59694a, hp: 65, speed: 1.85, score: 180, range: 18, damage: 5, fireCooldown: 3.1, preferredDistance: 13, minimumDistance: 6 },
  { name: "Commander", color: 0x6f5e45, hp: 170, speed: 2.05, score: 350, range: 15, damage: 3, fireCooldown: 1.55, preferredDistance: 10, minimumDistance: 5.5 },
];

/** Max distance at which enemies may deal HP damage (fair visual engagement). */
const FAIR_DAMAGE_RANGE = 16;
/** How long an enemy stays "seen" after leaving the camera frustum. */
const ENEMY_SEEN_MEMORY_MS = 2800;
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
  const [hitFlash, setHitFlash] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [pvpConnecting, setPvpConnecting] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [progression, setProgression] = useState<PersistentStats>(() => loadProgression());
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>(() => loadProgression().preferredDifficulty);
  const [pvpRoomInput, setPvpRoomInput] = useState(DEFAULT_PVP_ROOM);
  const [hud, setHud] = useState<Hud>({
    health: 100,
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
    rank: rankFromXp(loadProgression().xp).rank,
    difficulty: loadProgression().preferredDifficulty,
    crouching: false,
    aiming: false,
    subtitle: "",
    interactPrompt: "",
    missionBanner: "",
    unlockNotice: "",
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

  function enhanceEnemyCombatReadability(enemy: THREE.Group, type: EnemyType) {
    const uniformTone = new THREE.Color(type.color);

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
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) return;
        // Matte military tint preserves texture detail without self-lighting.
        material.color.lerp(uniformTone, material.map ? 0.18 : 0.34);
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
      fireCooldownMax: type.fireCooldown,
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
        child.castShadow = true;
        child.receiveShadow = true;
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
      playAnimation(state, avatar, ["idle", "walk", "run"]);
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
        switchEnemyAnimation(state, avatar, moving ? ["run", "walk"] : ["idle"]);
      }
      animateSoldier(avatar, dt, moving);
    }
  }

  function loadGlbFallback(state: GameState) {
    const gltfLoader = new GLTFLoader();
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
        if (state.gameMode === "solo" && state.enemies.length === 0 && state.running) {
          for (let i = 0; i < 9; i += 1) spawnEnemy(state);
        }
        setHud((prev) => ({
          ...prev,
          modelMode: state.enemyAnimations.length
            ? `Detailed soldier (${state.enemyAnimations.length} animations)`
            : "Detailed soldier loaded",
        }));
      },
      undefined,
      () => {
        state.enemyTemplate = null;
        state.enemyAnimations = [];
        state.fbxClips = {};
        state.enemyModelLoaded = false;
        state.fbxModeLoaded = false;
        setHud((prev) => ({ ...prev, modelMode: "Using built-in soldiers — realistic model failed to load" }));
        if (state.gameMode === "solo" && state.enemies.length === 0 && state.running) {
          for (let i = 0; i < 9; i += 1) spawnEnemy(state);
        }
      }
    );
  }

  function loadEnemyTemplate(state: GameState) {
    // The bundled GLB is optimized for the web and includes idle, walk, and
    // run clips. Procedural soldiers remain a resilient offline fallback.
    loadGlbFallback(state);
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

  function makeDustField() {
    const count = 1000;
    const span = COMPOUND_GROUND_SIZE * 0.85;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * span;
      positions[i * 3 + 1] = 0.6 + Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * span;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xb8aa84, size: 0.07, transparent: true, opacity: 0.3, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.userData.spin = true;
    return points;
  }

  function makeSmokeLayer() {
    const group = new THREE.Group();
    const span = COMPOUND_WALL * 1.7;
    for (let i = 0; i < 10; i += 1) {
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
    for (const [id, view] of Object.entries(state.weaponViews) as [WeaponId, THREE.Group][]) {
      view.visible = id === nextWeapon;
    }
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

  function addStatic(scene: THREE.Scene, colliders: THREE.Box3[], mesh: THREE.Object3D, x: number, y: number, z: number) {
    mesh.position.set(x, y, z);
    scene.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  function addEnvironment(scene: THREE.Scene, colliders: THREE.Box3[]) {
    const wall = COMPOUND_WALL;
    const wallLen = wall * 2;
    addStatic(scene, colliders, makeWall(wallLen, 5, 1.2, 0x3f423c), 0, 2.5, -wall);
    addStatic(scene, colliders, makeWall(wallLen, 5, 1.2, 0x3f423c), 0, 2.5, wall);
    addStatic(scene, colliders, makeWall(1.2, 5, wallLen, 0x3f423c), -wall, 2.5, 0);
    addStatic(scene, colliders, makeWall(1.2, 5, wallLen, 0x3f423c), wall, 2.5, 0);

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

    const helipad = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), asphalt);
    helipad.rotation.x = -Math.PI / 2;
    helipad.position.set(-22, 0.035, 12);
    scene.add(helipad);
    const helipadRing = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.15, 48),
      new THREE.MeshBasicMaterial({ color: 0xd1b45c, side: THREE.DoubleSide })
    );
    helipadRing.rotation.x = -Math.PI / 2;
    helipadRing.position.set(-22, 0.045, 12);
    scene.add(helipadRing);
    const heliLight = new THREE.PointLight(0xe8c56a, 3.2, 22, 1.6);
    heliLight.position.set(-22, 5.5, 12);
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

    buildings.forEach(([x, z, w, d, h], buildingIndex) => {
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
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.55, 0.2), paintedMetal);
      doorFrame.position.set(0, h * 0.28, -d / 2 - 0.12);
      const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.48, 0.08), metal);
      door.position.set(0, h * 0.26, -d / 2 - 0.22);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.35, d + 0.7), darkConcrete);
      roof.position.y = h + 0.18;
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.55, d + 0.9), trimPaint);
      parapet.position.y = h + 0.48;
      const parapetCut = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.6, d + 0.2), darkConcrete);
      parapetCut.position.y = h + 0.48;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), darkConcrete);
      floor.position.y = 0.11;
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.28, 0.2), safetyPaint);
      fascia.position.set(0, h * 0.92, -d / 2 - 0.35);
      const shellMeshes = [back, left, right, frontA, frontB, lintel, roof, parapet, floor, fascia];
      // East warehouse is the playable interior; leave its roller doorway open.
      if (buildingIndex !== 1) shellMeshes.push(doorFrame, door);
      shellMeshes.forEach((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      });
      group.add(parapetCut);

      for (const side of [-1, 1]) {
        for (const row of [0.38, 0.68]) {
          const window = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, 0.9, 0.08), side > 0 ? litWindow : warmWindow);
          window.position.set(side * w * 0.28, h * row, -d / 2 - 0.27);
          group.add(window);
        }
        const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, d * 0.16), litWindow);
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
      const interiorGlow = new THREE.PointLight(0x9fd6c2, 1.4, 14, 2);
      interiorGlow.position.set(0, h * 0.55, 0);
      group.add(interiorGlow);

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
      const flood = new THREE.SpotLight(0xe8f4ff, 18, 72, Math.PI / 5.5, 0.45, 0.95);
      flood.position.set(0, 8, 0);
      flood.target.position.set(-x * 0.35, 0, -z * 0.35);
      tower.add(flood);
      scene.add(flood.target);
      scene.add(tower);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 3.2, z), new THREE.Vector3(3.5, 6.5, 3.5)));
    });

    const gateZ = wall - 6;
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

    for (let z = -(wall - 16); z <= wall - 12; z += 10) {
      for (const x of [-8.5, 8.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.4, 10), paintedMetal);
        pole.position.set(x, 2.2, z);
        pole.castShadow = true;
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.32), litWindow);
        lamp.position.set(x, 4.35, z);
        scene.add(lamp);
        const light = new THREE.PointLight(0xd7efff, 3.4, 20, 1.55);
        light.position.set(x, 4.15, z);
        scene.add(light);
      }
    }

    for (let i = 0; i < 28; i += 1) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(1.4 + Math.random() * 2.8, 28), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.55, depthWrite: false }));
      crater.rotation.x = -Math.PI / 2;
      crater.position.set((Math.random() - 0.5) * (wallLen - 20), 0.018, (Math.random() - 0.5) * (wallLen - 20));
      scene.add(crater);
    }

    const firePositions: Array<[number, number]> = [
      [-18, -21],
      [19, -12],
      [-24, 18],
      [8, 24],
      [26, 6],
      [-40, -36],
      [42, 20],
      [0, -40],
    ];
    firePositions.forEach(([x, z]) => {
      const fireGroup = new THREE.Group();
      fireGroup.position.set(x, 0, z);
      fireGroup.userData.fire = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 0.22, 14), makeMaterial(0x090806, 0.95, 0.05));
      base.position.y = 0.12;
      fireGroup.add(base);
      for (let i = 0; i < 4; i += 1) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.25, 1.2 + Math.random() * 0.9, 12), new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.78 }));
        flame.position.set((Math.random() - 0.5) * 0.55, 0.65 + Math.random() * 0.45, (Math.random() - 0.5) * 0.55);
        fireGroup.add(flame);
      }
      const light = new THREE.PointLight(0xff5a00, 4.2, 16);
      light.position.set(0, 1.6, 0);
      light.userData.fireLight = true;
      fireGroup.add(light);
      scene.add(fireGroup);
    });
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

    const renderer = new THREE.WebGLRenderer({ antialias: !mobile && savedSettings.graphics !== "low" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : gfx.pixelRatioCap));
    renderer.shadowMap.enabled = !mobile && savedSettings.graphics !== "low";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x9aa8b4, 0x2f281c, 1.05));
    const moon = new THREE.DirectionalLight(0xffe6c4, 2.65);
    moon.position.set(-18, 28, 12);
    moon.castShadow = !mobile && savedSettings.graphics !== "low";
    moon.shadow.mapSize.set(gfx.shadowMapSize, gfx.shadowMapSize);
    moon.shadow.camera.left = -70;
    moon.shadow.camera.right = 70;
    moon.shadow.camera.top = 70;
    moon.shadow.camera.bottom = -70;
    scene.add(moon);
    const redAlarm = new THREE.PointLight(0xff1f1f, 2.8, 32);
    redAlarm.position.set(9, 5, -14);
    scene.add(redAlarm);
    const blueLight = new THREE.PointLight(0x38bdf8, 2.2, 30);
    blueLight.position.set(-8, 4, 8);
    scene.add(blueLight);
    const fill = new THREE.AmbientLight(0x4a5248, 0.58);
    scene.add(fill);
    const yardFill = new THREE.PointLight(0xc9d6c4, 2.8, 58, 1.4);
    yardFill.position.set(0, 10, 6);
    scene.add(yardFill);

    const groundTex = new THREE.CanvasTexture(makeGroundTexture());
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(22, 22);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(COMPOUND_GROUND_SIZE, COMPOUND_GROUND_SIZE, 96, 96), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.98, metalness: 0.02, bumpMap: groundTex, bumpScale: 0.05 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(makeDustField());
    scene.add(makeSmokeLayer());

    const colliders: THREE.Box3[] = [];
    addEnvironment(scene, colliders);
    const destruction = new DestructionSystem(scene, colliders);
    createWarehouseInterior(scene, colliders, destruction);
    // Place yard combat cover immediately so wave-1 spawns can use sandbags/Jersey
    // instead of waiting on texture downloads.
    addCombatCoverToCompound(scene, colliders, createFallbackEnvTextures());
    scene.userData.combatCoverReady = true;

    const player = new THREE.Group();
    player.name = "Bradley FPS Controller";
    player.position.set(0, 0, 10);
    player.userData = { baseY: 0, actionLock: 0, modelType: "fps-controller" };
    scene.add(player);

    const m4View = makeWeaponView();
    const smgView = makeWeaponView();
    smgView.scale.set(0.82, 0.82, 0.72);
    smgView.position.set(0.5, -0.52, -1);
    smgView.visible = false;
    const pistolView = makePistolView();
    pistolView.visible = false;
    camera.add(m4View, smgView, pistolView);
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
    const atmosphere = initAtmosphere(scene, gfx.volumetricFog);
    setWeather(atmosphere, scene, "clear_night");

    const state: GameState = {
      scene,
      camera,
      renderer,
      clock: new THREE.Clock(),
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
      ammo: 30,
      maxAmmo: 30,
      score: 0,
      wave: 1,
      fireCooldown: 0,
      reload: 0,
      yaw: 0,
      pitch: 0,
      recoil: 0,
      running: false,
      disposed: false,
      enemyTemplate: null,
      enemyAnimations: [],
      fbxClips: {},
      mixers: [],
      enemyModelLoaded: false,
      fbxModeLoaded: false,
      killStreak: 0,
      bestStreak: 0,
      medkits: 1,
      missionStartedAt: 0,
      lastMissionTime: "00:00",
      playerDamageCooldown: 0,
      enemyVolleyCooldown: 0,
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
      xr: null,
      destruction,
      quality: new DynamicQualityGovernor(renderer, mobile ? 1.25 : gfx.pixelRatioCap, !mobile),
    };

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
      })
      .catch((error) => {
        console.warn("[BDS] Imported environment assets failed to load", error);
      });

    // QA/playtest hook — used by Playwright scripts to inspect runtime state.
    (window as unknown as { __darkSector?: GameState }).__darkSector = state;
    return state;
  }

  function spawnEnemy(state: GameState) {
    if (!state.enemyTemplate) {
      setHud((prev) => ({ ...prev, modelMode: "Using built-in soldiers — FBX files not found in /public/models" }));
    }

    const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    const enemy = cloneEnemyFromTemplate(state, type);

    // Prefer spawning at/near yard cover so hostiles don't open on the open road.
    let x = 0;
    let z = 0;
    let placed = false;
    const covers = state.coverPoints || [];
    if (covers.length) {
      const candidates = covers
        .map((c) => {
          const d = Math.hypot(c.x - state.player.position.x, c.z - state.player.position.z);
          return { c, d };
        })
        .filter((entry) => entry.d >= 11 && entry.d <= 26)
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
        const clampedX = THREE.MathUtils.clamp(px, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
        const clampedZ = THREE.MathUtils.clamp(pz, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
        if (!canMoveTo(state, new THREE.Vector3(clampedX, 0, clampedZ))) continue;
        if (Math.hypot(clampedX - state.player.position.x, clampedZ - state.player.position.z) < 9) continue;
        x = clampedX;
        z = clampedZ;
        enemy.userData.coverTarget = pick;
        enemy.userData.coverLockUntil = state.clock.elapsedTime + 5;
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Fallback: forward hemisphere open spawn (legacy).
      const forwardYaw = state.yaw;
      const arcHalf = Math.PI * 0.42;
      const spawnYaw = forwardYaw + (Math.random() * 2 - 1) * arcHalf;
      const dist = 12 + Math.random() * 10;
      x = state.player.position.x + Math.sin(spawnYaw) * dist;
      z = state.player.position.z - Math.cos(spawnYaw) * dist;
      x = THREE.MathUtils.clamp(x, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
      z = THREE.MathUtils.clamp(z, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
      if (Math.hypot(x - state.player.position.x, z - state.player.position.z) < 8) {
        x = state.player.position.x + Math.sin(spawnYaw) * 14;
        z = state.player.position.z - Math.cos(spawnYaw) * 14;
        x = THREE.MathUtils.clamp(x, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
        z = THREE.MathUtils.clamp(z, -COMPOUND_SPAWN_HALF, COMPOUND_SPAWN_HALF);
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const probe = new THREE.Vector3(x, 0, z);
        if (canMoveTo(state, probe)) break;
        const nudgeYaw = spawnYaw + (attempt + 1) * 0.55;
        x = THREE.MathUtils.clamp(
          state.player.position.x + Math.sin(nudgeYaw) * (14 + attempt),
          -COMPOUND_SPAWN_HALF,
          COMPOUND_SPAWN_HALF
        );
        z = THREE.MathUtils.clamp(
          state.player.position.z - Math.cos(nudgeYaw) * (14 + attempt),
          -COMPOUND_SPAWN_HALF,
          COMPOUND_SPAWN_HALF
        );
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

  function hasLineOfSight(state: GameState, from: THREE.Vector3, to: THREE.Vector3) {
    const offsetFrom = from.clone().add(new THREE.Vector3(0, 1.5, 0));
    const offsetTo = to.clone().add(new THREE.Vector3(0, 1.6, 0));
    const delta = offsetTo.clone().sub(offsetFrom);
    const dist = delta.length();
    if (dist < 0.2) return true;
    const dir = delta.normalize();
    return raycastColliders(state.colliders, offsetFrom, dir, Math.max(0, dist - 0.3)) == null;
  }

  function flashHitMarker() {
    setHitFlash(true);
    window.setTimeout(() => setHitFlash(false), 90);
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
    return distance <= 11;
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

    let flash = enemy.userData.muzzleLight as THREE.PointLight | undefined;
    if (!flash) {
      flash = new THREE.PointLight(0xffcc66, 4.5, 8, 2);
      enemy.add(flash);
      enemy.userData.muzzleLight = flash;
    }
    const muzzleWorld = getEnemyMuzzleWorldPos(enemy);
    enemy.worldToLocal(flash.position.copy(muzzleWorld));
    flash.intensity = 5;
    flash.visible = true;
  }

  function updateEnemyMuzzleFlash(enemy: THREE.Group) {
    const until = enemy.userData.muzzleFlashUntil || 0;
    const flash = enemy.userData.muzzleLight as THREE.PointLight | undefined;
    if (performance.now() > until) {
      if (flash) {
        flash.intensity = 0;
        flash.visible = false;
      }
    } else if (flash) {
      flash.intensity = 3.5 + Math.random() * 2;
    }
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
      state.lastMissionTime = formatMissionTime(state.clock.elapsedTime - state.missionStartedAt);
    }
  }

  function damagePlayer(state: GameState, amount: number, from?: THREE.Vector3) {
    if (state.playerDamageCooldown > 0 || !state.running) return;
    if (state.gameMode === "range") return;
    if (state.gameMode === "pvp" && !state.pvpAlive) return;
    state.health -= amount;
    state.playerDamageCooldown = 0.65;
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
      const playSec = state.missionStartedAt > 0 ? state.clock.elapsedTime - state.missionStartedAt : 0;
      const prevUnlocks = new Set(progression.unlockedAttachments);
      const prevDiffs = new Set(progression.unlockedDifficulties);
      const nextStats = recordMissionEnd(progression, {
        kills: state.sessionKills,
        score: state.score,
        wave: state.wave,
        won: false,
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
      if (document.pointerLockElement) document.exitPointerLock();
      setHud((prev) => ({
        ...prev,
        health: 0,
        missionTime: state.lastMissionTime || prev.missionTime,
        rank: rankFromXp(nextStats.xp).rank,
      }));
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

  function animateSoldier(group: THREE.Group, dt: number, moving: boolean) {
    group.userData.actionLock = Math.max(0, (group.userData.actionLock || 0) - dt);

    if (group.userData.modelType === "mixamo-glb" || group.userData.modelType === "fbx-mixamo") return;

    group.userData.walkTime = (group.userData.walkTime || 0) + dt * (moving ? 7.5 : 2.2);
    const t = group.userData.walkTime;
    const limbs = group.userData.limbs;
    if (!limbs) return;

    const walk = Math.sin(t);
    const walkOpp = Math.sin(t + Math.PI);
    const bob = moving ? Math.abs(Math.sin(t)) * 0.09 : Math.sin(t * 0.65) * 0.012;
    const shootKick = Math.max(0, group.userData.shootRecoil || 0);
    group.userData.shootRecoil = Math.max(0, shootKick - dt * 1.9);
    const sway = moving ? Math.sin(t * 0.5) * 0.035 : Math.sin(t * 0.35) * 0.01;

    limbs.lLeg.rotation.x = walk * (moving ? 0.82 : 0.04);
    limbs.rLeg.rotation.x = walkOpp * (moving ? 0.82 : 0.04);
    limbs.lLeg.rotation.z = Math.cos(t) * (moving ? 0.08 : 0.01);
    limbs.rLeg.rotation.z = -Math.cos(t) * (moving ? 0.08 : 0.01);

    limbs.lArm.rotation.x = walkOpp * (moving ? 0.45 : 0.035) - 0.14;
    limbs.rArm.rotation.x = walk * (moving ? 0.38 : 0.035) - 0.12;
    limbs.lArm.rotation.z = -0.25 + Math.cos(t) * (moving ? 0.08 : 0.02);
    limbs.rArm.rotation.z = 0.25 - Math.cos(t) * (moving ? 0.06 : 0.02);

    limbs.torso.position.y = 1.55 + bob;
    limbs.hips.position.y = 0.95 + bob * 0.75;
    limbs.torso.rotation.x = moving ? -0.12 : Math.sin(t * 0.5) * 0.015;
    limbs.torso.rotation.z = sway;
    limbs.head.position.y = 2.23 + bob * 0.45;
    limbs.head.rotation.y = Math.sin(t * 0.45) * (moving ? 0.03 : 0.012);
    limbs.head.rotation.x = moving ? 0.035 : 0;

    limbs.rifle.position.y = 1.52 + bob * 0.8;
    limbs.rifle.rotation.z = Math.sin(t) * (moving ? 0.025 : 0.008);
    limbs.rifle.rotation.x = -0.02 + Math.cos(t * 0.8) * (moving ? 0.018 : 0.006) - shootKick * 0.55;
    limbs.rifle.position.z = -0.47 + shootKick * 0.22;
    limbs.rArm.rotation.x -= shootKick * 0.9;
    limbs.lArm.rotation.x -= shootKick * 0.55;
    limbs.torso.rotation.x -= shootKick * 0.18;

    group.position.y = group.userData.baseY + bob * 0.2;
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
    const loadoutAttachments = progression.loadout.find((l) => l.weapon === state.activeWeapon)?.attachments || [];
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
    state.recoil = Math.min(0.24, state.recoil + mods.recoil);
    if (!state.xr?.presenting) {
      addRecoilShake(state.combatFx, mods.recoil * 2.2);
      state.viewmodelPoses[state.activeWeapon].recoilKick = Math.min(
        0.35,
        state.viewmodelPoses[state.activeWeapon].recoilKick + mods.recoil * 2
      );
    }
    state.audio.playWeaponFire(state.activeWeapon);
    if (!infiniteAmmo && state.ammo <= 0) beginReload(state);
    state.camera.updateMatrixWorld(true);

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
    const spread =
      (weapon.baseSpread + weapon.sustainedSpread * state.fireHeat) *
      adsSpreadMultiplier *
      accuracyMultiplier;
    dir
      .addScaledVector(right, (Math.random() - 0.5) * 2 * spread)
      .addScaledVector(up, (Math.random() - 0.5) * 2 * spread)
      .normalize();
    state.fireHeat = weapon.automatic ? Math.min(1, state.fireHeat + 0.16) : 0;
    spawnShellCasing(state.combatFx, origin.clone().add(right.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, -0.15, 0)), right);
    state.audio.playShellCasing();

    if (state.gameMode === "range" && state.shootingRange) {
      const rangeHit = state.shootingRange.tryHit(origin, dir);
      if (rangeHit) {
        spawnBulletImpact(state.combatFx, rangeHit.point, dir.clone().multiplyScalar(-1), "metal");
        state.audio.playImpact("metal");
        flashHitMarker();
        state.score = state.shootingRange.stats.score;
        state.killStreak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.killStreak);
      } else {
        state.shootingRange.registerMiss();
        const impactPoint = origin.clone().add(dir.clone().multiplyScalar(28));
        impactPoint.y = Math.max(0.05, impactPoint.y - 0.2);
        spawnBulletImpact(state.combatFx, impactPoint, new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? "metal" : "dirt");
        state.audio.playImpact(Math.random() < 0.5 ? "metal" : "dirt");
        if (Math.random() < 0.2) state.audio.playRicochet();
        state.killStreak = 0;
      }
      const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: rangeHit ? 0xff5533 : 0xfff3a3 }));
      bullet.position.copy(origin).add(dir.clone().multiplyScalar(1.4));
      bullet.userData = { velocity: dir.clone().multiplyScalar(55), life: 0.35 };
      state.scene.add(bullet);
      state.bullets.push(bullet);
      const flash = new THREE.PointLight(0xffcc66, 5, 6);
      flash.position.copy(origin).add(dir.clone().multiplyScalar(0.35));
      state.scene.add(flash);
      window.setTimeout(() => state.scene.remove(flash), 65);
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
      spawnBulletImpact(state.combatFx, closestHit.point, dir.clone().multiplyScalar(-1), "flesh");
      state.audio.playImpact("flesh");
      applyHitReact(enemy, 0.22);
      if (closestHit.remoteId) {
        pvpClientRef.current?.sendHit(closestHit.remoteId, mods.damage);
        enemy.userData.hitReact = 0.18;
        flashHitMarker();
      } else {
        enemy.userData.health -= mods.damage;
        enemy.userData.hitReact = 0.18;
        flashHitMarker();
        // Trigger hit / death animation when clips exist
        if (enemy.userData.mixer && enemy.userData.health > 0) {
          const clips = [...Object.values(state.fbxClips), ...state.enemyAnimations];
          playOrSwitch(enemy.userData.mixer as THREE.AnimationMixer, enemy, clips, "hit", { force: true, loop: false });
        }
        enemy.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            const mat = child.material;
            const baseHex = typeof mat.userData.baseEmissiveHex === "number" ? mat.userData.baseEmissiveHex : 0x000000;
            const baseIntensity = typeof mat.userData.baseEmissiveIntensity === "number" ? mat.userData.baseEmissiveIntensity : 0;
            mat.emissive.setHex(0x6b160f);
            mat.emissiveIntensity = Math.max(0.32, baseIntensity);
            window.setTimeout(() => {
              mat.emissive.setHex(baseHex);
              mat.emissiveIntensity = baseIntensity;
            }, 90);
          }
        });
        if (enemy.userData.health <= 0) {
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
            spawnDestructionBurst(state.scene, enemy.position.x, enemy.position.z);
            state.audio.playExplosion(8);
          }
        }
      }
    } else {
      // World impact — prefer real cover surfaces for dust / metal debris.
      const world = coverHit ?? raycastWorldCover(state, origin, dir, 55);
      if (world) {
        state.destruction.damageAt(world.point, mods.damage);
        spawnBulletImpact(state.combatFx, world.point, world.normal, world.metal ? "metal" : "dirt");
        state.audio.playImpact(world.metal ? "metal" : "dirt");
        if (world.metal || Math.random() < 0.3) state.audio.playRicochet();
      } else {
        const impactPoint = origin.clone().add(dir.clone().multiplyScalar(22));
        impactPoint.y = Math.max(0.05, impactPoint.y - 0.4);
        spawnBulletImpact(state.combatFx, impactPoint, new THREE.Vector3(0, 1, 0), Math.random() < 0.35 ? "metal" : "dirt");
        state.audio.playImpact(Math.random() < 0.35 ? "metal" : "dirt");
        if (Math.random() < 0.25) state.audio.playRicochet();
      }
    }

    const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: closestHit ? 0xff5533 : 0xfff3a3 }));
    bullet.position.copy(origin).add(dir.clone().multiplyScalar(1.4));
    bullet.userData = { velocity: dir.clone().multiplyScalar(55), life: 0.35 };
    state.scene.add(bullet);
    state.bullets.push(bullet);

    const flash = new THREE.PointLight(0xffcc66, 5, 6);
    flash.position.copy(origin).add(dir.clone().multiplyScalar(0.35));
    state.scene.add(flash);
    window.setTimeout(() => state.scene.remove(flash), 65);
  }

  function throwPlayerGrenade(state: GameState, shotPose?: ShotPose | null) {
    if (!state.running || state.gameMode !== "solo" || state.grenadesRemaining <= 0) return false;
    state.camera.updateMatrixWorld(true);
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
    enemy.userData.nextGrenadeAt = performance.now() / 1000 + 12 + Math.random() * 8;
  }

  function explodeGrenade(state: GameState, grenade: GrenadeProjectile) {
    const point = grenade.mesh.position.clone();
    state.scene.remove(grenade.mesh);
    spawnDestructionBurst(state.scene, point.x, point.z);
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
          state.dyingEnemies.push(enemy);
          state.score += enemy.userData.scoreValue || 100;
          state.sessionKills += 1;
        }
      }
    } else {
      const distance = state.player.position.distanceTo(point);
      if (distance <= grenade.radius && hasLineOfSight(state, point, state.player.position)) {
        damagePlayer(state, Math.round(52 * (1 - distance / grenade.radius)), point);
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
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(marker.radius * 0.85, marker.radius, 32),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 })
      );
      beacon.position.y = 1.2;
      g.add(beacon);
      g.position.set(marker.x, 0.05, marker.z);
      g.userData.markerId = marker.id;
      state.scene.add(g);
      state.missionMarkers.push(g);
    }
  }

  function beginWaveContent(state: GameState) {
    state.coverPoints = buildCoverPointsFromColliders(state.colliders);
    const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
    const count = Math.max(4, Math.round((6 + state.wave * 2) * diff.enemyCountMul));
    for (let i = 0; i < count; i += 1) {
      try {
        spawnEnemy(state);
      } catch (err) {
        console.warn("[BDS] spawnEnemy failed", err);
      }
    }
    state.squads = assignSquads(state.enemies);
    state.activeMission = pickMissionForWave(state.wave);
    syncMissionMarkers(state);
    if (state.activeMission.type !== "waves") {
      state.audio.playRadio(missionBriefLine(state.activeMission.title, state.activeMission.briefing), {
        channel: "mission",
      });
    }
  }

  function updateGame(state: GameState, dt: number) {
    const keys = keysRef.current;
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.recoil = Math.max(0, state.recoil - dt * 0.5);
    state.playerDamageCooldown = Math.max(0, state.playerDamageCooldown - dt);
    state.enemyVolleyCooldown = Math.max(0, state.enemyVolleyCooldown - dt);
    if (state.reload > 0) {
      state.reload -= dt;
      if (state.reload <= 0) {
        state.reload = 0;
        state.ammo = state.maxAmmo;
        state.weaponAmmo[state.activeWeapon] = state.ammo;
      }
    }

    const canControl = state.gameMode === "solo" || state.gameMode === "range" || state.pvpAlive;
    const xr = state.xr;
    const inXr = Boolean(xr?.presenting);

    if (canControl && inXr && xr) {
      const frame = xr.input.poll(state.settings.snapTurnDegrees);
      const selectEdge = frame.fire && !xr.selectWasDown;
      xr.selectWasDown = frame.fire;

      if (frame.menu) {
        if (xr.menu.isOpen()) xr.menu.hide();
        else if (state.running) xr.menu.showPause();
        else xr.menu.showMain();
      }

      if (frame.snapRadians !== 0) {
        xr.rig.snapTurn(frame.snapRadians);
      }
      state.yaw = xr.rig.getYaw();

      xr.menu.updatePose(state.player.position, state.yaw);
      if (xr.menu.isOpen()) {
        xr.menu.updateInteraction(xr.input.getUiRayTarget(), frame.fire, selectEdge);
        xr.rig.root.position.set(state.player.position.x, state.player.position.y, state.player.position.z);
        xr.hud.updatePose(state.player.position, state.yaw);
        updateComfortVignette(xr, false, state.settings.comfortVignette, dt);
        state.triggerLatched = frame.fire;
      } else if (state.running) {
        attachWeaponsToGrip(xr, state.weaponViews, state.activeWeapon);

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
        xr.rig.root.position.set(state.player.position.x, state.player.position.y, state.player.position.z);
        updateComfortVignette(xr, moving, state.settings.comfortVignette && !state.settings.reduceMotion, dt);

        if (moving) {
          state.footstepAccum += dt * (sprinting ? 2.4 : state.crouching ? 1.1 : 1.7);
          if (state.footstepAccum >= 1) {
            state.footstepAccum = 0;
            state.audio.playFootstep(surfaceAtPosition(state.player.position.x, state.player.position.z));
          }
        }

        state.player.rotation.y = state.yaw + Math.PI;
        // Headset owns camera pose — do not overwrite position/rotation/shake.
        state.camera.updateMatrixWorld(true);

        const triggerDown = frame.fire;
        state.fireHeat = Math.max(0, state.fireHeat - dt * (triggerDown ? 0.08 : 1.8));
        const weaponConfig = WEAPONS[state.activeWeapon];
        const pose = xr.input.getShotPose();
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
        if (frame.medkit && state.medkits > 0 && state.health < 100) {
          state.medkits -= 1;
          state.health = Math.min(100, state.health + 45);
        }
        xr.hud.updatePose(state.player.position, state.yaw);
      } else {
        xr.rig.root.position.set(state.player.position.x, state.player.position.y, state.player.position.z);
        xr.hud.updatePose(state.player.position, state.yaw);
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
        state.yaw,
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
      } else if (!keys.__medkitHeld && state.medkits > 0 && state.health < 100) {
        state.medkits -= 1;
        state.health = Math.min(100, state.health + 45);
        keys.__medkitHeld = true;
      }
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
        const m4Max = applyAttachmentMods(WEAPONS.m4, progression.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
        const smgMax = applyAttachmentMods(WEAPONS.smg, progression.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
        const pistolMax = applyAttachmentMods(WEAPONS.pistol, progression.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
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
      state.camera.updateMatrixWorld();
      const aiCtx = {
        player: state.player.position.clone(),
        colliders: state.colliders,
        coverPoints: state.coverPoints,
        dt,
        now: state.clock.elapsedTime,
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
      const steerResult = computeEnemySteer(enemy, aiCtx);
      const speedMul = enemy.userData.aiSpeedMul || 1;
      const smoothedSteer = (enemy.userData.smoothedSteer as THREE.Vector3 | undefined) || new THREE.Vector3();
      enemy.userData.smoothedSteer = smoothedSteer;
      const steeringResponse = steerResult.intent === "retreat" ? 9 : 5.5;
      smoothedSteer.lerp(steerResult.steer, 1 - Math.exp(-dt * steeringResponse));
      if (steerResult.steer.lengthSq() < 0.0001 && smoothedSteer.lengthSq() < 0.0025) smoothedSteer.set(0, 0, 0);
      const preparingToFire =
        !enemyShouldHoldFire(enemy)
        && distance <= range
        && enemy.userData.cooldown <= 0
        && hasLineOfSight(state, enemy.position, state.player.position);
      if (preparingToFire) smoothedSteer.multiplyScalar(Math.exp(-dt * 11));
      // A firing soldier plants their feet; this makes bursts read as aimed
      // actions rather than rounds sprayed during a direction change.
      if ((enemy.userData.burstShotsRemaining || 0) > 0) smoothedSteer.multiplyScalar(Math.exp(-dt * 12));

      const step = smoothedSteer.clone().multiplyScalar(enemy.userData.speed * speedMul * dt);
      const before = enemy.position.clone();
      const result = tryMove(state, enemy.position, step);
      enemy.position.copy(result.position);
      const groundY = enemy.userData.groundOffset ?? enemy.userData.baseY ?? 0;
      enemy.position.y = groundY;
      enemy.userData.baseY = groundY;
      if (result.stuck) {
        enemy.userData.stuckTime = (enemy.userData.stuckTime || 0) + dt;
        if (state.clock.elapsedTime >= (enemy.userData.nextFlankFlipAt || 0)) {
          enemy.userData.flank *= -1;
          enemy.userData.nextFlankFlipAt = state.clock.elapsedTime + 0.8;
        }
        if (enemy.userData.stuckTime > 1.25) {
          const toward = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, -1);
          const flankDir = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(enemy.userData.flank || 1);
          const escape = toward
            .clone()
            .multiplyScalar(0.35)
            .addScaledVector(flankDir, 0.75)
            .normalize()
            .multiplyScalar(enemy.userData.speed * dt);
          const bump = tryMove(state, enemy.position, escape);
          enemy.position.copy(bump.position);
          enemy.position.y = groundY;
          enemy.userData.stuckTime = bump.moved ? 0.8 : 1.1;
        }
      } else if (before.distanceToSquared(enemy.position) > 0.00001) {
        enemy.userData.stuckTime = 0;
      }

      const turnError = turnEnemyTowardPlayer(enemy, state.player.position, dt);
      const movedDistance = before.distanceTo(enemy.position);
      const motionSpeed = movedDistance / Math.max(dt, 0.001);
      enemy.userData.motionSpeed = motionSpeed;
      const enemyMoving = movedDistance > 0.002;
      const enemyFast = enemy.userData.speed > 2.7 || speedMul > 1.2;
      if (enemy.userData.modelType === "fbx-mixamo" || enemy.userData.modelType === "mixamo-glb") {
        if (steerResult.wantCover && !enemyMoving) {
          switchEnemyAnimation(state, enemy, ["idle_gun_pointing", "idle_gun", "aim", "idle"]);
        } else {
          switchEnemyAnimation(
            state,
            enemy,
            enemyMoving
              ? enemyFast
                ? ["run_shoot", "run", "walk"]
                : ["walk", "run_shoot", "run"]
              : ["idle_gun_pointing", "idle_gun", "aim", "idle"]
          );
        }
      }
      animateSoldier(enemy, dt, enemyMoving);
      enemy.userData.cooldown -= dt;
      enemy.userData.burstShotTimer = Math.max(0, (enemy.userData.burstShotTimer || 0) - dt);
      const aiNow = performance.now() / 1000;
      if ((enemy.userData.reloadUntil || 0) > 0 && aiNow >= enemy.userData.reloadUntil) {
        enemy.userData.magazine = enemy.userData.magazineSize || 24;
        enemy.userData.reloadUntil = 0;
      }
      if ((enemy.userData.magazine || 0) <= 0 && (enemy.userData.reloadUntil || 0) <= 0) {
        enemy.userData.reloadUntil = aiNow + 1.7 + Math.random() * 0.8;
        enemy.userData.burstShotsRemaining = 0;
      }
      if (
        distance > 7
        && distance < 17
        && aiNow >= (enemy.userData.nextGrenadeAt || Number.POSITIVE_INFINITY)
        && hasLineOfSight(state, enemy.position, state.player.position)
      ) {
        throwEnemyGrenade(state, enemy);
      }

      const mayDamage = canEnemyDealDamage(state, enemy, distance);
      const holding = enemyShouldHoldFire(enemy);
      const aimSettled = turnError < 0.14 && motionSpeed < 0.85;
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
      }

      const canShootBurstRound =
        hasFiringLane
        && turnError < 0.18
        && (enemy.userData.burstShotsRemaining || 0) > 0
        && enemy.userData.burstShotTimer <= 0;
      if (canShootBurstRound) {
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
        if (damageEligibleThisRound) state.enemyVolleyCooldown = 0.35;
        const accuracy = Math.min(0.58, 0.12 + (1 - distance / Math.max(range, 1)) * 0.4);
        const hit = Math.random() < accuracy;

        const tracer = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 6, 6),
          new THREE.MeshBasicMaterial({ color: hit && damageEligibleThisRound ? 0xff8844 : 0xe7d59a })
        );
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
        tracer.position.copy(from.add(shotDir.clone().multiplyScalar(0.35)));
        tracer.userData = {
          velocity: shotDir.multiplyScalar(48),
          life: 0.45,
          enemyProjectile: true,
          enemyDamage: hit && damageEligibleThisRound ? enemy.userData.damage || 7 : 0,
          sourcePosition: enemy.position.clone(),
        };
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
          );
          state.audio.playImpact(result.worldHit.surface === "dirt" ? "dirt" : "metal");
          bullet.userData.life = 0;
        } else if (result.targetHit && bullet.userData.enemyDamage > 0) {
          damagePlayer(state, bullet.userData.enemyDamage, bullet.userData.sourcePosition || bullet.position);
          bullet.userData.life = 0;
        } else if (result.targetHit) {
          addSuppression(state.combatFx, 0.12);
          bullet.userData.life = 0;
        } else if (bullet.position.distanceTo(playerCenter) < 1.7) {
          addSuppression(state.combatFx, 0.08);
        }
      } else {
        bullet.position.addScaledVector(velocity, dt);
      }
      bullet.userData.life -= dt;
    });
    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.userData.life > 0) return true;
      state.scene.remove(bullet);
      return false;
    });

    state.grenades = state.grenades.filter((grenade) => {
      if (!stepGrenade(grenade, dt, state.colliders)) return true;
      explodeGrenade(state, grenade);
      return false;
    });

    updateCombatFx(state.combatFx, dt);
    updateDestruction(state.scene, dt);
    state.quality.update(dt);

    if (state.gameMode === "solo") {
      state.enemies = state.enemies.filter((enemy) => enemy.userData.alive);

      if (state.activeMission) {
        const prevComplete = state.activeMission.complete;
        state.activeMission = updateMission(state.activeMission, {
          playerX: state.player.position.x,
          playerZ: state.player.position.z,
          enemiesAlive: state.enemies.length,
          killsThisFrame: 0,
          dt,
          interactPressed: state.interactPulse,
          roomId: warehouseRoomAt(state.player.position.x, state.player.position.z),
        });
        state.interactPulse = false;
        if (state.activeMission.type === "rescue") {
          const asset = state.activeMission.markers.find((m) => m.id === "asset");
          const marker = state.missionMarkers.find((g) => g.userData.markerId === "asset");
          if (asset && marker) marker.position.set(asset.x, 0.05, asset.z);
        }
        if (state.activeMission.complete && !prevComplete) {
          state.score += state.activeMission.scoreBonus;
          state.audio.playRadio(objectiveCompleteLine(state.activeMission.title), {
            channel: "mission",
          });
          setMissionBanner(`MISSION COMPLETE — ${state.activeMission.title}  (+${state.activeMission.scoreBonus})`);
          window.setTimeout(() => setMissionBanner(""), 4200);
          if (state.activeMission.type === "sabotage") {
            for (const tank of state.activeMission.markers.filter((m) => m.id.startsWith("tank"))) {
              spawnDestructionBurst(state.scene, tank.x, tank.z);
            }
            state.audio.playExplosion(12);
          }
        }
      }

      const missionDone = !state.activeMission || state.activeMission.complete || state.activeMission.type === "waves";
      const waveClear = state.running && state.enemies.length === 0 && missionDone;
      if (waveClear) {
        if (state.activeMission && state.activeMission.type !== "waves" && !state.activeMission.complete) {
          for (let i = 0; i < 3; i += 1) spawnEnemy(state);
          state.squads = assignSquads(state.enemies);
        } else {
          state.wave += 1;
          state.health = Math.min(100, state.health + 30);
          const m4Max = applyAttachmentMods(WEAPONS.m4, progression.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
          const smgMax = applyAttachmentMods(WEAPONS.smg, progression.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
          const pistolMax = applyAttachmentMods(WEAPONS.pistol, progression.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
          state.weaponAmmo = { m4: m4Max, smg: smgMax, pistol: pistolMax };
          state.maxAmmo = state.weaponAmmo[state.activeWeapon];
          state.ammo = state.weaponAmmo[state.activeWeapon];
          state.grenadesRemaining = Math.min(3, state.grenadesRemaining + 1);
          if (state.wave % 2 === 0) state.medkits += 1;
          beginWaveContent(state);
        }
      }

      const missionElapsed = state.clock.elapsedTime - state.missionStartedAt;
      if (state.wave > state.announcedWave) {
        state.announcedWave = state.wave;
        state.nextRadioAt = missionElapsed + 24 + Math.random() * 12;
        state.audio.playRadio(waveInboundLine(state.wave), {
          channel: "mission",
        });
      } else if (missionElapsed >= state.nextRadioAt) {
        state.audio.playRadio(missionAmbientLine(), { channel: "mission" });
        state.nextRadioAt = missionElapsed + 28 + Math.random() * 16;
      }

      if (missionElapsed >= state.nextDistantFireAt) {
        state.audio.playDistantGunfire();
        state.nextDistantFireAt = missionElapsed + 9 + Math.random() * 14;
      }
      if (missionElapsed >= state.nextCalloutAt && state.enemies.length > 0) {
        state.audio.playEnemyCallout(enemyCalloutLine());
        state.nextCalloutAt = missionElapsed + 10 + Math.random() * 12;
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
      state.lastMissionTime = formatMissionTime(state.clock.elapsedTime - state.missionStartedAt);
    }
    const missionTime = state.lastMissionTime || "00:00";

    const nowMs = performance.now();
    const contactActive = nowMs < state.contactUntil;
    if (!contactActive) state.lastDamageBearing = null;
    const interactNear = state.gameMode === "solo"
      ? nearestInteractMarker(state.activeMission, state.player.position.x, state.player.position.z)
      : null;
    const subtitle = state.settings.subtitles && state.gameMode === "solo" && state.activeMission
      ? state.activeMission.briefing
      : "";

    const nextHud: Hud = {
      health: Math.round(state.health),
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
      rank: rankFromXp(progression.xp).rank,
      difficulty: state.difficulty,
      crouching: state.crouching,
      aiming: state.adsBlend > 0.35,
      subtitle: state.gameMode === "range"
        ? "Infinite ammo · T qualification · amber crate refill · Esc menu"
        : subtitle,
      interactPrompt: state.gameMode === "range" && state.shootingRange?.nearRefill(state.player.position)
        ? "Ammo station — magazines topped"
        : interactNear?.prompt || "",
      missionBanner,
      unlockNotice: unlockToast,
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
    const hudKey = `${nextHud.health}|${nextHud.ammo}|${nextHud.activeWeapon}|${nextHud.m4Ammo}|${nextHud.smgAmmo}|${nextHud.pistolAmmo}|${nextHud.grenades}|${nextHud.score}|${nextHud.enemies}|${nextHud.wave}|${nextHud.missionTime}|${nextHud.medkits}|${nextHud.streak}|${nextHud.modelMode}|${nextHud.gameMode}|${nextHud.kills}|${nextHud.deaths}|${nextHud.pvpPlayers}|${nextHud.pvpStatus}|${nextHud.objective}|${nextHud.contact}|${nextHud.damageBearing}|${nextHud.missionTitle}|${nextHud.missionProgress.toFixed(2)}|${nextHud.suppression.toFixed(2)}|${nextHud.crouching}|${nextHud.aiming}|${nextHud.subtitle}|${nextHud.interactPrompt}|${nextHud.missionBanner}|${nextHud.unlockNotice}|${nextHud.rangeHits}|${nextHud.rangeMisses}|${nextHud.rangeAccuracy.toFixed(0)}|${nextHud.rangeChallengeActive}|${nextHud.rangeChallengeScore}|${nextHud.rangeHighestBadge}|${rangeResult?.endedAt ?? 0}`;
    if (hudTimerRef.current >= 0.1 || hudKey !== lastHudKeyRef.current) {
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
    console.assert(SHOOT_ANIMATION_LOCK_SECONDS > 0, "Shoot animation lock should be positive.");
    const thinPools = assertRadioPoolsVaried(2);
    console.assert(thinPools.length === 0, `Radio pools need variety: ${thinPools.join(", ")}`);
    console.assert(
      poolRotatesWithoutImmediateRepeat("missionAmbient", MISSION_AMBIENT_LINES),
      "Mission ambient radio should rotate without immediate repeats."
    );
  }

  function resetLoadout(state: GameState) {
    const m4Max = applyAttachmentMods(WEAPONS.m4, progression.loadout.find((l) => l.weapon === "m4")?.attachments || []).maxAmmo;
    const smgMax = applyAttachmentMods(WEAPONS.smg, progression.loadout.find((l) => l.weapon === "smg")?.attachments || []).maxAmmo;
    const pistolMax = applyAttachmentMods(WEAPONS.pistol, progression.loadout.find((l) => l.weapon === "pistol")?.attachments || []).maxAmmo;
    const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.operator;
    state.health = Math.round(100 * diff.playerHpMul);
    state.weaponAmmo = { m4: m4Max, smg: smgMax, pistol: pistolMax };
    state.activeWeapon = "m4";
    state.weapon = state.weaponViews.m4;
    state.weaponViews.m4.visible = true;
    state.weaponViews.smg.visible = false;
    state.weaponViews.pistol.visible = false;
    state.ammo = state.weaponAmmo.m4;
    state.maxAmmo = m4Max;
    state.reload = 0;
    state.triggerLatched = false;
    state.fireHeat = 0;
    state.fireCooldown = 0;
    state.recoil = 0;
    state.adsHeld = false;
    state.adsBlend = 0;
    state.grenadesRemaining = 3;
    state.camera.fov = state.settings.fov;
    state.camera.updateProjectionMatrix();
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
    state.missionStartedAt = state.clock.elapsedTime;
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 0;
    state.enemyVolleyCooldown = 0;
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
    state.camera.updateProjectionMatrix();

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
    state.xr.rig.root.position.set(state.player.position.x, state.player.position.y, state.player.position.z);
    state.xr.rig.root.rotation.set(0, state.yaw, 0);
    attachWeaponsToGrip(state.xr, state.weaponViews, state.activeWeapon);
  }

  function startMission() {
    const state = gameRef.current;
    if (!state) return;
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
    resetLoadout(state);
    state.score = 0;
    state.wave = 1;
    state.sessionKills = 0;
    state.killStreak = 0;
    state.bestStreak = 0;
    state.medkits = 2;
    state.missionStartedAt = state.clock.elapsedTime;
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 3;
    state.enemyVolleyCooldown = 1.25;
    state.audio.unlock();
    state.audio.setMuted(audioMuted);
    state.audio.setVolumes({
      master: settings.masterVolume,
      sfx: settings.sfxVolume,
      radio: settings.radioVolume,
    });
    state.settings = settings;
    state.camera.fov = settings.fov;
    state.camera.updateProjectionMatrix();
    state.audio.playRadio(missionStartLine(), {
      channel: "mission",
    });
    state.nextRadioAt = 28 + Math.random() * 12;
    state.nextDistantFireAt = 12;
    state.nextCalloutAt = 8;
    state.announcedWave = 1;
    state.player.position.set(0, 0, 10);
    state.player.userData.baseY = 0;
    state.yaw = 0;
    state.pitch = 0;
    state.contactUntil = 0;
    state.lastDamageBearing = null;
    state.crouching = false;
    state.dyingEnemies = [];
    clearAllEnemies(state);
    beginWaveContent(state);
    const nextProg = { ...progression, preferredDifficulty: selectedDifficulty };
    saveProgression(nextProg);
    setProgression(nextProg);
    lastHudKeyRef.current = "";
    setPvpError(null);
    setStarted(true);
    setGameOver(false);
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
    state.missionStartedAt = state.clock.elapsedTime;
    state.lastMissionTime = "00:00";
    state.playerDamageCooldown = 0;
    state.enemyVolleyCooldown = 0;
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
      { url: DEFAULT_PVP_WS_URL, room: pvpRoomInput.trim() || DEFAULT_PVP_ROOM },
    );
    pvpClientRef.current = client;
    client.connect();
  }

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
      if (state?.running && key === "f" && !keysRef.current.__medkitHeld && state.medkits > 0 && state.health < 100) {
        state.medkits -= 1;
        state.health = Math.min(100, state.health + 45);
        keysRef.current.__medkitHeld = true;
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
          if (document.pointerLockElement) document.exitPointerLock();
          state.xr?.rig.root.position.set(
            state.player.position.x,
            state.player.position.y,
            state.player.position.z
          );
          state.xr?.rig.root.rotation.set(0, state.yaw, 0);
          if (!state.running) state.xr?.menu.showMain();
          else state.xr?.menu.hide();
        } else if (state.xr) {
          detachWeaponsFromGrip(state.xr, state.camera, state.weaponViews);
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
      if (state.xr?.presenting) return;
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
      if (e.pointerType !== "touch" || e.clientX < window.innerWidth * 0.44) return;
      e.preventDefault();
      mobileInputRef.current.lastTouchAt = performance.now();
      mobileInputRef.current.lookPointerId = e.pointerId;
      mobileInputRef.current.lookX = e.clientX;
      mobileInputRef.current.lookY = e.clientY;
      state.renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onTouchPointerMove = (e: PointerEvent) => {
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

    const animate = () => {
      if (state.disposed) return;
      const dt = Math.min(0.033, state.clock.getDelta());
      if (state.running || state.xr?.presenting) updateGame(state, dt);
      state.mixers.forEach((mixer) => mixer.update(dt));
      updateAtmosphereSystem(state.atmosphere, state.scene, state.clock.elapsedTime, dt);
      state.renderer.render(state.scene, state.camera);
    };
    state.renderer.setAnimationLoop(animate);

    return () => {
      state.disposed = true;
      const win = window as unknown as { __darkSector?: GameState };
      if (win.__darkSector === state) delete win.__darkSector;
      state.renderer.setAnimationLoop(null);
      if (state.xr) {
        disposeXRRuntime(state.xr, state.renderer, state.scene, state.camera, state.weaponViews);
        state.xr = null;
      }
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
        startMission();
        break;
      case "range":
        state.xr.menu.hide();
        startShootingRange();
        break;
      case "resume":
        state.xr.menu.hide();
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
        <div
          data-testid="combat-crosshair"
          className={`pointer-events-none absolute left-1/2 top-1/2 z-20 h-9 w-9 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] transition-transform duration-75 ${hitFlash ? "scale-125" : ""}`}
        >
          <div className={`absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 border-y border-black/55 ${hitFlash ? "bg-rose-300" : "bg-[#e7eadf]"}`} />
          <div className={`absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 border-y border-black/55 ${hitFlash ? "bg-rose-300" : "bg-[#e7eadf]"}`} />
          <div className={`absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 border-x border-black/55 ${hitFlash ? "bg-rose-300" : "bg-[#e7eadf]"}`} />
          <div className={`absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 border-x border-black/55 ${hitFlash ? "bg-rose-300" : "bg-[#e7eadf]"}`} />
          <div className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/80 ${hitFlash ? "bg-rose-300" : "bg-[#dce2cf]"}`} />
          {hitFlash ? <div className="absolute inset-[-6px] rounded-full border-2 border-rose-400/90" /> : null}
        </div>
      ) : null}

      {hud.contact && !(hud.missionBanner || missionBanner) ? (
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

      {hud.damageBearing === "left" ? (
        <div className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2 border-l-4 border-rose-400 pl-2 text-2xl font-black text-rose-300">‹</div>
      ) : null}
      {hud.damageBearing === "right" ? (
        <div className="pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2 border-r-4 border-rose-400 pr-2 text-2xl font-black text-rose-300">›</div>
      ) : null}
      {hud.damageBearing === "rear" ? (
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
                  if (state && state.medkits > 0 && state.health < 100) {
                    state.medkits -= 1;
                    state.health = Math.min(100, state.health + 45);
                  }
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
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-200/85">Operation Iron Veil · AO-17</div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
                    Hostile forces have seized the compound. Breach the perimeter, control the yard, and hold through escalating counterattacks until extraction is authorized.
                  </p>
                </div>

                <div className="mt-6 flex w-full max-w-sm flex-col gap-3 sm:mt-8">
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
                      <span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-slate-600">Solo · Missions / Waves</span>
                      <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.12em] sm:text-base">Enter compound</span>
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
                    ["Insertion", "North Gate"],
                    ["Support", "Limited"],
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
                      gameRef.current.camera.fov = next.fov;
                      gameRef.current.camera.updateProjectionMatrix();
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
                      const mobile = isTouchDevice();
                      const gfx = graphicsConfig(mobile ? "low" : next.graphics);
                      state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : gfx.pixelRatioCap));
                      state.renderer.shadowMap.enabled = !mobile && next.graphics !== "low";
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
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(159,35,35,.2),transparent_38%),linear-gradient(135deg,rgba(4,7,6,.96),rgba(10,7,6,.86),rgba(2,3,3,.98))]" />
          <div className="pointer-events-none fixed inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-rose-500/70 to-transparent" />

          <main className="relative mx-auto flex min-h-full w-full max-w-4xl items-center px-4 py-6 sm:px-8 sm:py-10">
            <section className="w-full border border-slate-200/15 bg-black/50 shadow-[0_30px_100px_rgba(0,0,0,.7)] backdrop-blur-md">
              <div className="border-b border-rose-300/15 px-5 py-5 sm:px-8 sm:py-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.28em] text-rose-300/80 sm:text-[10px]">
                    <span className="h-2 w-2 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.9)]" />
                    After-action report
                  </div>
                  <div className="border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.22em] text-rose-200">
                    Mission status · Failed
                  </div>
                </div>
                <h2 className="mt-5 text-[clamp(2.65rem,9vw,6.5rem)] font-black uppercase leading-[0.82] tracking-[-0.055em] text-slate-100">
                  Compound
                  <span className="block text-rose-400 [text-shadow:0_0_35px_rgba(251,113,133,.2)]">Overrun</span>
                </h2>
                <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                  Defensive line collapsed under hostile pressure. Command has retained your combat telemetry for immediate redeployment.
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
                  <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-200/70">Command recommendation</div>
                  <p className="mt-1 text-xs text-slate-400">Reload early, preserve medkits, and isolate fast-moving scouts.</p>
                </div>
                <button
                  type="button"
                  onClick={startMission}
                  className="group flex min-h-14 w-full items-center justify-between bg-cyan-100 px-5 text-left text-slate-950 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200 sm:w-64"
                >
                  <span>
                    <span className="block text-[8px] font-bold uppercase tracking-[0.22em] text-slate-600">Authorize redeployment</span>
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
