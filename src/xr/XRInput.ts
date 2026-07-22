import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import type { XRFrameInput, ShotPose } from "./types";

type Handedness = "left" | "right" | "none";

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
const SNAP_DEADZONE = 0.7;
const SNAP_RESET = 0.3;
const TRIGGER_THRESHOLD = 0.18;

/**
 * Quest Touch / xr-standard mapping:
 * buttons[0] trigger, [1] grip, [3] stick click, [4] A/X, [5] B/Y
 * axes[2]/[3] thumbstick X/Y
 *
 * Defaults (right-hand weapon):
 * - Left stick: move
 * - Right stick X: snap turn
 * - Right trigger: fire
 * - Right grip: ADS
 * - X: reload · Y: menu · A: interact · B: swap · right stick click: grenade
 * - Left stick click: medkit · Left grip: crouch · Left trigger: sprint
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
  private onSessionSelectStart = (event: Event) => {
    const source = (event as XRInputSourceEvent).inputSource;
    if (!source || source.targetRayMode === "gaze") return;
    // Prefer right; if Quest reports "none", still treat as weapon fire.
    if (source.handedness === "left") return;
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
      grip.add(this.factory.createControllerModel(grip));
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
    if (!gp || gp.axes.length < 4) return { x: 0, y: 0 };
    return { x: gp.axes[2] ?? 0, y: gp.axes[3] ?? 0 };
  }

  private pressed(gp: Gamepad | null, index: number) {
    return Boolean(gp?.buttons[index]?.pressed);
  }

  private value(gp: Gamepad | null, index: number) {
    return gp?.buttons[index]?.value ?? 0;
  }

  private weaponTriggerDown(weaponPad: Gamepad | null) {
    const slot = this.weaponSlot();
    return Boolean(
      slot?.selectHeld ||
        this.sessionFireHeld ||
        this.value(weaponPad, 0) > TRIGGER_THRESHOLD ||
        this.pressed(weaponPad, 0)
    );
  }

  poll(snapDegrees: number): XRFrameInput & { snapRadians: number } {
    this.syncHandednessFromSession();
    const left = this.readGamepad("left");
    const right = this.readGamepad("right");
    const weaponPad = this.readWeaponGamepad() ?? right;
    const leftStick = this.axisPair(left);
    const rightStick = this.axisPair(right ?? weaponPad);

    let moveX = Math.abs(leftStick.x) > STICK_DEADZONE ? leftStick.x : 0;
    // Stick forward is negative Y on Quest / xr-standard.
    let moveY = Math.abs(leftStick.y) > STICK_DEADZONE ? -leftStick.y : 0;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    let snapTurn: -1 | 0 | 1 = 0;
    let snapRadians = 0;
    if (this.canSnap && Math.abs(rightStick.x) > SNAP_DEADZONE) {
      snapTurn = rightStick.x > 0 ? 1 : -1;
      snapRadians = -snapTurn * THREE.MathUtils.degToRad(snapDegrees);
      this.canSnap = false;
    } else if (Math.abs(rightStick.x) < SNAP_RESET) {
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

    return {
      moveX,
      moveY,
      snapTurn,
      snapRadians,
      // Quest select-event + session select + gamepad — do not require handedness === "right".
      fire: this.weaponTriggerDown(weaponPad),
      ads: this.value(weaponPad, 1) > 0.5 || this.pressed(weaponPad, 1),
      reload,
      interact,
      swap,
      throwGrenade,
      medkit,
      crouch: this.pressed(left, 1),
      menu,
      sprint: this.value(left, 0) > 0.55,
    };
  }

  getShotPose(): ShotPose | null {
    const source = this.getWeaponGrip() ?? this.getWeaponTarget();
    if (!source) return null;
    source.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    source.getWorldPosition(origin);
    source.getWorldQuaternion(this.tmpQuat);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.tmpQuat).normalize();
    origin.addScaledVector(direction, 0.22);
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
