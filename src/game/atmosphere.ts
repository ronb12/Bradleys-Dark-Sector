/** Atmosphere: weather, volumetric fog, sky, dynamic shadows, debris, smoke. */

import * as THREE from "three";

export type WeatherMode = "clear_night" | "dust_storm" | "rain" | "fog_bank";

export type AtmosphereState = {
  weather: WeatherMode;
  rain: THREE.Points | null;
  volumetricFog: THREE.Mesh[];
  debris: THREE.Points | null;
  sky: THREE.Mesh | null;
  wind: number;
  rainIntensity: number;
  nextWeatherAt: number;
  /** Tracked FX roots — avoids full-scene traverse every frame. */
  fireGroups: THREE.Object3D[];
  fireLights: THREE.PointLight[];
  spinObjects: THREE.Object3D[];
  smokeGroups: THREE.Object3D[];
  destructionGroups: THREE.Object3D[];
  /** Skip expensive particle buffer writes on constrained devices. */
  lowPower: boolean;
};

/** Soft disc sprite — bare PointsMaterial renders as hard squares on Quest WebGL. */
let softParticleMap: THREE.CanvasTexture | null = null;

export function getSoftParticleMap(): THREE.CanvasTexture {
  if (softParticleMap) return softParticleMap;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  softParticleMap = new THREE.CanvasTexture(canvas);
  softParticleMap.colorSpace = THREE.SRGBColorSpace;
  return softParticleMap;
}

export function softPointsMaterial(
  params: ConstructorParameters<typeof THREE.PointsMaterial>[0] = {},
): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    map: getSoftParticleMap(),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.02,
    ...params,
  });
}

