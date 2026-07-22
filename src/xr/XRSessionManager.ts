import * as THREE from "three";
import type { WeaponId } from "../game/weapons";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { xrGraphicsConfig } from "../game/settings";
import { XRRig } from "./XRRig";
import { XRInput } from "./XRInput";
import { XRHud } from "./XRHud";
import { XRMenu } from "./XRMenu";
import { XRReticle } from "./XRReticle";
import type { XRMenuAction } from "./types";

export type XRRuntime = {
  rig: XRRig;
  input: XRInput;
  hud: XRHud;
  menu: XRMenu;
  reticle: XRReticle;
  presenting: boolean;
  buttonEl: HTMLElement | null;
  weaponsOnGrip: boolean;
  previousPixelRatio: number;
  previousShadow: boolean;
  previousFog: number;
  selectWasDown: boolean;
  vignette: THREE.Mesh;
};

type SessionCallbacks = {
  onPresentingChange: (presenting: boolean) => void;
  onMenuAction: (action: XRMenuAction) => void;
};

/** True while an immersive-vr session owns the framebuffer / headset pose. */
export function isXrPresenting(
  renderer: THREE.WebGLRenderer,
  runtime?: Pick<XRRuntime, "presenting"> | null
) {
  return Boolean(runtime?.presenting || renderer.xr.isPresenting);
}

export function createXRRuntime(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mount: HTMLElement,
  callbacks: SessionCallbacks
): XRRuntime {
  renderer.xr.enabled = true;
  // Must be set before the session starts — ignored if changed mid-session.
  if (typeof renderer.xr.setReferenceSpaceType === "function") {
    renderer.xr.setReferenceSpaceType("local-floor");
  }
  if (typeof renderer.xr.setFramebufferScaleFactor === "function") {
    renderer.xr.setFramebufferScaleFactor(xrGraphicsConfig().framebufferScale);
  }

  const rig = new XRRig(scene, camera);
  // Controllers share the locomotion origin with the camera (see XRInput).
  const input = new XRInput(renderer, rig.root);
  const hud = new XRHud(scene);
  const menu = new XRMenu(scene, (action) => callbacks.onMenuAction(action));
  const reticle = new XRReticle(scene);

  let buttonEl: HTMLElement | null = null;
  try {
    buttonEl = VRButton.createButton(renderer);
    buttonEl.style.position = "absolute";
    buttonEl.style.bottom = "18px";
    buttonEl.style.left = "50%";
    buttonEl.style.transform = "translateX(-50%)";
    buttonEl.style.zIndex = "50";
    buttonEl.dataset.testid = "enter-vr";
    // Hide the loud "VR NOT SUPPORTED" chip on desktop / unsupported browsers.
    buttonEl.style.display = "none";
    mount.appendChild(buttonEl);
    const syncVrButtonVisibility = () => {
      if (!buttonEl) return;
      const label = (buttonEl.textContent || "").toUpperCase();
      const unsupported = label.includes("NOT SUPPORTED") || label.includes("WEBXR NOT AVAILABLE");
      buttonEl.style.display = unsupported ? "none" : "inline-block";
    };
    void (async () => {
      try {
        const xr = navigator.xr;
        const ok = Boolean(xr && (await xr.isSessionSupported("immersive-vr")));
        if (!ok) {
          if (buttonEl) buttonEl.style.display = "none";
          return;
        }
        syncVrButtonVisibility();
      } catch {
        if (buttonEl) buttonEl.style.display = "none";
      }
    })();
    const observer = new MutationObserver(syncVrButtonVisibility);
    observer.observe(buttonEl, { childList: true, characterData: true, subtree: true });
    (buttonEl as HTMLElement & { __vrObs?: MutationObserver }).__vrObs = observer;
  } catch {
    buttonEl = null;
  }

  const vignette = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.92, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  vignette.position.z = -0.4;
  vignette.renderOrder = 999;
  vignette.visible = false;

  const runtime: XRRuntime = {
    rig,
    input,
    hud,
    menu,
    reticle,
    presenting: false,
    buttonEl,
    weaponsOnGrip: false,
    previousPixelRatio: renderer.getPixelRatio(),
    previousShadow: renderer.shadowMap.enabled,
    previousFog: scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0.01,
    selectWasDown: false,
    vignette,
  };

  const onStart = () => {
    runtime.presenting = true;
    runtime.previousPixelRatio = renderer.getPixelRatio();
    runtime.previousShadow = renderer.shadowMap.enabled;
    runtime.previousFog = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0.01;
    rig.enterSession(camera);
    // FPS viewmodels are head-locked — hide until grip-attached or they read as a
    // face-glued "screen" that moves with every head turn on Quest.
    for (const child of [...camera.children]) {
      if (child === vignette) continue;
      child.visible = false;
      child.userData._xrHiddenViewmodel = true;
    }
    camera.add(vignette);
    vignette.visible = true;
    (vignette.material as THREE.MeshBasicMaterial).opacity = 0;
    applyXrGraphics(renderer, scene, true);
    input.setRaysVisible(true);
    input.bindSession(renderer.xr.getSession());
    // Keep the tactical HUD out of the startup menu; overlapping world panels
    // at different depths are uncomfortable and look duplicated per eye.
    hud.setVisible(false);
    reticle.setVisible(false);
    menu.showMain();
    if (document.pointerLockElement) document.exitPointerLock();
    callbacks.onPresentingChange(true);
  };

  const onEnd = () => {
    runtime.presenting = false;
    runtime.weaponsOnGrip = false;
    input.bindSession(null);
    camera.remove(vignette);
    vignette.visible = false;
    (vignette.material as THREE.MeshBasicMaterial).opacity = 0;
    camera.traverse((obj) => {
      if (!obj.userData._xrHiddenViewmodel) return;
      delete obj.userData._xrHiddenViewmodel;
      // Player weapon meshes stay crosshair-only — never restore them on exit.
      if (obj.userData.playerViewmodel && !PLAYER_WEAPON_MESHES_VISIBLE) {
        obj.visible = false;
        return;
      }
      obj.visible = true;
    });
    rig.exitSession(camera, scene);
    applyXrGraphics(renderer, scene, false, runtime);
    input.setRaysVisible(false);
    hud.setVisible(false);
    reticle.setVisible(false);
    menu.hide();
    callbacks.onPresentingChange(false);
  };

  renderer.xr.addEventListener("sessionstart", onStart);
  renderer.xr.addEventListener("sessionend", onEnd);
  (runtime as XRRuntime & { _onStart: () => void; _onEnd: () => void })._onStart = onStart;
  (runtime as XRRuntime & { _onStart: () => void; _onEnd: () => void })._onEnd = onEnd;

  return runtime;
}

