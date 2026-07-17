/** Accessibility & graphics settings — persisted in localStorage. */

export type GraphicsPreset = "low" | "medium" | "high";

export type KeybindAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "sprint"
  | "fire"
  | "reload"
  | "medkit"
  | "weapon1"
  | "weapon2"
  | "swapWeapon"
  | "crouch"
  | "interact";

export type GameSettings = {
  mouseSensitivity: number;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  radioVolume: number;
  musicVolume: number;
  graphics: GraphicsPreset;
  subtitles: boolean;
  reduceMotion: boolean;
  invertY: boolean;
  keybinds: Record<KeybindAction, string>;
  /** Quest / WebXR comfort */
  snapTurnDegrees: 30 | 45 | 90;
  xrMoveSpeed: number;
  comfortVignette: boolean;
};

const STORAGE_KEY = "bds-settings-v1";

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  fov: 72,
  masterVolume: 1,
  sfxVolume: 1,
  radioVolume: 0.85,
  musicVolume: 0.4,
  graphics: "high",
  subtitles: true,
  reduceMotion: false,
  invertY: false,
  snapTurnDegrees: 45,
  xrMoveSpeed: 5,
  comfortVignette: true,
  keybinds: {
    forward: "w",
    back: "s",
    left: "a",
    right: "d",
    sprint: "shift",
    fire: " ",
    reload: "r",
    medkit: "f",
    weapon1: "1",
    weapon2: "2",
    swapWeapon: "q",
    crouch: "c",
    interact: "e",
  },
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keybinds: { ...DEFAULT_SETTINGS.keybinds, ...(parsed.keybinds || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function graphicsConfig(preset: GraphicsPreset) {
  switch (preset) {
    case "low":
      return { shadowMapSize: 512, pixelRatioCap: 1, fogDensity: 0.012, particles: 0.35, volumetricFog: false };
    case "medium":
      return { shadowMapSize: 1024, pixelRatioCap: 1.5, fogDensity: 0.0095, particles: 0.7, volumetricFog: true };
    default:
      return { shadowMapSize: 2048, pixelRatioCap: 2, fogDensity: 0.0085, particles: 1, volumetricFog: true };
  }
}

/** Quest-friendly preset while an immersive-vr session is presenting. */
export function xrGraphicsConfig() {
  return { shadowMapSize: 512, pixelRatioCap: 1.25, fogDensity: 0.012, particles: 0.3, volumetricFog: false };
}
