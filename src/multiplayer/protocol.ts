import type { WeaponId } from "../game/weapons";
export type { WeaponId } from "../game/weapons";

export type NetPlayer = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  team?: number;
};

export type LobbyInfo = {
  room: string;
  players: number;
  scoreLimit: number;
  teamScores: [number, number];
  matchOver: boolean;
};

export type ClientMessage =
  | { type: "join"; room: string; name?: string; team?: number; scoreLimit?: number }
  | { type: "list_lobbies" }
  | {
      type: "state";
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      weapon: WeaponId;
    }
  | { type: "hit"; targetId: string; damage: number };

export type ServerMessage =
  | {
      type: "welcome";
      id: string;
      room: string;
      spawn: { x: number; z: number };
      players: NetPlayer[];
      team?: number;
      scoreLimit?: number;
      teamScores?: [number, number];
    }
  | { type: "lobbies"; lobbies: LobbyInfo[] }
  | { type: "player_joined"; player: NetPlayer }
  | { type: "player_left"; id: string }
  | {
      type: "state";
      id: string;
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      weapon: WeaponId;
      health: number;
      alive: boolean;
      team?: number;
    }
  | { type: "damage"; amount: number; fromId: string; health: number }
  | { type: "health"; id: string; health: number; alive: boolean }
  | {
      type: "kill";
      killerId: string;
      victimId: string;
      killerKills: number;
      victimDeaths: number;
      teamScores?: [number, number];
    }
  | { type: "stats"; kills: number; deaths: number }
  | { type: "you_died"; respawnInMs: number }
  | { type: "respawn"; x: number; z: number; health: number }
  | { type: "player_respawn"; id: string; x: number; z: number; health: number }
  | { type: "match_over"; winnerTeam: number; teamScores: [number, number]; scoreLimit: number };

// Production builds must point at an explicit wss:// endpoint — except when the
// built page itself is served from this machine (vite preview, local QA), where
// the local dev PVP server is the only sensible target.
const isLocalPage =
  typeof window !== "undefined"
  && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
export const DEFAULT_PVP_WS_URL =
  import.meta.env.VITE_PVP_WS_URL
  || (import.meta.env.PROD && !isLocalPage ? "" : "ws://127.0.0.1:2567");
export const DEFAULT_PVP_ROOM = "dark-sector";