function applyXrGraphics(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  entering: boolean,
  runtime?: XRRuntime
) {
  if (entering) {
    const gfx = xrGraphicsConfig();
    // Do NOT call setPixelRatio here — WebXRManager already sets it to 1 when the
    // session starts; changing `_pixelRatio` mid-present can desync the XR layer
    // and read as a head-locked "screen" on Quest Browser.
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = gfx.fogDensity;
    // Cheap XR soften pass — only touch known heavy lights / fog planes (no full-scene
    // traverse on sessionstart; that hitch was freezing Quest's VR runtime).
    for (const obj of scene.children) {
      softenObjectForXr(obj);
    }
  } else if (runtime) {
    if (typeof renderer.xr.setFramebufferScaleFactor === "function") {
      renderer.xr.setFramebufferScaleFactor(1);
    }
    renderer.setPixelRatio(runtime.previousPixelRatio);
    renderer.shadowMap.enabled = runtime.previousShadow;
    renderer.shadowMap.autoUpdate = true;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = runtime.previousFog;
    scene.traverse((obj) => {
      if (obj.userData._xrHiddenFog) {
        obj.visible = true;
        delete obj.userData._xrHiddenFog;
      }
      if (typeof obj.userData._xrPrevCastShadow === "boolean") {
        obj.castShadow = obj.userData._xrPrevCastShadow;
        delete obj.userData._xrPrevCastShadow;
      }
      if (obj instanceof THREE.PointLight && typeof obj.userData._xrPrevIntensity === "number") {
        obj.intensity = obj.userData._xrPrevIntensity;
        delete obj.userData._xrPrevIntensity;
      }
    });
  }
}

function softenObjectForXr(obj: THREE.Object3D) {
  if (obj.name === "SkyDome") return;
  if (obj instanceof THREE.Mesh) {
    if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.opacity < 0.08) {
      obj.visible = false;
      obj.userData._xrHiddenFog = true;
    }
    obj.userData._xrPrevCastShadow = obj.castShadow;
    obj.castShadow = false;
  }
  if (obj instanceof THREE.PointLight && obj.userData.fireLight) {
    obj.userData._xrPrevIntensity = obj.intensity;
    obj.intensity = Math.min(obj.intensity, 1.6);
    obj.distance = Math.min(obj.distance || 16, 10);
  }
  // One level of children only — enough for fire groups / fog planes without walking the whole compound.
  for (const child of obj.children) {
    if (child instanceof THREE.Mesh || child instanceof THREE.PointLight || child.name?.includes("Fog")) {
      softenObjectForXr(child);
    }
  }
}

