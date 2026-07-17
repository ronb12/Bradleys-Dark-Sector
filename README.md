# Bradley's Dark Sector

Vite + React + TypeScript + Three.js FPS. Solo missions/waves and local/LAN PVP multiplayer.

## Quick start

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/

## Modes

### Solo (missions + waves)

From the menu, choose difficulty, then **Solo · Missions / Waves / Enter compound**.

- Odd waves: classic clear-hostiles
- Even waves: structured objectives, including Warehouse Alpha breach/recovery operations
- Enemies use visible **AK-47** (Scouts often **pistol**) with squad AI (cover peeks, suppression, reloads, grenades, wounded retreat)
- Enemy rounds travel through the world and are stopped by cover; lights, windows, and crates in Warehouse Alpha can be destroyed

### PVP Multiplayer (local / LAN)

1. `npm run pvp` — WebSocket relay on `ws://0.0.0.0:2567`
2. `npm run dev`
3. Open two tabs → set the same **PVP room** name → join
4. Teams auto-balance; score limit defaults to 15 (`PVP_SCORE_LIMIT`). Lobby list: `http://127.0.0.1:2567/lobbies`

For production, host `server/pvp-server.mjs` on a long-running WebSocket host and set the public `VITE_PVP_WS_URL` to its `wss://` URL. Vercel serves the Solo/Range client and does not host this relay.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| C | Crouch |
| Mouse | Aim (click canvas for pointer lock) |
| Click / Space | Fire |
| 1 / 2 / 3 / Q / Wheel | Select/swap M4, VX-9 SMG, pistol |
| G | Throw frag grenade |
| R | Reload |
| E | Interact / plant (mission objectives) |
| F | Medkit |

## Quest 3 / WebXR

Meta Quest 3 can play Solo and Range in the browser. Use the on-screen **ENTER VR** button.

- Smooth move (left stick) + snap turn (right stick)
- Right-hand weapon / trigger fire; world-space VR menu + wrist HUD
- Full checklist and HTTPS notes: [docs/QUEST_VR.md](./docs/QUEST_VR.md)

## Settings

Use **Settings** (top-right): sensitivity, FOV, volumes, graphics preset, subtitles, reduce motion, invert Y. Progression (rank, XP, unlocks) persists in `localStorage`.

## Immersion modules

| Module | Path |
| --- | --- |
| Animations / viewmodel | `src/game/animations.ts` |
| Combat FX | `src/game/combatFx.ts` |
| AI | `src/game/ai.ts` |
| Audio | `src/game/audio.ts` |
| Environment | `src/game/environment.ts` |
| Missions | `src/game/missions.ts` |
| Atmosphere | `src/game/atmosphere.ts` |
| Progression | `src/game/progression.ts` |
| Settings | `src/game/settings.ts` |
| Enemy weapons | `src/game/enemyWeapons.ts` |
| Collision / projectiles | `src/game/collisionWorld.ts`, `src/game/projectiles.ts` |
| Warehouse / destruction | `src/game/warehouse.ts`, `src/game/destruction.ts` |
| Weapon registry | `src/game/weapons.ts` |

Asset licenses: see [ASSET_LICENSES.md](./ASSET_LICENSES.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite game client |
| `npm run pvp` | WebSocket PVP relay |
| `npm run build` | Typecheck + production build |
| `npm run lint` | Oxlint |
| `node qa-immersion-smoke.mjs` | Playwright smoke (dev server required) |
| `node qa-projectile-cover.mjs` | In-flight enemy projectile cover regression |
| `node qa-indoor-combat.mjs` | Indoor mission/destruction regression |

## Known limits

- Mixamo soldier only ships idle/walk/run clips; aim/fire/hit/death/reload fall back to procedural poses when clips are missing
- Environment upgrade uses Poly Haven textures + procedural military props (not a full scanned compound)
- PVP hits remain client-reported with server range checks + light latency slack (not full rewind lag comp)
- Mixkit FX clips are preview-quality; replace with final licensed packs for shipping
