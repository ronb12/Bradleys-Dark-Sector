# Dark Sector — Original Asset Collection

This project includes an original, in-house 3D asset set, distinct from the legacy licensed models documented in `ASSET_LICENSES.md`.

## Phase 1: FPS weapon set

**Source:** `src/game/darkSectorWeapons.ts`.

- **ASH-4 Atlas:** modular carbine with metal receiver, slotted foregrip, holographic optic, suppressor-style muzzle device, rail details, magazine, stock, and gloves.
- **V9 Warden:** purpose-built compact SMG variant with a distinct handguard and magazine silhouette.
- **Kestrel:** sidearm with custom slide, polymer frame, grip, sights, and glove.
- Procedural muzzle flash, recoil, weapon sway, and ADS are integrated into existing first-person mechanics.
- All weapon meshes and colors were authored for Dark Sector using Three.js, without imported weapon model files.

## Phase 2: Original FOB prop set

**Source:** `src/game/darkSectorEnvironment.ts`.

- Outpost Alpha and Bravo modular field generators.
- Encrypted mission-status displays featuring Dark Sector branding.
- Armored supply caches, ventilation panels, mast antennas, hazard markings, and signal indicators.
- Physical colliders restricted to generator bodies, so antennas do not create invisible walls.

## Design / platform notes

- Source names `m4`, `smg`, and `pistol` remain internally stable for saved progress and multiplayer protocol compatibility.
- Desktop FPS draws the active weapon in front of the camera.
- VR mode attaches the weapon to the tracked controller grip; head-locked meshes are hidden on XR session start.
- Lightweight procedural geometry and shared materials are used to avoid large texture downloads for PWA/mobile.
- Third-party **enemy/character** and **environment** models still ship and are governed by their own listed licenses. They have not all been replaced yet.
- Further armor animations, bespoke cinematic mission levels, and full Quest interaction testing remain separate milestones.

## Verification

Run `npm run build`, then `npm run preview` and `node qa-pwa.mjs`. Test physical input and WebXR in compatible headsets before a full release.
