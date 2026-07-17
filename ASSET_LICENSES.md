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
