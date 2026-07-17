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
};

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
  const mat = new THREE.PointsMaterial({
    color: 0xa8c4d8,
    size: 0.05,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const rain = new THREE.Points(geo, mat);
  rain.visible = false;
  rain.userData.rain = true;
  scene.add(rain);
  return rain;
}

export function createDebrisField(scene: THREE.Scene) {
  const count = 280;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 140;
    positions[i * 3 + 1] = 0.2 + Math.random() * 3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x7a6a4e, size: 0.09, transparent: true, opacity: 0.4, depthWrite: false });
  const debris = new THREE.Points(geo, mat);
  debris.userData.debris = true;
  scene.add(debris);
  return debris;
}

export function initAtmosphere(scene: THREE.Scene, enableVolumetric: boolean): AtmosphereState {
  const sky = createSkyDome(scene);
  const volumetricFog = enableVolumetric ? createVolumetricFogLayers(scene) : [];
  const rain = createRain(scene, 1);
  const debris = createDebrisField(scene);
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
  };
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
    setWeather(atmo, scene, modes[Math.floor(Math.random() * modes.length)]);
    atmo.nextWeatherAt = time + 50 + Math.random() * 55;
  }

  for (const layer of atmo.volumetricFog) {
    layer.position.x += layer.userData.drift * atmo.wind * dt;
    layer.rotation.z = Math.sin(time * 0.1 + layer.position.y) * 0.04;
    if (Math.abs(layer.position.x) > 50) layer.userData.drift *= -1;
  }

  if (atmo.rain?.visible) {
    const pos = atmo.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      let y = pos.getY(i) - (14 + atmo.wind * 4) * dt;
      let x = pos.getX(i) + atmo.wind * 2.5 * dt;
      if (y < 0) {
        y = 18 + Math.random() * 10;
        x = (Math.random() - 0.5) * 80;
      }
      pos.setXYZ(i, x, y, pos.getZ(i));
    }
    pos.needsUpdate = true;
  }

  if (atmo.debris) {
    atmo.debris.rotation.y += 0.0004 * atmo.wind;
    const pos = atmo.debris.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      let x = pos.getX(i) + atmo.wind * 0.8 * dt;
      if (x > 50) x = -50;
      if (x < -50) x = 50;
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }

  // Legacy fire / smoke spin handled by caller traverse if present.
  scene.traverse((obj) => {
    if (obj.userData.fire) {
      obj.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
          child.scale.y = 0.8 + Math.sin(time * 8 + child.position.x * 5) * 0.18;
          child.rotation.y += 0.03;
        }
      });
    }
    if (obj.userData.fireLight && obj instanceof THREE.PointLight) {
      obj.intensity = 3.4 + Math.sin(time * 12) * 0.8 + Math.random() * 0.35;
    }
    if (obj.userData.spin) obj.rotation.y += 0.0008;
    if (obj.userData.smoke) {
      obj.children.forEach((child) => {
        child.position.y += Math.sin(time + child.userData.floatOffset) * 0.0015;
        child.rotation.y += 0.001;
      });
    }
  });
}

export function spawnDestructionBurst(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0.2, z);
  for (let i = 0; i < 12; i += 1) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 + Math.random() * 0.35, 0.12 + Math.random() * 0.2, 0.2 + Math.random() * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4a4538, roughness: 0.95 })
    );
    chunk.position.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2);
    chunk.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4);
    chunk.castShadow = true;
    group.add(chunk);
  }
  const light = new THREE.PointLight(0xff6622, 8, 18, 2);
  light.position.y = 1.5;
  group.add(light);
  group.userData.destruction = true;
  group.userData.life = 2.5;
  scene.add(group);
  return group;
}

export function updateDestruction(scene: THREE.Scene, dt: number) {
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (!obj.userData.destruction) return;
    obj.userData.life -= dt;
    obj.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.vel) {
        const vel = child.userData.vel as THREE.Vector3;
        vel.y -= 12 * dt;
        child.position.addScaledVector(vel, dt);
        child.rotation.x += dt * 4;
      }
      if (child instanceof THREE.PointLight) {
        child.intensity = Math.max(0, child.intensity - dt * 6);
      }
    });
    if (obj.userData.life <= 0) toRemove.push(obj);
  });
  toRemove.forEach((o) => scene.remove(o));
}
