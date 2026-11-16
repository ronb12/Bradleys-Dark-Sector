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

## Phase 3: Original enemy combat squad

**Sources:** `src/game/darkSectorSoldiers.ts` and `src/game/darkSectorEnemyWeapons.ts`.

- Five original procedural combat silhouettes: Rifleman, Scout, Heavy, Sniper and Commander.
- Individual chest carriers, tactical equipment, head protection, boots, gloves, and distinct class gear.
- NPC rifle and sidearm designs authored for Dark Sector, no third-party weapon GLBs required for hostile enemies.
- Original enemies preserve procedural gait, stance, knee-fire, hit recoil, enemy weapon muzzle position, line-of-sight, and flanking/cover AI interfaces.
- Geometry is cached across spawns to reduce GPU allocation; mobile lowers decorative lens detail.
- The original designs are **procedural game geometry**, not photographic scans or high-end character sculpts. More facial detail, smooth deformation, and physical Quest testing are future milestones.

## Phase 4: Original battlefield detail

- Two new checkpoint-style tactical floodlight locations for mobile and four for desktop, using emissive meshes rather than costly new point lights.
- Branded Dark Sector security checkpoint signage near the far perimeter.
- Scenic fixtures are visual-only and do not create invisible pathfinding barriers.

## Design / platform notes

- Source names `m4`, `smg`, and `pistol` remain internally stable for saved progress and multiplayer protocol compatibility.
- Desktop FPS draws the active weapon in front of the camera.
- VR mode attaches the weapon to the tracked controller grip; head-locked meshes are hidden on XR session start.
- Lightweight procedural geometry and shared materials are used to avoid large texture downloads for PWA/mobile.
- The *hostile PvE soldiers* now use original Dark Sector character and weapon meshes. Imported **friendly/PVP characters** and some third-party **environment** models still ship and remain governed by their own licenses.
- Better deforming character animations, hand-held pose refinement, bespoke cinematic mission levels, and physical Quest 3 interaction testing remain separate milestones.

## Verification

Run `npm run build`, then `npm run preview` and `node qa-pwa.mjs`. Test physical input and WebXR in compatible headsets before a full release.

## Phase 5: Animated weapon contact and firing feedback (November 16, 2026)

- Original hostile rifles now mount directly on the animated `WeaponPoseAnchor`, ensuring the muzzle and projectile origin follow the soldier's walking, kneeling, and firing recoil.
- Original combat characters pose both arms forward and inward to support their first-person-visible weapon silhouettes; legacy rigged avatars retain their existing animations.
- Enemy muzzle flashes now attach to their weapon muzzle for an 80 ms burst. Emissive-looking mesh/sprite-style FX avoids spawning one light source per enemy.
- Holstered pistols on original hostile soldiers use the original Kestrel-style sidearm geometry rather than the imported model.
- Automated regression checks cover 13 combat and 15 PWA scenarios, including original weapon parenting, joint visibility, mobile controls and offline solo play.
- Physical Quest 3 controller interaction and full multiplayer load testing remain unverified; the added effects are lightweight but their device-specific frame rates still require measurement.

## Phase 6: Soldier rig and visual refinement (November 16, 2026)

- Rebuilt the original hostiles' rigid arms and legs as articulated shoulder/elbow and hip/knee chains, with tapered upper-arm, forearm, thigh and calf geometry, knee and elbow pads, gloves, laces and armored boot soles.
- Moved leg pivots to the hip line so the walking swing no longer rotates around the middle of each leg; added lower-leg follow-through and asymmetric kneeling articulation.
- Adjusted rifle-support poses during running and kneeling and added small class-varied head scanning movements while preserving the existing AI shooting direction.
- Added a deterministic, reusable camouflage-pattern material for all five classes, cached by class and power profile; mobile uses lower-resolution cloth maps.
- Added neck gaiters, body patches, plate-carrier handles, and optional headset ear protection / microphone geometry for desktop quality.
- Secondary joints remain accessible as `limbs.lElbow`, `rElbow`, `lKnee`, `rKnee`; `soldierRigVersion` is 2. All original enemy behavior, PvP rig logic and multiplayer protocols retain their previous interfaces.
- These are lightweight original procedural soldiers, not photorealistic scanned or skinned characters. Physically realistic deformation and Quest headset performance still need separate device-level testing.
