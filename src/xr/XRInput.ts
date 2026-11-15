import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { XRFrameInput, ShotPose } from "./types";

type Handedness = "left" | "right" | "none";

/** CC0 Quaternius glove (see ASSET_LICENSES.md) — replaces the bare default
 * controller-ring visual so VR reads as gloved hands, not floating plastic. */
const GLOVE_MODEL_URL = "/models/quaternius-glove.glb";
/** Source export is millimeter-scale; normalize to a plausible hand length. */
const GLOVE_TARGET_LENGTH = 0.1;

type ControllerSlot = {
  index: number;
  target: THREE.Group;
  grip: THREE.Group;
  handedness: Handedness;
  selectHeld: boolean;
  /** Last XRInputSource bound to this Three.js controller index (may lag handedness events). */
  inputSource: XRInputSource | null;
};

const STICK_DEADZONE = 0.18;
const SNAP_DEADZONE = 0.55;
const SNAP_RESET = 0.28;
const SMOOTH_TURN_DEADZONE = 0.22;
const TRIGGER_THRESHOLD = 0.12;

/**
 * Quest Touch / xr-standard mapping:
 * buttons[0] trigger, [1] grip, [3] stick click, [4] A/X, [5] B/Y
 * axes[2]/[3] thumbstick X/Y
 *
 * Defaults (right-hand weapon):
 * - Left stick: move · push stick hard: sprint
 * - Right stick X: snap turn or smooth turn (settings)
 * - Either trigger: fire (Quest 3 Touch Plus)
 * - Right grip: ADS
 * - X: reload · Y: menu · A: interact · B: swap · right stick click: grenade
 * - Left stick click: medkit · Left grip: crouch
 */
export class XRInput {
  private slots: ControllerSlot[] = [];
  private canSnap = true;
  private prev = { x: false, y: false, a: false, b: false, stick: false, rightStick: false };
  private factory = new XRControllerModelFactory();
  private rays: THREE.Line[] = [];
  /** Must match the camera parent (XRRig) so locomotion/snap-turn stay coherent. */
  private parent: THREE.Object3D;
  private renderer: THREE.WebGLRenderer;
  private tmpQuat = new THREE.Quaternion();
  /** Session-level select fallback when controller handedness events are missing on Quest. */
  private sessionFireHeld = false;
  private sessionSelectSource: XRInputSource | null = null;
  private boundSession: XRSession | null = null;
  /** Default per-grip visual from XRControllerModelFactory — hidden once the glove loads. */
  private controllerModels: THREE.Object3D[] = [];
  private gloveTemplate: THREE.Object3D | null = null;
  private onSessionSelectStart = (event: Event) => {
    const source = (event as XRInputSourceEvent).inputSource;
    if (!source || source.targetRayMode === "gaze") return;
    // Quest 3 / Browser: accept either controller trigger as fire. Handedness is
    // often "none" briefly, and left-trigger-only players were previously ignored.
    this.sessionFireHeld = true;
    this.sessionSelectSource = source;
  };
  private onSessionSelectEnd = (event: Event) => {
    const source = (event as XRInputSourceEvent).inputSource;
    if (source && this.sessionSelectSource && source !== this.sessionSelectSource) return;
    this.sessionFireHeld = false;
    this.sessionSelectSource = null;
  };

