# Third-party 3D assets

## Animated SWAT soldier (enemy and PVP avatar)

- File: `public/models/quaternius-swat.glb`
- Source: [SWAT by Quaternius](https://poly.pizza/m/Btfn3G5Xv4), from the
  [Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularcharacters.html)
- Direct source file: `https://static.poly.pizza/713f6535-f4f3-4367-a4c6-ced126ae0936.glb`
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Author: Quaternius
- SHA-256: `a835107bac833eb916c494e10997ae1709e85957ea6f6c59ace3c9a66f6d1fec`
- Embedded clips: 24, including Idle_Gun_Pointing, Gun_Shoot, HitRecieve,
  Death, Walk, Run, and Run_Shoot
- Use: Primary rigged soldier. The source faces +Z and is wrapped 180 degrees
  at load so gameplay consistently uses local -Z as character/weapon forward.

## Worker and Punk (enemy visual variants, same rig as SWAT)

- Files: `public/models/quaternius-worker.glb`, `public/models/quaternius-punk.glb`
- Source: [Worker](https://poly.pizza/m/Yg2bQZO6Hj) and [Punk](https://poly.pizza/m/BTALZymknF)
  by Quaternius, from the same
  [Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularcharacters.html)
  as the SWAT model above
- Direct source files:
  - `https://static.poly.pizza/3a5f3056-ffe6-42eb-bd52-122afcbd22b2.glb` (Worker)
  - `https://static.poly.pizza/e56f23b5-3270-406f-8924-f77cad980c43.glb` (Punk)
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Author: Quaternius
- SHA-256:
  - Worker: `9c28614f465b7dc105f908c20c22fc045f4b07caf8c5ef0e9f8049eceb6dd38d`
  - Punk: `94afa8718093cc7f9e51cdc0b35f4432c1c2f1901177f98fbbbcb4c6fd79b163`
- Verified identical skeleton (85 nodes) and all 24 animation clip names as
  `quaternius-swat.glb` — confirmed byte-identical clip names before wiring in,
  since the pack's characters share one rig by design (4 swappable body parts
  per character). No animation or weapon-bone remapping was needed.
- Use: Worker gives the Scout enemy type a distinct fast/lightly-equipped
  silhouette; Punk is mixed in as a random reskin of some Rifleman spawns for
  squad variety. Both go through the same matte combat-readability tint as
  every other enemy.

## Watch Tower (decorative compound dressing)

- File: `public/models/env/quaternius-watchtower.glb`
- Source: [Watch Tower by Quaternius](https://poly.pizza/m/VJZZW37Vsk)
- Direct source file: `https://static.poly.pizza/af9ebe34-f519-48eb-9185-3e2c76405697.glb`
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Author: Quaternius
- SHA-256: `b43938378b0b38940fbf529ee78c3ae1ecae52486c06d9de1101bbb220ff71fc`
- Use: Additional background/skyline watchtower silhouettes placed away from
  the four corner watchtowers. The corner towers are load-bearing gameplay
  structures (tuned collision volumes, mounted floodlights) built procedurally
  in `environment.ts`/`BradleysDarkSectorThreeJS.tsx` and were deliberately
  left alone — this model only adds new decorative structures, it does not
  replace them.

## Tactical glove (VR controller hands)

- File: `public/models/quaternius-glove.glb`
- Source: [Glove by Quaternius](https://poly.pizza/m/l1zv4LaA4I)
- Direct source file: `https://static.poly.pizza/5bcc01d6-1f10-4e50-837f-1b53ba398c60.glb`
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Author: Quaternius
- SHA-256: `e4cfc171bab24a5b2df400f142b06b43a25a67c828870ffceadebc5a917280a6`
- Use: Static (non-rigged) glove mesh attached to each XR controller grip,
  mirrored for left/right, replacing the bare default
  `XRControllerModelFactory` controller-ring visual so VR hands read as gloved
  hands instead of floating plastic controllers.

## Legacy Mixamo soldier (bundled fallback source, not currently loaded)

- File: `public/models/mixamo-soldier.glb`
- Source: [three.js Soldier.glb example](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb)
- Original character/animation source: Mixamo
- Embedded clips: Idle, Walk, Run, TPose
- Use: Retained as a local fallback candidate. Review the current Adobe Mixamo
  terms before redistributing the source model separately.

## M4A1 carbine

- Files: `public/models/m4a1.fbx`, `public/models/m4a1-diffuse.png`
- Source: [Low-Poly M4A1 on OpenGameArt](https://opengameart.org/content/low-poly-m4a1)
- License: CC0 1.0 Universal (public domain)

## Pistol

- File: `public/models/pistol.glb`
- Source: [Pistol by loafbrr on OpenGameArt](https://opengameart.org/content/pistol-5)
- Original download: `pistolfbxgltftexturesblend_1.zip` (the included self-contained glTF was repackaged as GLB for web delivery)
- License: CC0 1.0 Universal (public domain)
- Author: loafbrr

## AK-47 (enemy rifle)

- File: `public/models/weapons/quaternius-ak47.glb`
- Source: [AK47 by Quaternius](https://poly.pizza/m/em1Hi9GuCv)
- Direct source file: `https://static.poly.pizza/cf6f2c6d-87a2-47d5-883f-1efd73900f41.glb`
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Author: Quaternius
- SHA-256: `816a097b7052c6da0d74b767702c0596afe1e4ff20ed44949d408065e7c5b86e`
- Use: Visible enemy primary weapon; Scouts may spawn with pistol instead

The older `public/models/weapons/ak47.fbx` and `ak47-diffuse.png` files are
retained but are no longer loaded because their OpenGameArt page did not expose
a sufficiently clear redistribution license.

## Environment textures (Poly Haven)

- Files: `public/textures/concrete.jpg`, `asphalt.jpg`, `brick.jpg`, `metal.jpg`,
  `plaster.jpg`, `wood.jpg`, `corrugated.jpg`, `paint.jpg`, `patterned-brick.jpg`
- Source: [Poly Haven](https://polyhaven.com/) 1K JPG downloads
  - concrete_floor_painted, asphalt_02, red_brick_03, metal_plate
  - plastered_wall, wood_cabinet_worn_long, corrugated_iron_02
  - painted_metal_shutter, patterned_brick_wall
- License: CC0 1.0 Universal
- Use: Compound ground, roads, building facades, towers, barriers, fuel tanks

## Imported military and industrial environment models (Poly Haven)

All models below were downloaded as the 1K textured glTF release from Poly Haven and
repacked without material changes into a self-contained GLB for browser delivery.
The concrete barrier and compressor meshes were simplified for mobile performance;
the source, authorship, and license remain unchanged.

- `public/models/env/concrete_road_barrier_02.glb`
  - Source: [Concrete Road Barrier 02](https://polyhaven.com/a/concrete_road_barrier_02)
- `public/models/env/ammo_box.glb`
  - Source: [Ammo Box](https://polyhaven.com/a/ammo_box)
- `public/models/env/wooden_military_crate.glb`
  - Source: [Wooden Military Crate](https://polyhaven.com/a/wooden_military_crate)
- `public/models/env/metal_jerrycan_green.glb`
  - Source: [Metal Jerrycan Green](https://polyhaven.com/a/metal_jerrycan_green)
- `public/models/env/old_military_compressor.glb`
  - Source: [Old Military Compressor](https://polyhaven.com/a/old_military_compressor)
- `public/models/env/barrel_03.glb`
  - Source: [Barrel 03](https://polyhaven.com/a/barrel_03)
- `public/models/env/rollershutter_door.glb`
  - Source: [Rollershutter Door](https://polyhaven.com/a/rollershutter_door)
- License for every model in this section: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Use: Instanced compound cover and dressing, warehouse facade details, and shooting-range props

# Audio assets

## Weapon fire

- Files: `public/audio/m4-fire.wav`, `public/audio/m4-reload.wav`, `public/audio/pistol-fire.wav`
- Source: [Chaingun, pistol, rifle, shotgun shots](https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots)
- Original files: `rifle.wav`, `pistol.wav` (edited into responsive fire and M4 reload clips)
- License: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- Author: Michel Baradari, [apollo-music.de](https://apollo-music.de/)

## Pistol reload

- File: `public/audio/reload.wav`
- Source: [Handgun Reload Sound Effect](https://opengameart.org/content/handgun-reload-sound-effect)
- License: CC0 1.0 Universal (public domain)
- Author: zer0_sol

## Radio cue

- File: `public/audio/radio-call.wav`
- Source: [Radio call](https://opengameart.org/content/radio-call)
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Author: Tuomo Untinen (submitted by Reemax)
- Use: Short connection/static cue before locally generated browser speech. Mission dialogue text is original to this project.

## Combat FX SFX

- Files under `public/audio/fx/`:
  - `explosion.mp3`, `footsteps.mp3`, `ricochet.mp3`, `shell-casing.mp3`, `impact-dirt.mp3`, `hit-flesh.mp3`
  - Source: [Mixkit](https://mixkit.co/free-sound-effects/) preview clips (royalty-free for projects; check Mixkit license for redistribution)
  - `distant-gun.wav`, `footstep-concrete.wav`, `footstep-dirt.wav`, `footstep-metal.wav`, `suppression.wav`
  - Source: Procedural WAV generators (original to this project)