export function createSkyDome(scene: THREE.Scene) {
  const geo = new THREE.SphereGeometry(280, 32, 16);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#05070c");
  grad.addColorStop(0.45, "#101820");
  grad.addColorStop(0.72, "#1a2418");
  grad.addColorStop(1, "#2a2818");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  // Stars
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = `rgba(220,230,255,${0.25 + Math.random() * 0.7})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 140, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = "SkyDome";
  scene.add(sky);
  return sky;
}

export function createVolumetricFogLayers(scene: THREE.Scene, count = 5) {
  const layers: THREE.Mesh[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(130 + Math.random() * 50, 130 + Math.random() * 50),
      new THREE.MeshBasicMaterial({
        color: 0x6a7568,
        transparent: true,
        opacity: 0.035 + Math.random() * 0.03,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((Math.random() - 0.5) * 60, 1.2 + i * 0.55, (Math.random() - 0.5) * 60);
    mesh.userData.drift = (Math.random() - 0.5) * 0.15;
    scene.add(mesh);
    layers.push(mesh);
  }
  return layers;
}

export function createRain(scene: THREE.Scene, intensity = 1) {
  const count = Math.floor(1100 * intensity);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 120;
    positions[i * 3 + 1] = Math.random() * 28;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = softPointsMaterial({
    color: 0xa8c4d8,
    size: 0.04,
    opacity: 0.32,
  });
  const rain = new THREE.Points(geo, mat);
  rain.visible = false;
  rain.userData.rain = true;
  scene.add(rain);
  return rain;
}

export function createDebrisField(scene: THREE.Scene, particleCount = 280) {
  const count = particleCount;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 140;
    positions[i * 3 + 1] = 0.2 + Math.random() * 3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = softPointsMaterial({ color: 0x7a6a4e, size: 0.05, opacity: 0.28 });
  const debris = new THREE.Points(geo, mat);
  debris.userData.debris = true;
  scene.add(debris);
  return debris;
}

export function initAtmosphere(
  scene: THREE.Scene,
  enableVolumetric: boolean,
  options?: { lowPower?: boolean; debrisCount?: number; rainIntensityScale?: number },
): AtmosphereState {
  const lowPower = Boolean(options?.lowPower);
  const sky = createSkyDome(scene);
  const volumetricFog = enableVolumetric ? createVolumetricFogLayers(scene, lowPower ? 2 : 3) : [];
  const rain = createRain(scene, options?.rainIntensityScale ?? (lowPower ? 0.35 : 0.7));
  const debris = createDebrisField(scene, options?.debrisCount ?? (lowPower ? 60 : 140));
  scene.background = new THREE.Color(0x0a100e);
  scene.fog = new THREE.FogExp2(0x1a2218, 0.0088);
  return {
    weather: "clear_night",
    rain,
    volumetricFog,
    debris,
    sky,
    wind: 0.4,
    rainIntensity: 0,
    nextWeatherAt: 45 + Math.random() * 40,
    fireGroups: [],
    fireLights: [],
    spinObjects: [],
    smokeGroups: [],
    destructionGroups: [],
    lowPower,
  };
}

export function registerAtmosphereFx(
  atmo: AtmosphereState,
  kind: "fire" | "fireLight" | "spin" | "smoke",
  obj: THREE.Object3D,
) {
  if (kind === "fire") atmo.fireGroups.push(obj);
  else if (kind === "fireLight" && obj instanceof THREE.PointLight) atmo.fireLights.push(obj);
  else if (kind === "spin") atmo.spinObjects.push(obj);
  else if (kind === "smoke") atmo.smokeGroups.push(obj);
}

export function setAtmosphereLowPower(atmo: AtmosphereState, lowPower: boolean) {
  atmo.lowPower = lowPower;
  for (const layer of atmo.volumetricFog) layer.visible = !lowPower;
  if (atmo.debris) atmo.debris.visible = !lowPower || atmo.weather === "dust_storm";
  if (atmo.rain && lowPower && atmo.weather !== "rain") atmo.rain.visible = false;
  // Compound dust field (Points) reads as floating blocks on Quest without soft maps / when oversized.
  for (const obj of atmo.spinObjects) {
    if (obj instanceof THREE.Points) obj.visible = !lowPower;
  }
}

export function setWeather(atmo: AtmosphereState, scene: THREE.Scene, weather: WeatherMode) {
  atmo.weather = weather;
  const fog = scene.fog as THREE.FogExp2 | null;
  if (weather === "clear_night") {
    atmo.rainIntensity = 0;
    atmo.wind = 0.35;
    if (fog) fog.density = 0.0085;
    if (atmo.rain) atmo.rain.visible = false;
  } else if (weather === "dust_storm") {
    atmo.rainIntensity = 0;
    atmo.wind = 1.6;
    if (fog) {
      fog.density = 0.014;
      fog.color.setHex(0x3a3224);
    }
    if (atmo.rain) atmo.rain.visible = false;
    if (atmo.debris) atmo.debris.visible = true;
  } else if (weather === "rain") {
    atmo.rainIntensity = 1;
    atmo.wind = 0.8;
    if (fog) {
      fog.density = 0.011;
      fog.color.setHex(0x1a2430);
    }
    if (atmo.rain) atmo.rain.visible = true;
  } else {
    atmo.rainIntensity = 0;
    atmo.wind = 0.25;
    if (fog) {
      fog.density = 0.018;
      fog.color.setHex(0x2a332c);
    }
    if (atmo.rain) atmo.rain.visible = false;
  }
}

export function updateAtmosphereSystem(atmo: AtmosphereState, scene: THREE.Scene, time: number, dt: number) {
  if (time > atmo.nextWeatherAt) {
    const modes: WeatherMode[] = ["clear_night", "dust_storm", "rain", "fog_bank"];
    // Avoid thrashing weather on low-power / XR — stick to clearer nights more often.
    const pick = atmo.lowPower
      ? modes[Math.floor(Math.random() * 2)]
      : modes[Math.floor(Math.random() * modes.length)];
    setWeather(atmo, scene, pick);
    atmo.nextWeatherAt = time + (atmo.lowPower ? 80 : 50) + Math.random() * 55;
  }

  for (const layer of atmo.volumetricFog) {
    if (!layer.visible) continue;
    layer.position.x += layer.userData.drift * atmo.wind * dt;
    layer.rotation.z = Math.sin(time * 0.1 + layer.position.y) * 0.04;
    if (Math.abs(layer.position.x) > 50) layer.userData.drift *= -1;
  }

  // Rain: on low power, update every other particle stride and skip some frames.
  if (atmo.rain?.visible) {
    const skipHeavy = atmo.lowPower && Math.floor(time * 30) % 2 === 1;
    if (!skipHeavy) {
      const pos = atmo.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
      const stride = atmo.lowPower ? 2 : 1;
      for (let i = 0; i < pos.count; i += stride) {
        let y = pos.getY(i) - (14 + atmo.wind * 4) * dt * stride;
        let x = pos.getX(i) + atmo.wind * 2.5 * dt * stride;
        if (y < 0) {
          y = 18 + Math.random() * 10;
          x = (Math.random() - 0.5) * 80;
        }
        pos.setXYZ(i, x, y, pos.getZ(i));
      }
      pos.needsUpdate = true;
    }
  }

  if (atmo.debris?.visible) {
    atmo.debris.rotation.y += 0.0004 * atmo.wind;
    // Per-particle drift is expensive — only run on dust storms / desktop.
    if (!atmo.lowPower || atmo.weather === "dust_storm") {
      const pos = atmo.debris.geometry.getAttribute("position") as THREE.BufferAttribute;
      const stride = atmo.lowPower ? 3 : 1;
      for (let i = 0; i < pos.count; i += stride) {
        let x = pos.getX(i) + atmo.wind * 0.8 * dt * stride;
        if (x > 50) x = -50;
        if (x < -50) x = 50;
        pos.setX(i, x);
      }
      pos.needsUpdate = true;
    }
  }

  for (const obj of atmo.fireGroups) {
    obj.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
        child.scale.y = 0.8 + Math.sin(time * 8 + child.position.x * 5) * 0.18;
        child.rotation.y += 0.03;
      }
    });
  }
  for (const light of atmo.fireLights) {
    if (!light.visible) continue;
    // Deterministic flicker — Math.random() every frame hurts both CPU and GPU light updates.
    light.intensity = 3.4 + Math.sin(time * 12 + light.id) * 0.85;
  }
  for (const obj of atmo.spinObjects) {
    obj.rotation.y += 0.0008;
  }
  for (const obj of atmo.smokeGroups) {
    obj.children.forEach((child) => {
      child.position.y += Math.sin(time + child.userData.floatOffset) * 0.0015;
      child.rotation.y += 0.001;
    });
  }
}

export function spawnDestructionBurst(scene: THREE.Scene, x: number, z: number, atmo?: AtmosphereState) {
  const group = new THREE.Group();
  group.position.set(x, 0.2, z);

  if (atmo?.lowPower) {
    // Soft ember sparks only — BoxGeometry chunks read as literal blocks flying through XR view.
    const count = 10;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = 0.2 + Math.random() * 0.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      velocities.push(
        new THREE.Vector3((Math.random() - 0.5) * 3.5, 2.2 + Math.random() * 3.2, (Math.random() - 0.5) * 3.5),
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparks = new THREE.Points(
      geo,
      softPointsMaterial({ color: 0xc4a06a, size: 0.07, opacity: 0.75, blending: THREE.AdditiveBlending }),
    );
    sparks.userData.velocities = velocities;
    sparks.userData.sparkBurst = true;
    group.add(sparks);
    group.userData.life = 0.85;
  } else {
    const chunkCount = 12;
    for (let i = 0; i < chunkCount; i += 1) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 + Math.random() * 0.35, 0.12 + Math.random() * 0.2, 0.2 + Math.random() * 0.3),
        new THREE.MeshStandardMaterial({ color: 0x4a4538, roughness: 0.95 }),
      );
      chunk.position.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2);
      chunk.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4);
      chunk.castShadow = false;
      group.add(chunk);
    }
    // Skip destruction PointLights — they spike fill-rate during combat.
    group.userData.life = 2.5;
  }

  group.userData.destruction = true;
  scene.add(group);
  atmo?.destructionGroups.push(group);
  return group;
}

/** Solo compound ambient chaos — distant booms, tracers, flares (respects fxScale / lowPower). */
export type BattlefieldChaosState = {
  active: boolean;
  nextExplosionAt: number;
  nextTracerAt: number;
  nextArtilleryAt: number;
  nextSmokeAt: number;
  nextFlareAt: number;
  nextMuzzleAt: number;
  nextQrfAt: number;
  nextVehicleBoomAt: number;
  transientFx: THREE.Object3D[];
};

const CHAOS_MAX_TRANSIENT = 20;

export function initBattlefieldChaos(): BattlefieldChaosState {
  return {
    active: false,
    nextExplosionAt: 5 + Math.random() * 4,
    nextTracerAt: 1.8 + Math.random() * 1.6,
    nextArtilleryAt: 11 + Math.random() * 7,
    nextSmokeAt: 4 + Math.random() * 3,
    nextFlareAt: 18 + Math.random() * 14,
    nextMuzzleAt: 1.2 + Math.random() * 1.1,
    nextQrfAt: 28 + Math.random() * 18,
    nextVehicleBoomAt: 14 + Math.random() * 10,
    transientFx: [],
  };
}

export type BattlefieldChaosHooks = {
  fxScale: number;
  lowPower: boolean;
  elapsed: number;
  playerX: number;
  playerZ: number;
  inCombat: boolean;
  onDistantExplosion?: (x: number, z: number, distance: number) => void;
  onArtilleryThump?: () => void;
  onDistantGunfire?: () => void;
  onRadioLine?: (line: string) => void;
};

function randomPerimeterPosition(minR = 36, maxR = 56): [number, number] {
  const angle = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * (maxR - minR);
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}

function pushChaosFx(chaos: BattlefieldChaosState, obj: THREE.Object3D | null) {
  if (!obj) return;
  chaos.transientFx.push(obj);
  while (chaos.transientFx.length > CHAOS_MAX_TRANSIENT) {
    const old = chaos.transientFx.shift();
    old?.removeFromParent();
  }
}

function spawnDistantFlash(scene: THREE.Scene, x: number, z: number, atmo: AtmosphereState) {
  const group = new THREE.Group();
  group.position.set(x, 0.4 + Math.random() * 1.8, z);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.7 + Math.random() * 1.4, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(flash);
  if (!atmo.lowPower && Math.random() < 0.35) {
    const light = new THREE.PointLight(0xff8833, 2.2, 26, 2);
    light.position.y = 1.4;
    group.add(light);
  }
  group.userData.life = 0.32 + Math.random() * 0.22;
  group.userData.chaosFx = true;
  scene.add(group);
  return group;
}

function spawnFlarePop(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 7 + Math.random() * 8, z);
  const flare = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(flare);
  const chute = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.32, 0.07, 8),
    new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  chute.position.y = 0.35;
  group.add(chute);
  group.userData.life = 3.5 + Math.random() * 2.5;
  group.userData.chaosFx = true;
  group.userData.flare = true;
  scene.add(group);
  return group;
}

function spawnAmbientTracerLine(scene: THREE.Scene, lowPower: boolean) {
  const [x1, z1] = randomPerimeterPosition(22, 44);
  const x2 = x1 + (Math.random() - 0.5) * 34;
  const z2 = z1 + (Math.random() - 0.5) * 34;
  const y1 = 1.2 + Math.random() * 2.2;
  const y2 = y1 + (Math.random() - 0.5) * 1.4;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x2, y2, z2),
  ]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color: Math.random() < 0.45 ? 0xffcc66 : 0x9ec8ff,
      transparent: true,
      opacity: lowPower ? 0.32 : 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  line.userData.life = 0.1 + Math.random() * 0.07;
  line.userData.chaosFx = true;
  line.userData.tracerLine = true;
  scene.add(line);
  return line;
}

function spawnDistantMuzzleFlash(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 1 + Math.random() * 1.2, z);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.14),
    new THREE.MeshBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  flash.rotation.y = Math.random() * Math.PI * 2;
  group.add(flash);
  group.userData.life = 0.05 + Math.random() * 0.04;
  group.userData.chaosFx = true;
  scene.add(group);
  return group;
}

export function updateBattlefieldChaosTransient(chaos: BattlefieldChaosState, dt: number) {
  for (let i = chaos.transientFx.length - 1; i >= 0; i -= 1) {
    const obj = chaos.transientFx[i];
    obj.userData.life -= dt;
    if (obj.userData.flare) {
      obj.position.y -= dt * 0.4;
      obj.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = Math.max(0, (obj.userData.life as number) / 3.5) * 0.95;
        }
      });
    } else if (obj.userData.tracerLine && obj instanceof THREE.Line) {
      const mat = obj.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, (obj.userData.life as number) / 0.12) * 0.52;
    } else {
      obj.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = Math.max(0, (obj.userData.life as number) / 0.35) * 0.82;
        }
        if (child instanceof THREE.PointLight) {
          child.intensity = Math.max(0, (obj.userData.life as number) * 7);
        }
      });
    }
    if (obj.userData.life <= 0) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry?.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      obj.removeFromParent();
      chaos.transientFx.splice(i, 1);
    }
  }
}

export function updateBattlefieldChaos(
  chaos: BattlefieldChaosState,
  scene: THREE.Scene,
  atmo: AtmosphereState,
  hooks: BattlefieldChaosHooks,
  dt: number,
) {
  if (!chaos.active) return;
  updateBattlefieldChaosTransient(chaos, dt);

  const fx = Math.max(0.2, hooks.fxScale);
  const pace = (hooks.lowPower ? 0.62 : 1) * (hooks.inCombat ? 0.78 : 1);

  if (hooks.elapsed >= chaos.nextExplosionAt && fx >= 0.28) {
    const [x, z] = randomPerimeterPosition();
    const dist = Math.hypot(x - hooks.playerX, z - hooks.playerZ);
    pushChaosFx(chaos, spawnDistantFlash(scene, x, z, atmo));
    pushChaosFx(chaos, spawnDestructionBurst(scene, x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, atmo));
    hooks.onDistantExplosion?.(x, z, dist);
    chaos.nextExplosionAt = hooks.elapsed + ((6.5 + Math.random() * 5.5) * pace) / fx;
  }

  if (hooks.elapsed >= chaos.nextTracerAt && fx >= 0.22) {
    const count = fx >= 0.65 && !hooks.lowPower ? 2 : 1;
    for (let t = 0; t < count; t += 1) {
      pushChaosFx(chaos, spawnAmbientTracerLine(scene, hooks.lowPower));
    }
    chaos.nextTracerAt = hooks.elapsed + ((1.4 + Math.random() * 1.8) * pace) / fx;
  }

  if (hooks.elapsed >= chaos.nextArtilleryAt) {
    hooks.onArtilleryThump?.();
    const [x, z] = randomPerimeterPosition(44, 62);
    if (fx >= 0.3) {
      pushChaosFx(chaos, spawnDistantFlash(scene, x, z, atmo));
      pushChaosFx(chaos, spawnDestructionBurst(scene, x, z, atmo));
    }
    chaos.nextArtilleryAt = hooks.elapsed + ((9 + Math.random() * 7) * pace) / Math.max(0.45, fx);
  }

  if (hooks.elapsed >= chaos.nextSmokeAt && fx >= 0.25) {
    const [x, z] = randomPerimeterPosition(18, 42);
    pushChaosFx(chaos, spawnDestructionBurst(scene, x, z, atmo));
    chaos.nextSmokeAt = hooks.elapsed + ((3.5 + Math.random() * 3.5) * pace) / fx;
  }

  if (hooks.elapsed >= chaos.nextFlareAt && fx >= 0.35) {
    const [x, z] = randomPerimeterPosition(28, 50);
    pushChaosFx(chaos, spawnFlarePop(scene, x, z));
    chaos.nextFlareAt = hooks.elapsed + ((16 + Math.random() * 14) * pace) / fx;
  }

  if (hooks.elapsed >= chaos.nextMuzzleAt && fx >= 0.2) {
    const [x, z] = randomPerimeterPosition(20, 48);
    pushChaosFx(chaos, spawnDistantMuzzleFlash(scene, x, z));
    hooks.onDistantGunfire?.();
    chaos.nextMuzzleAt = hooks.elapsed + ((0.9 + Math.random() * 1.4) * pace) / fx;
  }

  if (hooks.elapsed >= chaos.nextQrfAt) {
    hooks.onRadioLine?.("qrf");
    chaos.nextQrfAt = hooks.elapsed + 32 + Math.random() * 24;
  }

  if (hooks.elapsed >= chaos.nextVehicleBoomAt) {
    hooks.onRadioLine?.("vehicle");
    const [x, z] = randomPerimeterPosition(40, 58);
    if (fx >= 0.28) pushChaosFx(chaos, spawnDistantFlash(scene, x, z, atmo));
    chaos.nextVehicleBoomAt = hooks.elapsed + ((12 + Math.random() * 10) * pace) / Math.max(0.4, fx);
  }
}

export function disposeBattlefieldChaos(chaos: BattlefieldChaosState) {
  for (const obj of chaos.transientFx) obj.removeFromParent();
  chaos.transientFx.length = 0;
  chaos.active = false;
}

export function updateDestruction(atmo: AtmosphereState, dt: number) {
  const groups = atmo.destructionGroups;
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const obj = groups[i];
    obj.userData.life -= dt;
    obj.children.forEach((child) => {
      if (child instanceof THREE.Points && child.userData.sparkBurst) {
        const positions = child.geometry.getAttribute("position") as THREE.BufferAttribute;
        const velocities = child.userData.velocities as THREE.Vector3[];
        const mat = child.material as THREE.PointsMaterial;
        mat.opacity = 0.75 * Math.max(0, obj.userData.life / 0.85);
        for (let p = 0; p < velocities.length; p += 1) {
          velocities[p].y -= 10 * dt;
          positions.setXYZ(
            p,
            positions.getX(p) + velocities[p].x * dt,
            positions.getY(p) + velocities[p].y * dt,
            positions.getZ(p) + velocities[p].z * dt,
          );
        }
        positions.needsUpdate = true;
      } else if (child instanceof THREE.Mesh && child.userData.vel) {
        const vel = child.userData.vel as THREE.Vector3;
        vel.y -= 12 * dt;
        child.position.addScaledVector(vel, dt);
        child.rotation.x += dt * 4;
      }
      if (child instanceof THREE.PointLight) {
        child.intensity = Math.max(0, child.intensity - dt * 6);
      }
    });
    if (obj.userData.life <= 0) {
      obj.traverse((child) => {
        if (child instanceof THREE.Points) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      obj.removeFromParent();
      groups.splice(i, 1);
    }
  }
}
