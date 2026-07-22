/** Deeper spatial audio: footsteps by surface, distant fire, ricochets, explosions, callouts. */

import { EXTRACT_LZ } from "./helicopter";
import { ENEMY_CALLOUT_LINES, enemyCalloutLine } from "./radioLines";
import type { WeaponId } from "./weapons";

export type { WeaponId } from "./weapons";
export type SurfaceType = "concrete" | "dirt" | "metal" | "asphalt";
export type AudioGameMode = "solo" | "pvp" | "range";
export type RadioChannel = "mission" | "range" | "pvp";

export type ImmersiveAudio = {
  muted: boolean;
  /** True while range bay ambience or range-channel radio (pending/speaking) is active. */
  readonly rangeAudioActive: boolean;
  readonly rangeAmbiencePlaying: boolean;
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  setVolumes: (vols: { master: number; sfx: number; radio: number }) => void;
  /** Keep delayed radio / ambience gated to the live game mode. */
  setGameMode: (mode: AudioGameMode) => void;
  playWeaponFire: (weapon: WeaponId, opts?: { distant?: boolean }) => void;
  playReload: (weapon: WeaponId) => void;
  playReloadComplete: () => void;
  playEmpty: () => void;
  playHitConfirm: () => void;
  playArmorHit: () => void;
  playKillConfirm: () => void;
  playNearMiss: () => void;
  playSwitch: () => void;
  playRadio: (line: string, opts?: { channel?: RadioChannel }) => void;
  /** Cancel pending TTS, radio sting, and speech synthesis. */
  stopRadio: () => void;
  /** Start soft range-bay ambience (no-op unless mode is range). */
  startRangeAmbience: () => void;
  /** Stop range ambience + any range-channel radio. */
  stopRangeAudio: () => void;
  /** Short challenge cue — only plays in range mode. */
  playRangeChallengeBeep: (kind?: "start" | "end") => void;
  playFootstep: (surface: SurfaceType) => void;
  playImpact: (kind: "dirt" | "metal" | "flesh") => void;
  /** Wet synth layer on top of flesh impact — hit vs kill intensity. */
  playGoreImpact: (severity?: "hit" | "kill") => void;
  playRicochet: () => void;
  playShellCasing: () => void;
  playExplosion: (distance?: number) => void;
  playDistantGunfire: () => void;
  playArtilleryThump: () => void;
  playVehicleBoom: () => void;
  playSuppression: () => void;
  playEnemyCallout: (line: string) => void;
  /** Looping synthesized rotor wash; proximity 0–1 scales volume. */
  setRotorAudio: (proximity: number) => void;
  stopRotorAudio: () => void;
  dispose: () => void;
};

const URLS = {
  m4Fire: "/audio/m4-fire.wav",
  pistolFire: "/audio/pistol-fire.wav",
  m4Reload: "/audio/m4-reload.wav",
  pistolReload: "/audio/reload.wav",
  radioCall: "/audio/radio-call.wav",
  footConcrete: "/audio/fx/footstep-concrete.wav",
  footDirt: "/audio/fx/footstep-dirt.wav",
  footMetal: "/audio/fx/footstep-metal.wav",
  ricochet: "/audio/fx/ricochet.mp3",
  shell: "/audio/fx/shell-casing.mp3",
  impact: "/audio/fx/impact-dirt.mp3",
  flesh: "/audio/fx/hit-flesh.mp3",
  explosion: "/audio/fx/explosion.mp3",
  distant: "/audio/fx/distant-gun.wav",
  suppression: "/audio/fx/suppression.wav",
  footstepsFallback: "/audio/fx/footsteps.mp3",
} as const;

/** @deprecated Prefer enemyCalloutLine() — kept for callers that still index the pool. */
const ENEMY_CALLOUTS = ENEMY_CALLOUT_LINES;

export { ENEMY_CALLOUTS, enemyCalloutLine };

function channelAllowed(channel: RadioChannel, mode: AudioGameMode): boolean {
  if (channel === "range") return mode === "range";
  if (channel === "pvp") return mode === "pvp";
  return mode === "solo";
}

