import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import type { XRFrameInput, ShotPose } from "./types";

type Handedness = "left" | "right" | "none";

type ControllerSlot = {
  index: number;
  target: THREE.Group;
  grip: THREE.Group;
  handedness: Handedness;
};

const STICK_DEADZONE = 0.18;
const SNAP_DEADZONE = 0.7;
const SNAP_RESET = 0.3;

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
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private tmpQuat = new THREE.Quaternion();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;

    for (let i = 0; i < 2; i += 1) {
      const target = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(this.factory.createControllerModel(grip));
      scene.add(target);
      scene.add(grip);

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

      const slot: ControllerSlot = { index: i, target, grip, handedness: "none" };
      target.addEventListener("connected", (event) => {
        const data = (event as unknown as { data?: XRInputSource }).data;
        slot.handedness = (data?.handedness as Handedness) || "none";
      });
      target.addEventListener("disconnected", () => {
        slot.handedness = "none";
      });
      this.slots.push(slot);
    }
  }

  getWeaponGrip(): THREE.Group | null {
    return this.slotByHand("right")?.grip ?? this.slots[1]?.grip ?? null;
  }

  getWeaponTarget(): THREE.Group | null {
    return this.slotByHand("right")?.target ?? this.slots[1]?.target ?? null;
  }

  getUiRayTarget(): THREE.Group | null {
    return this.slotByHand("right")?.target ?? this.slotByHand("left")?.target ?? this.slots[0]?.target ?? null;
  }

  setRaysVisible(visible: boolean) {
    this.rays.forEach((ray) => {
      ray.visible = visible;
    });
  }

  private slotByHand(hand: Handedness) {
    return this.slots.find((s) => s.handedness === hand) ?? null;
  }

  private readGamepad(hand: Handedness): Gamepad | null {
    const session = this.renderer.xr.getSession();
    if (!session) return null;
    for (const source of session.inputSources) {
      if (source.handedness === hand && source.gamepad) return source.gamepad;
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

  poll(snapDegrees: number): XRFrameInput & { snapRadians: number } {
    const left = this.readGamepad("left");
    const right = this.readGamepad("right");
    const leftStick = this.axisPair(left);
    const rightStick = this.axisPair(right);

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
    const aBtn = this.pressed(right, 4);
    const bBtn = this.pressed(right, 5);
    const stickClick = this.pressed(left, 3);
    const rightStickClick = this.pressed(right, 3);

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
      fire: this.value(right, 0) > 0.35 || this.pressed(right, 0),
      ads: this.value(right, 1) > 0.5 || this.pressed(right, 1),
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
    for (const slot of this.slots) {
      this.scene.remove(slot.target);
      this.scene.remove(slot.grip);
    }
    this.slots = [];
  }
}
