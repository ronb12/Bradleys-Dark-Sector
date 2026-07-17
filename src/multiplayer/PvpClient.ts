import {
  DEFAULT_PVP_ROOM,
  DEFAULT_PVP_WS_URL,
  type ClientMessage,
  type NetPlayer,
  type ServerMessage,
  type WeaponId,
} from "./protocol";

export type RemoteSnapshot = {
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
  receivedAt: number;
};

export type PvpClientHandlers = {
  onWelcome?: (payload: Extract<ServerMessage, { type: "welcome" }>) => void;
  onPlayerJoined?: (player: NetPlayer) => void;
  onPlayerLeft?: (id: string) => void;
  onRemoteState?: (snap: RemoteSnapshot) => void;
  onDamage?: (amount: number, fromId: string, health: number) => void;
  onRemoteHealth?: (id: string, health: number, alive: boolean) => void;
  onKill?: (payload: Extract<ServerMessage, { type: "kill" }>) => void;
  onStats?: (kills: number, deaths: number) => void;
  onYouDied?: (respawnInMs: number) => void;
  onRespawn?: (x: number, z: number, health: number) => void;
  onRemoteRespawn?: (id: string, x: number, z: number, health: number) => void;
  onMatchOver?: (payload: Extract<ServerMessage, { type: "match_over" }>) => void;
  onLobbies?: (lobbies: import("./protocol").LobbyInfo[]) => void;
  onStatus?: (status: PvpConnectionStatus, detail?: string) => void;
};

export type PvpConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export class PvpClient {
  private ws: WebSocket | null = null;
  private status: PvpConnectionStatus = "idle";
  private localId: string | null = null;
  private remotes = new Map<string, { prev: RemoteSnapshot; next: RemoteSnapshot }>();
  private handlers: PvpClientHandlers;
  private url: string;
  private room: string;
  private name: string;

  constructor(handlers: PvpClientHandlers, options?: { url?: string; room?: string; name?: string }) {
    this.handlers = handlers;
    this.url = options?.url || import.meta.env.VITE_PVP_WS_URL || DEFAULT_PVP_WS_URL;
    this.room = options?.room || DEFAULT_PVP_ROOM;
    this.name = options?.name || `Operative ${Math.floor(Math.random() * 90 + 10)}`;
  }

  getId() {
    return this.localId;
  }

  getStatus() {
    return this.status;
  }

  getUrl() {
    return this.url;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!this.url) {
      this.setStatus("error", "PVP server is not configured. Set VITE_PVP_WS_URL to a wss:// endpoint.");
      return;
    }
    this.setStatus("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus("connected");
      this.send({ type: "join", room: this.room, name: this.name });
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    ws.onerror = () => {
      this.setStatus("error", `Could not reach ${this.url}. Is the PVP server running?`);
    };

    ws.onclose = () => {
      this.ws = null;
      this.localId = null;
      if (this.status !== "error") this.setStatus("disconnected", "Disconnected from PVP server.");
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.localId = null;
    this.remotes.clear();
    this.setStatus("idle");
  }

  sendState(state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    weapon: WeaponId;
  }) {
    this.send({ type: "state", ...state });
  }

  sendHit(targetId: string, damage: number) {
    this.send({ type: "hit", targetId, damage });
  }

  /** Latency-tolerant pose for a remote player (lerp between last two snapshots). */
  sampleRemote(id: string, now = performance.now()): RemoteSnapshot | null {
    const track = this.remotes.get(id);
    if (!track) return null;
    const span = Math.max(1, track.next.receivedAt - track.prev.receivedAt);
    const t = Math.min(1, Math.max(0, (now - track.prev.receivedAt) / span));
    const a = track.prev;
    const b = track.next;
    return {
      ...b,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw: lerpAngle(a.yaw, b.yaw, t),
      pitch: a.pitch + (b.pitch - a.pitch) * t,
    };
  }

  listRemoteIds() {
    return [...this.remotes.keys()];
  }

  private send(msg: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private setStatus(status: PvpConnectionStatus, detail?: string) {
    this.status = status;
    this.handlers.onStatus?.(status, detail);
  }

  private upsertRemote(snap: RemoteSnapshot) {
    const existing = this.remotes.get(snap.id);
    if (!existing) {
      this.remotes.set(snap.id, { prev: snap, next: snap });
    } else {
      existing.prev = existing.next;
      existing.next = snap;
    }
    this.handlers.onRemoteState?.(snap);
  }

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome": {
        this.localId = msg.id;
        for (const player of msg.players) {
          const snap = toSnapshot(player);
          this.remotes.set(player.id, { prev: snap, next: snap });
        }
        this.handlers.onWelcome?.(msg);
        break;
      }
      case "player_joined": {
        const snap = toSnapshot(msg.player);
        this.remotes.set(msg.player.id, { prev: snap, next: snap });
        this.handlers.onPlayerJoined?.(msg.player);
        break;
      }
      case "player_left": {
        this.remotes.delete(msg.id);
        this.handlers.onPlayerLeft?.(msg.id);
        break;
      }
      case "state": {
        const prior = this.remotes.get(msg.id)?.next;
        this.upsertRemote({
          id: msg.id,
          name: prior?.name || msg.id,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          yaw: msg.yaw,
          pitch: msg.pitch,
          weapon: msg.weapon,
          health: msg.health,
          alive: msg.alive,
          kills: prior?.kills || 0,
          deaths: prior?.deaths || 0,
          receivedAt: performance.now(),
        });
        break;
      }
      case "damage":
        this.handlers.onDamage?.(msg.amount, msg.fromId, msg.health);
        break;
      case "health": {
        const track = this.remotes.get(msg.id);
        if (track) {
          track.next.health = msg.health;
          track.next.alive = msg.alive;
          track.prev.health = msg.health;
          track.prev.alive = msg.alive;
        }
        this.handlers.onRemoteHealth?.(msg.id, msg.health, msg.alive);
        break;
      }
      case "kill":
        this.handlers.onKill?.(msg);
        break;
      case "stats":
        this.handlers.onStats?.(msg.kills, msg.deaths);
        break;
      case "you_died":
        this.handlers.onYouDied?.(msg.respawnInMs);
        break;
      case "respawn":
        this.handlers.onRespawn?.(msg.x, msg.z, msg.health);
        break;
      case "player_respawn": {
        const prior = this.remotes.get(msg.id)?.next;
        const snap: RemoteSnapshot = {
          id: msg.id,
          name: prior?.name || msg.id,
          x: msg.x,
          y: 0,
          z: msg.z,
          yaw: prior?.yaw || 0,
          pitch: 0,
          weapon: prior?.weapon || "m4",
          health: msg.health,
          alive: true,
          kills: prior?.kills || 0,
          deaths: prior?.deaths || 0,
          receivedAt: performance.now(),
        };
        this.remotes.set(msg.id, { prev: snap, next: snap });
        this.handlers.onRemoteRespawn?.(msg.id, msg.x, msg.z, msg.health);
        break;
      }
      case "match_over":
        this.handlers.onMatchOver?.(msg);
        break;
      case "lobbies":
        this.handlers.onLobbies?.(msg.lobbies);
        break;
      default:
        break;
    }
  }
}

function toSnapshot(player: NetPlayer): RemoteSnapshot {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    weapon: player.weapon,
    health: player.health,
    alive: player.alive,
    kills: player.kills,
    deaths: player.deaths,
    receivedAt: performance.now(),
  };
}

function lerpAngle(a: number, b: number, t: number) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}