/**
 * Player FPS / grip weapon meshes stay hidden — aim via desktop crosshair or
 * XRReticle. Mechanics still use activeWeapon + controller shot pose.
 * Flip to true only when shipping visible viewmodels again.
 */
export const PLAYER_WEAPON_MESHES_VISIBLE = false;

/** Tag + force visibility for all player weapon view groups. */
export function applyPlayerWeaponVisibility(weapons: Record<WeaponId, THREE.Group>) {
  for (const weapon of Object.values(weapons)) {
    weapon.userData.playerViewmodel = true;
    weapon.visible = PLAYER_WEAPON_MESHES_VISIBLE;
    // Session-end restore must never re-show these while meshes are disabled.
    delete weapon.userData._xrHiddenViewmodel;
  }
}

export function attachWeaponsToGrip(
  runtime: XRRuntime,
  weapons: Record<WeaponId, THREE.Group>,
  active: WeaponId
) {
  const grip = runtime.input.getWeaponGrip();
  if (!grip) return false;
  for (const weapon of Object.values(weapons)) {
    delete weapon.userData._xrHiddenViewmodel;
    if (weapon.parent !== grip) grip.add(weapon);
    weapon.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        delete child.userData._xrHiddenViewmodel;
      }
    });
  }
  // Keep physical grip-local poses for shot-origin consistency even while meshes
  // are invisible (crosshair / XRReticle carry aiming feedback).
  weapons.m4.scale.setScalar(0.58);
  weapons.m4.position.set(0, -0.11, -0.29);
  weapons.m4.rotation.set(-0.16, 0, 0);
  weapons.smg.scale.set(0.5, 0.5, 0.44);
  weapons.smg.position.set(0, -0.1, -0.24);
  weapons.smg.rotation.set(-0.14, 0, 0);
  weapons.pistol.scale.setScalar(0.68);
  weapons.pistol.position.set(0, -0.13, -0.16);
  weapons.pistol.rotation.set(-0.12, 0, 0);
  void active;
  applyPlayerWeaponVisibility(weapons);
  runtime.weaponsOnGrip = true;
  return true;
}

export function detachWeaponsFromGrip(
  runtime: XRRuntime,
  camera: THREE.PerspectiveCamera,
  weapons: Record<WeaponId, THREE.Group>
) {
  camera.add(...Object.values(weapons));
  weapons.m4.position.set(0.55, -0.55, -1.1);
  weapons.m4.rotation.set(-0.08, -0.1, 0.05);
  weapons.smg.position.set(0.5, -0.52, -1);
  weapons.smg.rotation.set(-0.08, -0.1, 0.05);
  weapons.pistol.position.set(0.3, -0.43, -0.82);
  weapons.pistol.rotation.set(-0.04, -0.08, 0.03);
  weapons.m4.scale.setScalar(1);
  weapons.smg.scale.set(0.82, 0.82, 0.72);
  weapons.pistol.scale.setScalar(1);
  applyPlayerWeaponVisibility(weapons);
  runtime.weaponsOnGrip = false;
}

export async function endXRSession(renderer: THREE.WebGLRenderer) {
  const session = renderer.xr.getSession();
  if (session) await session.end();
}

export function disposeXRRuntime(
  runtime: XRRuntime,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  weapons: Record<WeaponId, THREE.Group>
) {
  const tagged = runtime as XRRuntime & { _onStart?: () => void; _onEnd?: () => void };
  if (tagged._onStart) renderer.xr.removeEventListener("sessionstart", tagged._onStart);
  if (tagged._onEnd) renderer.xr.removeEventListener("sessionend", tagged._onEnd);
  detachWeaponsFromGrip(runtime, camera, weapons);
  runtime.hud.dispose(scene);
  runtime.menu.dispose(scene);
  runtime.reticle.dispose(scene);
  runtime.input.dispose();
  runtime.rig.exitSession(camera, scene);
  runtime.rig.dispose(scene);
  camera.remove(runtime.vignette);
  runtime.vignette.geometry.dispose();
  (runtime.vignette.material as THREE.Material).dispose();
  if (runtime.buttonEl?.parentElement) runtime.buttonEl.parentElement.removeChild(runtime.buttonEl);
  void endXRSession(renderer);
  runtime.presenting = false;
}

export function updateComfortVignette(runtime: XRRuntime, moving: boolean, enabled: boolean, dt: number) {
  const mat = runtime.vignette.material as THREE.MeshBasicMaterial;
  const target = enabled && moving ? 0.55 : 0;
  mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 10, dt);
}