export function createImmersiveAudio(): ImmersiveAudio {
  const make = (url: string, volume: number) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = volume;
    return audio;
  };

  const firePools: Record<WeaponId, HTMLAudioElement[]> = {
    m4: Array.from({ length: 5 }, () => make(URLS.m4Fire, 0.24)),
    smg: Array.from({ length: 5 }, () => make(URLS.m4Fire, 0.19)),
    pistol: Array.from({ length: 3 }, () => make(URLS.pistolFire, 0.38)),
  };
  const poolIndex: Record<WeaponId, number> = { m4: 0, smg: 0, pistol: 0 };
  const reloads: Record<WeaponId, HTMLAudioElement> = {
    m4: make(URLS.m4Reload, 0.34),
    smg: make(URLS.m4Reload, 0.3),
    pistol: make(URLS.pistolReload, 0.34),
  };
  const radioCall = make(URLS.radioCall, 0.2);
  const footPools: Record<SurfaceType, HTMLAudioElement[]> = {
    concrete: Array.from({ length: 3 }, () => make(URLS.footConcrete, 0.22)),
    dirt: Array.from({ length: 3 }, () => make(URLS.footDirt, 0.2)),
    metal: Array.from({ length: 3 }, () => make(URLS.footMetal, 0.2)),
    asphalt: Array.from({ length: 3 }, () => make(URLS.footConcrete, 0.18)),
  };
  const footIndex: Record<SurfaceType, number> = { concrete: 0, dirt: 0, metal: 0, asphalt: 0 };
  const ricochetPool = Array.from({ length: 3 }, () => make(URLS.ricochet, 0.28));
  const shellPool = Array.from({ length: 4 }, () => make(URLS.shell, 0.18));
  const impactDirt = Array.from({ length: 3 }, () => make(URLS.impact, 0.3));
  const impactFlesh = Array.from({ length: 3 }, () => make(URLS.flesh, 0.32));
  const explosion = make(URLS.explosion, 0.45);
  const distant = Array.from({ length: 2 }, () => make(URLS.distant, 0.22));
  const suppression = make(URLS.suppression, 0.14);

  let context: AudioContext | null = null;
  let muted = false;
  let master = 1;
  let sfx = 1;
  let radio = 0.85;
  let gameMode: AudioGameMode = "solo";
  let ricochetIdx = 0;
  let shellIdx = 0;
  let impactIdx = 0;
  let fleshIdx = 0;
  let distantIdx = 0;
  let lastFootAt = 0;
  let lastCalloutAt = 0;
  let radioGeneration = 0;
  let radioTimer: number | null = null;
  let rangeRadioPending = false;
  let rangeRadioSpeaking = false;
  let rangeAmbiencePlaying = false;
  let rangeAmbOsc: OscillatorNode | null = null;
  let rangeAmbGain: GainNode | null = null;
  let rangeAmbLfo: OscillatorNode | null = null;
  let rotorGain: GainNode | null = null;
  let rotorNoise: AudioBufferSourceNode | null = null;
  let rotorThrob: OscillatorNode | null = null;
  let rotorFilter: BiquadFilterNode | null = null;
  let rotorActive = false;

  const allSamples = () => [
    ...firePools.m4,
    ...firePools.smg,
    ...firePools.pistol,
    ...Object.values(reloads),
    radioCall,
    ...Object.values(footPools).flat(),
    ...ricochetPool,
    ...shellPool,
    ...impactDirt,
    ...impactFlesh,
    explosion,
    ...distant,
    suppression,
  ];

  const tone = (frequency: number, duration: number, volume: number) => {
    if (muted || !context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(volume * master * sfx, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  };

  const playOne = (audio: HTMLAudioElement, volumeScale = 1, playbackRate = 1) => {
    if (muted) return;
    audio.volume = Math.min(1, Math.max(0, volumeScale * master * sfx));
    audio.playbackRate = playbackRate;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };

  const ensureContext = () => {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  };

  const tonePair = (f1: number, f2: number, dur: number, vol: number, gapMs = 55) => {
    tone(f1, dur, vol);
    window.setTimeout(() => {
      if (!muted) tone(f2, dur * 0.85, vol * 0.82);
    }, gapMs);
  };

  const playWetSquelch = (severity: "hit" | "kill") => {
    const ctx = ensureContext();
    if (muted) return;
    const dur = severity === "kill" ? 0.15 : 0.095;
    const vol = (severity === "kill" ? 0.085 : 0.058) * master * sfx;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      const fade = 1 - i / sampleCount;
      data[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = severity === "kill" ? 380 : 520;
    filter.Q.value = 0.85;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    tone(severity === "kill" ? 68 : 92, dur * 0.72, vol * 0.48);
  };

  const clearRadioTimer = () => {
    if (radioTimer != null) {
      window.clearTimeout(radioTimer);
      radioTimer = null;
    }
    rangeRadioPending = false;
  };

  const stopRadioInternal = () => {
    radioGeneration += 1;
    clearRadioTimer();
    rangeRadioSpeaking = false;
    radioCall.pause();
    radioCall.currentTime = 0;
    window.speechSynthesis?.cancel();
  };

  const stopRangeAmbienceInternal = () => {
    if (rangeAmbLfo) {
      try {
        rangeAmbLfo.stop();
      } catch {
        /* already stopped */
      }
      rangeAmbLfo.disconnect();
      rangeAmbLfo = null;
    }
    if (rangeAmbOsc) {
      try {
        rangeAmbOsc.stop();
      } catch {
        /* already stopped */
      }
      rangeAmbOsc.disconnect();
      rangeAmbOsc = null;
    }
    if (rangeAmbGain) {
      rangeAmbGain.disconnect();
      rangeAmbGain = null;
    }
    rangeAmbiencePlaying = false;
  };

  const stopRangeAudioInternal = () => {
    stopRadioInternal();
    stopRangeAmbienceInternal();
  };

  const stopRotorInternal = () => {
    if (rotorThrob) {
      try {
        rotorThrob.stop();
      } catch {
        /* already stopped */
      }
      rotorThrob.disconnect();
      rotorThrob = null;
    }
    if (rotorNoise) {
      try {
        rotorNoise.stop();
      } catch {
        /* already stopped */
      }
      rotorNoise.disconnect();
      rotorNoise = null;
    }
    if (rotorFilter) {
      rotorFilter.disconnect();
      rotorFilter = null;
    }
    if (rotorGain) {
      rotorGain.disconnect();
      rotorGain = null;
    }
    rotorActive = false;
  };

  const ensureRotorGraph = () => {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    if (rotorActive && rotorGain) return;

    stopRotorInternal();

    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.55;
    }

    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 280;
    filter.Q.value = 0.7;

    const throb = context.createOscillator();
    throb.type = "sine";
    throb.frequency.value = 22;
    const throbGain = context.createGain();
    throbGain.gain.value = 0.012;

    const gain = context.createGain();
    gain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(gain);
    throb.connect(throbGain);
    throbGain.connect(gain);
    gain.connect(context.destination);

    noise.start();
    throb.start();

    rotorNoise = noise;
    rotorFilter = filter;
    rotorThrob = throb;
    rotorGain = gain;
    rotorActive = true;
  };

  return {
    get muted() {
      return muted;
    },
    get rangeAmbiencePlaying() {
      return rangeAmbiencePlaying;
    },
    get rangeAudioActive() {
      return rangeAmbiencePlaying || rangeRadioPending || rangeRadioSpeaking;
    },
    unlock() {
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume();
      allSamples().forEach((a) => a.load());
    },
    setMuted(next) {
      muted = next;
      if (muted) {
        stopRangeAudioInternal();
        stopRotorInternal();
        allSamples().forEach((a) => {
          a.pause();
          a.currentTime = 0;
        });
        window.speechSynthesis?.cancel();
      }
    },
    setVolumes(vols) {
      master = vols.master;
      sfx = vols.sfx;
      radio = vols.radio;
      if (rangeAmbGain && context) {
        rangeAmbGain.gain.setValueAtTime(0.028 * master * radio, context.currentTime);
      }
    },
    setGameMode(mode) {
      const prev = gameMode;
      gameMode = mode;
      if (prev === "range" && mode !== "range") {
        stopRangeAudioInternal();
      }
    },
    playWeaponFire(weapon, opts) {
      if (opts?.distant) {
        const a = distant[distantIdx % distant.length];
        distantIdx += 1;
        playOne(a, 0.35, 0.92 + Math.random() * 0.08);
        return;
      }
      const pool = firePools[weapon];
      const audio = pool[poolIndex[weapon] % pool.length];
      poolIndex[weapon] += 1;
      const baseVol = weapon === "m4" ? 0.26 : weapon === "smg" ? 0.21 : 0.38;
      playOne(audio, baseVol, 0.94 + Math.random() * 0.12);
    },
    playReload(weapon) {
      playOne(reloads[weapon], 0.34);
    },
    playReloadComplete() {
      ensureContext();
      tonePair(620, 880, 0.045, 0.055, 48);
    },
    playEmpty() {
      ensureContext();
      tone(118, 0.04, 0.07);
      window.setTimeout(() => {
        if (!muted) tone(92, 0.035, 0.06);
      }, 42);
    },
    playHitConfirm() {
      ensureContext();
      tone(920, 0.028, 0.045);
    },
    playArmorHit() {
      ensureContext();
      tone(280, 0.04, 0.05);
      window.setTimeout(() => {
        if (!muted) tone(420, 0.025, 0.035);
      }, 30);
    },
    playKillConfirm() {
      ensureContext();
      tonePair(740, 1180, 0.055, 0.07, 62);
    },
    playNearMiss() {
      playOne(suppression, 0.22, 1.15 + Math.random() * 0.2);
    },
    playSwitch() {
      tone(420, 0.045, 0.035);
      window.setTimeout(() => tone(260, 0.055, 0.025), 35);
    },
    playRadio(line, opts) {
      const channel: RadioChannel = opts?.channel ?? "mission";
      if (muted || !channelAllowed(channel, gameMode)) return;
      if (window.speechSynthesis?.speaking) {
        // Replace stale speech so mode transitions always get their cue.
        window.speechSynthesis.cancel();
      }
      stopRadioInternal();
      const token = radioGeneration;
      if (channel === "range") rangeRadioPending = true;

      radioCall.volume = 0.2 * master * radio;
      radioCall.currentTime = 0;
      void radioCall.play().catch(() => undefined);

      radioTimer = window.setTimeout(() => {
        radioTimer = null;
        if (token !== radioGeneration) return;
        if (channel === "range") rangeRadioPending = false;
        if (muted || !window.speechSynthesis) return;
        if (!channelAllowed(channel, gameMode)) return;
        const message = new SpeechSynthesisUtterance(line);
        message.rate = 1.08;
        message.pitch = 0.72;
        message.volume = 0.72 * master * radio;
        const voices = window.speechSynthesis.getVoices();
        message.voice =
          voices.find((voice) => voice.lang.startsWith("en") && /male|daniel|fred/i.test(voice.name)) ??
          voices.find((voice) => voice.lang.startsWith("en")) ??
          null;
        if (channel === "range") {
          rangeRadioSpeaking = true;
          message.onend = () => {
            rangeRadioSpeaking = false;
          };
          message.onerror = () => {
            rangeRadioSpeaking = false;
          };
        }
        window.speechSynthesis.speak(message);
      }, 420);
    },
    stopRadio() {
      stopRadioInternal();
    },
    startRangeAmbience() {
      if (muted || gameMode !== "range" || rangeAmbiencePlaying) return;
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume();

      const osc = context.createOscillator();
      const lfo = context.createOscillator();
      const gain = context.createGain();
      const lfoGain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(78, context.currentTime);
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.11, context.currentTime);
      lfoGain.gain.setValueAtTime(6, context.currentTime);
      gain.gain.setValueAtTime(0.028 * master * radio, context.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain).connect(context.destination);
      osc.start();
      lfo.start();
      rangeAmbOsc = osc;
      rangeAmbLfo = lfo;
      rangeAmbGain = gain;
      rangeAmbiencePlaying = true;
    },
    stopRangeAudio() {
      stopRangeAudioInternal();
    },
    playRangeChallengeBeep(kind = "start") {
      if (muted || gameMode !== "range") return;
      context ??= new AudioContext();
      if (kind === "start") {
        tone(880, 0.07, 0.06);
        window.setTimeout(() => {
          if (gameMode === "range" && !muted) tone(1175, 0.09, 0.05);
        }, 90);
      } else {
        tone(520, 0.12, 0.055);
      }
    },
    playFootstep(surface) {
      const now = performance.now();
      if (now - lastFootAt < 220) return;
      lastFootAt = now;
      const pool = footPools[surface];
      const audio = pool[footIndex[surface] % pool.length];
      footIndex[surface] += 1;
      playOne(audio, 0.2 + Math.random() * 0.08);
    },
    playImpact(kind) {
      if (kind === "flesh") {
        const a = impactFlesh[fleshIdx % impactFlesh.length];
        fleshIdx += 1;
        playOne(a, 0.32);
      } else {
        const a = impactDirt[impactIdx % impactDirt.length];
        impactIdx += 1;
        playOne(a, kind === "metal" ? 0.36 : 0.28);
        if (kind === "metal" && Math.random() < 0.55) {
          const r = ricochetPool[ricochetIdx % ricochetPool.length];
          ricochetIdx += 1;
          playOne(r, 0.22);
        }
      }
    },
    playGoreImpact(severity = "hit") {
      if (muted) return;
      const a = impactFlesh[fleshIdx % impactFlesh.length];
      fleshIdx += 1;
      playOne(a, severity === "kill" ? 0.38 : 0.3, 0.94 + Math.random() * 0.08);
      playWetSquelch(severity);
    },
    playRicochet() {
      const a = ricochetPool[ricochetIdx % ricochetPool.length];
      ricochetIdx += 1;
      playOne(a, 0.28);
    },
    playShellCasing() {
      const a = shellPool[shellIdx % shellPool.length];
      shellIdx += 1;
      playOne(a, 0.14 + Math.random() * 0.08);
    },
    playExplosion(distance = 10) {
      const vol = Math.max(0.08, 0.55 * (1 - Math.min(1, distance / 60)));
      playOne(explosion, vol);
    },
    playDistantGunfire() {
      const a = distant[distantIdx % distant.length];
      distantIdx += 1;
      playOne(a, 0.2 + Math.random() * 0.1);
    },
    playArtilleryThump() {
      playOne(explosion, 0.1 + Math.random() * 0.08);
    },
    playVehicleBoom() {
      playOne(explosion, 0.16 + Math.random() * 0.12);
    },
    playSuppression() {
      playOne(suppression, 0.14);
    },
    playEnemyCallout(line) {
      if (muted || window.speechSynthesis?.speaking) return;
      if (gameMode !== "solo") return;
      const now = performance.now();
      if (now - lastCalloutAt < 3500) return;
      lastCalloutAt = now;
      const message = new SpeechSynthesisUtterance(line);
      message.rate = 1.15;
      message.pitch = 0.55;
      message.volume = 0.45 * master * radio;
      window.speechSynthesis?.speak(message);
    },
    setRotorAudio(proximity) {
      if (muted || proximity <= 0.02) {
        if (rotorGain && context) {
          rotorGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.12);
        }
        if (proximity <= 0.001) stopRotorInternal();
        return;
      }
      ensureRotorGraph();
      if (!rotorGain || !context || !rotorFilter || !rotorThrob) return;
      const vol = Math.min(0.22, 0.04 + proximity * 0.2) * master * sfx;
      rotorGain.gain.setTargetAtTime(vol, context.currentTime, 0.08);
      rotorFilter.frequency.setTargetAtTime(180 + proximity * 220, context.currentTime, 0.1);
      rotorThrob.frequency.setTargetAtTime(18 + proximity * 10, context.currentTime, 0.1);
    },
    stopRotorAudio() {
      stopRotorInternal();
    },
    dispose() {
      stopRangeAudioInternal();
      stopRotorInternal();
      allSamples().forEach((a) => {
        a.pause();
        a.src = "";
      });
      window.speechSynthesis?.cancel();
      if (context) void context.close();
      context = null;
    },
  };
}

export function surfaceAtPosition(x: number, z: number): SurfaceType {
  // Compound layout heuristics matching expanded roads / helipad / buildings.
  if (Math.abs(x) < 7 && Math.abs(z) < 56) return "asphalt";
  if (Math.abs(z + 12) < 5 && Math.abs(x) < 52) return "asphalt";
  if (Math.abs(z - 22) < 4 && Math.abs(x) < 50) return "asphalt";
  if (Math.abs(Math.abs(x) - 22) < 4 && Math.abs(z) < 48) return "asphalt";
  if (Math.hypot(x - EXTRACT_LZ.x, z - EXTRACT_LZ.z) < EXTRACT_LZ.radius + 1.2) return "concrete";
  if (Math.abs(x) > 40 || Math.abs(z) > 40) return "concrete";
  if (Math.abs(x) > 14 && Math.abs(z) > 14) return "dirt";
  return "dirt";
}