  constructor(renderer: THREE.WebGLRenderer, parent: THREE.Object3D) {
    this.renderer = renderer;
    this.parent = parent;

    for (let i = 0; i < 2; i += 1) {
      const target = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const controllerModel = this.factory.createControllerModel(grip);
      grip.add(controllerModel);
      this.controllerModels.push(controllerModel);
      // Parent to the locomotion rig — same space as the XR camera — not the scene root.
      // Scene parenting leaves controllers in raw reference-space while the rig moves/yaws,
      // which reads as teleport jumps, weapon lag, and snap-turn desync on Quest.
      parent.add(target);
      parent.add(grip);

      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1.4),
      ]);
      const ray = new THREE.Line(
        rayGeo,
        new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 })
      );
      target.add(ray);
      this.rays.push(ray);

      const slot: ControllerSlot = {
        index: i,
        target,
        grip,
        handedness: "none",
        selectHeld: false,
        inputSource: null,
      };
      target.addEventListener("connected", (event) => {
        const data = (event as unknown as { data?: XRInputSource }).data ?? null;
        slot.inputSource = data;
        slot.handedness = (data?.handedness as Handedness) || "none";
      });
      target.addEventListener("disconnected", () => {
        slot.handedness = "none";
        slot.selectHeld = false;
        slot.inputSource = null;
      });
      // WebXR select events are more reliable than Gamepad buttons on Quest
      // Browser (especially after resuming an immersive session).
      target.addEventListener("selectstart", () => {
        slot.selectHeld = true;
      });
      target.addEventListener("selectend", () => {
        slot.selectHeld = false;
      });
      this.slots.push(slot);
    }

    void this.loadGloveModel();
  }

  /**
   * Best-effort glove load — on success, hides the default controller-ring
   * model on every grip and attaches a normalized glove clone instead. On
   * failure the default XRControllerModelFactory visuals are left in place.
   */
  private loadGloveModel() {
    const loader = new GLTFLoader();
    loader.load(
      GLOVE_MODEL_URL,
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const scale = GLOVE_TARGET_LENGTH / longest;
        const center = box.getCenter(new THREE.Vector3());
        scene.scale.setScalar(scale);
        // Re-center in scaled space so the mesh pivots near the grip origin
        // rather than around whatever offset the source file was authored at.
        scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        this.gloveTemplate = scene;
        this.applyGlovesToGrips();
      },
      undefined,
      () => {
        // Keep default controller visuals — no glove this session.
      },
    );
  }

  private applyGlovesToGrips() {
    if (!this.gloveTemplate) return;
    this.slots.forEach((slot, i) => {
      const controllerModel = this.controllerModels[i];
      if (controllerModel) controllerModel.visible = false;
      if (slot.grip.getObjectByName("XRGlove")) return;
      const glove = this.gloveTemplate!.clone(true);
      glove.name = "XRGlove";
      // Loose default pose wrapping the grip near the weapon mount point —
      // matches the -Z forward convention used by attachWeaponsToGrip.
      glove.rotation.set(0, Math.PI, 0);
      glove.position.set(0, -0.02, 0.02);
      slot.grip.add(glove);
    });
  }

  /** Bind session-level select listeners once an immersive session exists. */
  bindSession(session: XRSession | null) {
    if (this.boundSession === session) return;
    if (this.boundSession) {
      this.boundSession.removeEventListener("selectstart", this.onSessionSelectStart);
      this.boundSession.removeEventListener("selectend", this.onSessionSelectEnd);
    }
    this.boundSession = session;
    this.sessionFireHeld = false;
    this.sessionSelectSource = null;
    if (!session) return;
    session.addEventListener("selectstart", this.onSessionSelectStart);
    session.addEventListener("selectend", this.onSessionSelectEnd);
  }

  getWeaponGrip(): THREE.Group | null {
    return this.weaponSlot()?.grip ?? null;
  }

  getWeaponTarget(): THREE.Group | null {
    return this.weaponSlot()?.target ?? null;
  }

  getUiRayTarget(): THREE.Group | null {
    return this.weaponSlot()?.target ?? this.slotByHand("left")?.target ?? this.slots[0]?.target ?? null;
  }

  /** Controllers that can aim the VR menu (both hands). */
  getUiRayTargets(): THREE.Group[] {
    this.syncHandednessFromSession();
    const out: THREE.Group[] = [];
    for (const slot of this.slots) {
      if (!out.includes(slot.target)) out.push(slot.target);
    }
    return out;
  }

  /**
   * Menu select from either controller. Quest users often point with the left
   * hand while gameplay fire is bound to the right trigger only.
   */
  getUiSelectState(prevDown: boolean): { pressed: boolean; edge: boolean; source: THREE.Group | null } {
    this.syncHandednessFromSession();
    let pressed = this.sessionFireHeld;
    let source: THREE.Group | null = null;
    for (const slot of this.slots) {
      const pad = slot.inputSource?.gamepad
        ?? (slot.target as THREE.Object3D & { gamepad?: Gamepad }).gamepad
        ?? null;
      const down =
        slot.selectHeld
        || this.value(pad, 0) > TRIGGER_THRESHOLD
        || this.pressed(pad, 0);
      if (down) {
        pressed = true;
        source = slot.target;
        // Prefer the hand that is actively selecting for the aim ray.
        if (slot.selectHeld) break;
      }
    }
    if (!source && pressed) source = this.getUiRayTarget();
    return { pressed, edge: pressed && !prevDown, source };
  }

  setRaysVisible(visible: boolean) {
    this.rays.forEach((ray) => {
      ray.visible = visible;
    });
  }

  private slotByHand(hand: Handedness) {
    return this.slots.find((s) => s.handedness === hand) ?? null;
  }

  /**
   * Keep slot handedness in sync with live inputSources. Quest Browser sometimes
   * skips/reorders controller `connected` events after resume, leaving handedness
   * stuck at "none" so right-trigger fire and grip attach never resolve.
   */
  private syncHandednessFromSession() {
    const session = this.renderer.xr.getSession();
    this.bindSession(session ?? null);
    if (!session) return;

    const sources = [...session.inputSources];
    for (const slot of this.slots) {
      const fromEvent = slot.inputSource;
      if (fromEvent && sources.includes(fromEvent)) {
        slot.handedness = (fromEvent.handedness as Handedness) || slot.handedness;
        continue;
      }
      // Fall back: match by gamepad identity when Three.js controller index drifted.
      const gp = (slot.target as THREE.Object3D & { gamepad?: Gamepad }).gamepad;
      const matched = sources.find((source) => source.gamepad && gp && source.gamepad === gp);
      if (matched) {
        slot.inputSource = matched;
        slot.handedness = (matched.handedness as Handedness) || "none";
      }
    }

    // If still unresolved, assign unique left/right sources to empty slots by index order.
    const claimed = new Set(this.slots.map((s) => s.inputSource).filter(Boolean));
    for (const source of sources) {
      if (source.handedness !== "left" && source.handedness !== "right") continue;
      if (claimed.has(source)) continue;
      if (this.slotByHand(source.handedness as Handedness)) continue;
      const free = this.slots.find((s) => !s.inputSource || !sources.includes(s.inputSource));
      if (!free) continue;
      free.inputSource = source;
      free.handedness = source.handedness as Handedness;
      claimed.add(source);
    }
  }

  /** Prefer right hand; otherwise the only tracked controller; else controller index 1. */
  private weaponSlot(): ControllerSlot | null {
    this.syncHandednessFromSession();
    const right = this.slotByHand("right");
    if (right) return right;
    const tracked = this.slots.filter((s) => s.handedness !== "none");
    if (tracked.length === 1 && tracked[0].handedness !== "left") return tracked[0];
    if (tracked.length === 1) return tracked[0];
    // Unresolved handedness: prefer a slot that is actively selecting (trigger down).
    const selecting = this.slots.find((s) => s.selectHeld);
    if (selecting) return selecting;
    return this.slots[1] ?? this.slots[0] ?? null;
  }

  private readGamepad(hand: Handedness): Gamepad | null {
    const session = this.renderer.xr.getSession();
    if (!session) return null;
    for (const source of session.inputSources) {
      if (source.handedness === hand && source.gamepad) return source.gamepad;
    }
    return null;
  }

  private readWeaponGamepad(): Gamepad | null {
    const slot = this.weaponSlot();
    if (slot?.inputSource?.gamepad) return slot.inputSource.gamepad;
    const right = this.readGamepad("right");
    if (right) return right;
    // Last resort when Quest omits handedness on both sources.
    const session = this.renderer.xr.getSession();
    if (!session) return null;
    const sources = [...session.inputSources].filter((s) => s.gamepad);
    if (sources.length === 1 && sources[0].handedness !== "left") {
      return sources[0].gamepad ?? null;
    }
    return null;
  }

  private axisPair(gp: Gamepad | null): { x: number; y: number } {
    if (!gp?.axes?.length) return { x: 0, y: 0 };
    // xr-standard thumbstick is usually axes[2]/[3]; some runtimes only expose [0]/[1].
    if (gp.axes.length >= 4) {
      return { x: gp.axes[2] ?? 0, y: gp.axes[3] ?? 0 };
    }
    return { x: gp.axes[0] ?? 0, y: gp.axes[1] ?? 0 };
  }

  private pressed(gp: Gamepad | null, index: number) {
    return Boolean(gp?.buttons[index]?.pressed);
  }

  private value(gp: Gamepad | null, index: number) {
    return gp?.buttons[index]?.value ?? 0;
  }

  private triggerDownOnPad(gp: Gamepad | null) {
    if (!gp) return false;
    // Quest 3 analog trigger: value rises before `pressed` flips; use both.
    return this.value(gp, 0) > TRIGGER_THRESHOLD || this.pressed(gp, 0);
  }

  /**
   * Fire from either Quest controller trigger. Handedness / gamepad binding is
   * flaky on Quest Browser, so we OR select events, session select, and every
   * live inputSource gamepad — not only the resolved "right" slot.
   */
  private weaponTriggerDown(weaponPad: Gamepad | null) {
    let live = false;

    for (const slot of this.slots) {
      if (slot.selectHeld) live = true;
      const pad =
        slot.inputSource?.gamepad
        ?? (slot.target as THREE.Object3D & { gamepad?: Gamepad }).gamepad
        ?? null;
      if (this.triggerDownOnPad(pad)) live = true;
    }

    if (this.triggerDownOnPad(weaponPad)) live = true;
    if (this.triggerDownOnPad(this.readGamepad("right"))) live = true;
    if (this.triggerDownOnPad(this.readGamepad("left"))) live = true;

    const session = this.renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        if (source.targetRayMode === "gaze") continue;
        if (this.triggerDownOnPad(source.gamepad ?? null)) live = true;
      }
    }

    // Drop sticky session select if nothing is actually held (missed selectend).
    if (!live) this.sessionFireHeld = false;
    return live || this.sessionFireHeld;
  }

  poll(opts: {
    snapDegrees: number;
    turnMode?: "snap" | "smooth";
    smoothTurnSpeed?: number;
    dt?: number;
  }): XRFrameInput & { snapRadians: number; turnRadians: number; lookX: number } {
    const snapDegrees = opts.snapDegrees;
    const turnMode = opts.turnMode ?? "snap";
    const smoothTurnSpeed = opts.smoothTurnSpeed ?? 110;
    const dt = Math.max(0, opts.dt ?? 0);

    this.syncHandednessFromSession();
    const left = this.readGamepad("left");
    const right = this.readGamepad("right");
    const weaponPad = this.readWeaponGamepad() ?? right;
    // Prefer dedicated right pad for look/turn; fall back to weapon pad.
    const lookPad = right ?? weaponPad;
    const leftStick = this.axisPair(left);
    const rightStick = this.axisPair(lookPad);

    let moveX = Math.abs(leftStick.x) > STICK_DEADZONE ? leftStick.x : 0;
    // xr-standard: stick forward = negative Y. Negate so +moveY walks where you look.
    let moveY = Math.abs(leftStick.y) > STICK_DEADZONE ? -leftStick.y : 0;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const lookXRaw = rightStick.x;
    const lookX = Math.abs(lookXRaw) > (turnMode === "smooth" ? SMOOTH_TURN_DEADZONE : SNAP_DEADZONE)
      ? lookXRaw
      : 0;

    let snapTurn: -1 | 0 | 1 = 0;
    let snapRadians = 0;
    let turnRadians = 0;

    if (turnMode === "smooth") {
      if (lookX !== 0 && dt > 0) {
        // Stick right → clockwise (negative yaw in Three.js Y-up right-handed).
        turnRadians = -lookX * THREE.MathUtils.degToRad(smoothTurnSpeed) * dt;
      }
      this.canSnap = true;
    } else if (this.canSnap && Math.abs(lookXRaw) > SNAP_DEADZONE) {
      snapTurn = lookXRaw > 0 ? 1 : -1;
      snapRadians = -snapTurn * THREE.MathUtils.degToRad(snapDegrees);
      turnRadians = snapRadians;
      this.canSnap = false;
    } else if (Math.abs(lookXRaw) < SNAP_RESET) {
      this.canSnap = true;
    }

    const xBtn = this.pressed(left, 4);
    const yBtn = this.pressed(left, 5);
    const aBtn = this.pressed(right ?? weaponPad, 4);
    const bBtn = this.pressed(right ?? weaponPad, 5);
    const stickClick = this.pressed(left, 3);
    const rightStickClick = this.pressed(right ?? weaponPad, 3);

    const reload = xBtn && !this.prev.x;
    const menu = yBtn && !this.prev.y;
    const interact = aBtn && !this.prev.a;
    const swap = bBtn && !this.prev.b;
    const medkit = stickClick && !this.prev.stick;
    const throwGrenade = rightStickClick && !this.prev.rightStick;

    this.prev = { x: xBtn, y: yBtn, a: aBtn, b: bBtn, stick: stickClick, rightStick: rightStickClick };

    // Sprint: push left stick hard (left trigger is fire on Quest 3 now).
    const sprint = mag > 0.82;

    return {
      moveX,
      moveY,
      snapTurn,
      snapRadians,
      turnRadians,
      lookX,
      fire: this.weaponTriggerDown(weaponPad),
      ads: this.value(weaponPad, 1) > 0.5 || this.pressed(weaponPad, 1) || this.value(right, 1) > 0.5,
      reload,
      interact,
      swap,
      throwGrenade,
      medkit,
      crouch: this.pressed(left, 1),
      menu,
      sprint,
    };
  }

  getShotPose(): ShotPose | null {
    // Quest grip space aims along the handle (often skyward). Target-ray space is
    // the pointing direction the player expects when pulling the trigger.
    this.syncHandednessFromSession();
    for (const slot of this.slots) {
      slot.target.updateMatrixWorld(true);
      slot.grip.updateMatrixWorld(true);
    }
    const aim = this.getWeaponTarget() ?? this.getWeaponGrip();
    if (!aim) return null;
    const grip = this.getWeaponGrip();
    const origin = new THREE.Vector3();
    (grip ?? aim).getWorldPosition(origin);
    aim.getWorldQuaternion(this.tmpQuat);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.tmpQuat).normalize();
    // Muzzle sits ahead of the grip along the aim ray (controller tip / barrel).
    origin.addScaledVector(direction, 0.28);
    // Slight drop so hipfire isn't sky-high when the wrist rolls.
    origin.y -= 0.02;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.tmpQuat).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.tmpQuat).normalize();
    return { origin, direction, right, up };
  }

  dispose() {
    this.bindSession(null);
    for (const slot of this.slots) {
      this.parent.remove(slot.target);
      this.parent.remove(slot.grip);
    }
    this.slots = [];
  }
}
