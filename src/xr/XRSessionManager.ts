import * as THREE from "three";
import type { WeaponId } from "../game/weapons";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { graphicsConfig, type GraphicsPreset } from "../game/settings";
import { XRRig } from "./XRRig";
import { XRInput } from "./XRInput";
import { XRHud } from "./XRHud";
import { XRMenu } from "./XRMenu";
import type { XRMenuAction } from "./types";

export type XRRuntime = {
  rig: XRRig;
  input: XRInput;
  hud: XRHud;
  menu: XRMenu;
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

export function createXRRuntime(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mount: HTMLElement,
  callbacks: SessionCallbacks
): XRRuntime {
  renderer.xr.enabled = true;

  const rig = new XRRig(scene, camera);
  const input = new XRInput(renderer, scene);
  const hud = new XRHud(scene);
  const menu = new XRMenu(scene, (action) => callbacks.onMenuAction(action));

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
    camera.add(vignette);
    vignette.visible = true;
    applyXrGraphics(renderer, scene, true);
    input.setRaysVisible(true);
    hud.setVisible(true);
    menu.showMain();
    if (document.pointerLockElement) document.exitPointerLock();
    callbacks.onPresentingChange(true);
  };

  const onEnd = () => {
    runtime.presenting = false;
    runtime.weaponsOnGrip = false;
    camera.remove(vignette);
    vignette.visible = false;
    (vignette.material as THREE.MeshBasicMaterial).opacity = 0;
    rig.exitSession(camera, scene);
    applyXrGraphics(renderer, scene, false, runtime);
    input.setRaysVisible(false);
    hud.setVisible(false);
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
    const gfx = graphicsConfig("low" as GraphicsPreset);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = false;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = gfx.fogDensity * 1.05;
  } else if (runtime) {
    renderer.setPixelRatio(runtime.previousPixelRatio);
    renderer.shadowMap.enabled = runtime.previousShadow;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = runtime.previousFog;
  }
}

export function attachWeaponsToGrip(
  runtime: XRRuntime,
  weapons: Record<WeaponId, THREE.Group>,
  active: WeaponId
) {
  const grip = runtime.input.getWeaponGrip();
  if (!grip) return;
  for (const weapon of Object.values(weapons)) {
    if (weapon.parent !== grip) grip.add(weapon);
    weapon.position.set(0, -0.02, -0.08);
    weapon.rotation.set(-0.12, 0, 0);
  }
  weapons.m4.visible = active === "m4";
  weapons.smg.visible = active === "smg";
  weapons.pistol.visible = active === "pistol";
  runtime.weaponsOnGrip = true;
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
