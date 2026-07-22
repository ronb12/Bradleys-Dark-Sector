import * as THREE from "three";
import type { WeaponId } from "./weapons";

/** Procedural, asset-free 3.2× compact combat optic for the M4 viewmodel. */
export function createM4Scope() {
  const optic = new THREE.Group();
  optic.name = "M4 3.2x combat optic";

  const anodized = new THREE.MeshStandardMaterial({
    color: 0x111416,
    roughness: 0.38,
    metalness: 0.82,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x050606,
    roughness: 0.9,
    metalness: 0.05,
  });
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0x274943,
    emissive: 0x071614,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.12,
    transmission: 0.22,
    transparent: true,
    opacity: 0.82,
  });

  // Keep the optic in physical proportion to the 0.26-wide receiver. The old
  // 0.28-wide objective was wider than the carbine and filled the XR sightline.
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.28, 24), anodized);
  tube.rotation.x = Math.PI / 2;
  optic.add(tube);

  const frontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.062, 0.09, 24), anodized);
  frontBell.rotation.x = Math.PI / 2;
  frontBell.position.z = -0.185;
  optic.add(frontBell);

  const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 24), rubber);
  eyepiece.rotation.x = Math.PI / 2;
  eyepiece.position.z = 0.185;
  optic.add(eyepiece);

  const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.066, 32), lens);
  frontLens.position.z = -0.231;
  optic.add(frontLens);

  const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.058, 32), lens.clone());
  rearLens.rotation.y = Math.PI;
  rearLens.position.z = 0.231;
  optic.add(rearLens);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.32), anodized);
  rail.position.y = -0.085;
  optic.add(rail);
  for (const z of [-0.09, 0.09]) {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.04), anodized);
    mount.position.set(0, -0.07, z);
    optic.add(mount);
  }

  const elevation = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.045, 16), anodized);
  elevation.position.y = 0.083;
  optic.add(elevation);
  const windage = elevation.clone();
  windage.rotation.z = Math.PI / 2;
  windage.position.set(0.08, 0, 0);
  optic.add(windage);

  // This is the established ADS axis; changing geometry must not move it.
  optic.position.set(0, 0.2, -0.12);
  optic.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });
  return optic;
}

export const RIFLE_SCOPE_MAGNIFICATION = 3.2;
export const ADS_SENSITIVITY_MULTIPLIER = 0.34;

export function adsFov(baseFov: number, weapon: WeaponId) {
  return weapon === "m4"
    ? THREE.MathUtils.clamp(baseFov / RIFLE_SCOPE_MAGNIFICATION, 18, 30)
    : THREE.MathUtils.clamp(baseFov * 0.78, 42, baseFov);
}
