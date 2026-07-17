/**
 * Lightweight LAN/local PVP relay for Bradley's Dark Sector.
 * Supports named rooms, optional teams, and score-limit matches.
 *
 * Usage: npm run pvp
 * Default: ws://127.0.0.1:2567
 */
import { WebSocketServer } from "ws";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || process.env.PVP_PORT || 2567);
const TICK_MS = 50;
const MAX_HEALTH = 100;
const RESPAWN_MS = 2800;
const DEFAULT_SCORE_LIMIT = Number(process.env.PVP_SCORE_LIMIT || 15);
/** Latency compensation grace: accept slightly stale hit reports within this window (ms). */
const HIT_LATENCY_SLACK_MS = 180;

const SPAWNS = [
  { x: 0, z: 12 },
  { x: 0, z: -12 },
  { x: 14, z: 0 },
  { x: -14, z: 0 },
  { x: 10, z: 10 },
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: -10, z: 10 },
];

/** @typedef {{ id: string, name: string, x: number, y: number, z: number, yaw: number, pitch: number, weapon: string, health: number, alive: boolean, kills: number, deaths: number, team: number, ws: import('ws').WebSocket, spawnIndex: number, respawnAt: number | null, lastStateAt: number }} Player */
/** @typedef {{ name: string, players: Map<string, Player>, scoreLimit: number, teamScores: [number, number], matchOver: boolean }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextId = 1;

function getOrCreateRoom(name) {
  const key = (name || "dark-sector").toLowerCase().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "dark-sector";
  let room = rooms.get(key);
  if (!room) {
    room = {
      name: key,
      players: new Map(),
      scoreLimit: DEFAULT_SCORE_LIMIT,
      teamScores: [0, 0],
      matchOver: false,
    };
    rooms.set(key, room);
  }
  return room;
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    weapon: p.weapon,
    health: p.health,
    alive: p.alive,
    kills: p.kills,
    deaths: p.deaths,
    team: p.team,
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcastRoom(room, msg, exceptId = null) {
  const raw = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (exceptId && p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(raw);
  }
}

function pickSpawn(room, excludeId = null) {
  let best = SPAWNS[0];
  let bestScore = -Infinity;
  for (const spawn of SPAWNS) {
    let minDist = Infinity;
    for (const p of room.players.values()) {
      if (!p.alive || p.id === excludeId) continue;
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      minDist = Math.min(minDist, d);
    }
    if (minDist === Infinity) minDist = 100;
    if (minDist > bestScore) {
      bestScore = minDist;
      best = spawn;
    }
  }
  return best;
}

function assignTeam(room) {
  let t0 = 0;
  let t1 = 0;
  for (const p of room.players.values()) {
    if (p.team === 0) t0 += 1;
    else t1 += 1;
  }
  return t0 <= t1 ? 0 : 1;
}

function removePlayer(room, id) {
  if (!room.players.has(id)) return;
  room.players.delete(id);
  broadcastRoom(room, { type: "player_left", id });
  console.log(`[pvp] left ${id} from ${room.name} (${room.players.size} in room)`);
  if (room.players.size === 0) rooms.delete(room.name);
}

function listLobbies() {
  return [...rooms.values()].map((room) => ({
    room: room.name,
    players: room.players.size,
    scoreLimit: room.scoreLimit,
    teamScores: room.teamScores,
    matchOver: room.matchOver,
  }));
}

const httpServer = createServer((req, res) => {
  if (req.url === "/lobbies") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ lobbies: listLobbies() }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(
    `Bradley's Dark Sector PVP relay\nRooms: ${rooms.size}\nWS: ws://127.0.0.1:${PORT}\nLobbies JSON: /lobbies\nScore limit: ${DEFAULT_SCORE_LIMIT}\n`
  );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  /** @type {string | null} */
  let playerId = null;
  /** @type {Room | null} */
  let room = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (msg.type === "list_lobbies") {
      send(ws, { type: "lobbies", lobbies: listLobbies() });
      return;
    }

    if (msg.type === "join") {
      if (playerId) return;
      room = getOrCreateRoom(typeof msg.room === "string" ? msg.room : "dark-sector");
      if (typeof msg.scoreLimit === "number" && msg.scoreLimit >= 5 && msg.scoreLimit <= 50) {
        room.scoreLimit = Math.round(msg.scoreLimit);
      }
      const id = `p${nextId++}`;
      const spawn = pickSpawn(room);
      const spawnIndex = SPAWNS.indexOf(spawn);
      const name = typeof msg.name === "string" && msg.name.trim() ? msg.name.trim().slice(0, 18) : `Operative ${id}`;
      const team = typeof msg.team === "number" && (msg.team === 0 || msg.team === 1) ? msg.team : assignTeam(room);
      /** @type {Player} */
      const player = {
        id,
        name,
        x: spawn.x,
        y: 0,
        z: spawn.z,
        yaw: 0,
        pitch: 0,
        weapon: "m4",
        health: MAX_HEALTH,
        alive: true,
        kills: 0,
        deaths: 0,
        team,
        ws,
        spawnIndex: spawnIndex < 0 ? 0 : spawnIndex,
        respawnAt: null,
        lastStateAt: Date.now(),
      };
      room.players.set(id, player);
      playerId = id;

      send(ws, {
        type: "welcome",
        id,
        room: room.name,
        spawn: { x: spawn.x, z: spawn.z },
        team,
        scoreLimit: room.scoreLimit,
        teamScores: room.teamScores,
        players: [...room.players.values()].filter((p) => p.id !== id).map(publicPlayer),
      });
      broadcastRoom(room, { type: "player_joined", player: publicPlayer(player) }, id);
      console.log(`[pvp] join ${id} "${name}" team ${team} → ${room.name} (${room.players.size})`);
      return;
    }

    if (!playerId || !room) return;
    const self = room.players.get(playerId);
    if (!self) return;

    if (msg.type === "state" && self.alive) {
      if (typeof msg.x === "number") self.x = msg.x;
      if (typeof msg.y === "number") self.y = msg.y;
      if (typeof msg.z === "number") self.z = msg.z;
      if (typeof msg.yaw === "number") self.yaw = msg.yaw;
      if (typeof msg.pitch === "number") self.pitch = msg.pitch;
      if (msg.weapon === "m4" || msg.weapon === "pistol") self.weapon = msg.weapon;
      self.lastStateAt = Date.now();
      return;
    }

    if (msg.type === "hit") {
      if (!self.alive || room.matchOver) return;
      const target = room.players.get(msg.targetId);
      if (!target || !target.alive || target.id === self.id) return;
      // Friendly fire off between same team
      if (target.team === self.team && room.players.size > 2) return;

      const damage = Math.min(80, Math.max(1, Math.round(Number(msg.damage) || 0)));
      if (damage <= 0) return;

      // Authoritative range check with slight latency slack on positions
      const dist = Math.hypot(self.x - target.x, self.z - target.z);
      const age = Date.now() - Math.min(self.lastStateAt, target.lastStateAt);
      const slack = age < HIT_LATENCY_SLACK_MS ? 8 : 0;
      if (dist > 95 + slack) return;

      target.health = Math.max(0, target.health - damage);
      send(target.ws, {
        type: "damage",
        amount: damage,
        fromId: self.id,
        health: target.health,
      });
      broadcastRoom(room, {
        type: "health",
        id: target.id,
        health: target.health,
        alive: target.health > 0,
      });

      if (target.health <= 0) {
        target.alive = false;
        target.deaths += 1;
        self.kills += 1;
        room.teamScores[self.team] += 1;
        target.respawnAt = Date.now() + RESPAWN_MS;
        broadcastRoom(room, {
          type: "kill",
          killerId: self.id,
          victimId: target.id,
          killerKills: self.kills,
          victimDeaths: target.deaths,
          teamScores: room.teamScores,
        });
        send(self.ws, { type: "stats", kills: self.kills, deaths: self.deaths });
        send(target.ws, { type: "stats", kills: target.kills, deaths: target.deaths });
        send(target.ws, { type: "you_died", respawnInMs: RESPAWN_MS });

        if (room.teamScores[self.team] >= room.scoreLimit) {
          room.matchOver = true;
          broadcastRoom(room, {
            type: "match_over",
            winnerTeam: self.team,
            teamScores: room.teamScores,
            scoreLimit: room.scoreLimit,
          });
        }
      }
      return;
    }
  });

  ws.on("close", () => {
    if (playerId && room) removePlayer(room, playerId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (p.respawnAt && now >= p.respawnAt) {
        if (room.matchOver) {
          p.respawnAt = null;
          continue;
        }
        const spawn = pickSpawn(room, p.id);
        p.x = spawn.x;
        p.z = spawn.z;
        p.y = 0;
        p.health = MAX_HEALTH;
        p.alive = true;
        p.respawnAt = null;
        send(p.ws, { type: "respawn", x: spawn.x, z: spawn.z, health: MAX_HEALTH });
        broadcastRoom(room, { type: "player_respawn", id: p.id, x: spawn.x, z: spawn.z, health: MAX_HEALTH }, p.id);
      }

      if (p.alive) {
        broadcastRoom(
          room,
          {
            type: "state",
            id: p.id,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            pitch: p.pitch,
            weapon: p.weapon,
            health: p.health,
            alive: p.alive,
            team: p.team,
          },
          p.id
        );
      }
    }
  }
}, TICK_MS);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[pvp] listening on ws://0.0.0.0:${PORT} (score limit ${DEFAULT_SCORE_LIMIT})`);
});
