# Quest 3 WebXR

Bradley’s Dark Sector supports Meta Quest 3 via browser WebXR (`immersive-vr`).

## Controls (default)

| Input | Action |
| --- | --- |
| Left stick | Smooth move |
| Right stick X | Snap turn (30° / 45° / 90°) |
| Right trigger | Fire (hold M4 for full-auto) |
| Right grip | ADS / stabilize |
| X | Reload |
| Y | Open / close VR menu |
| A | Interact |
| B | Swap weapon |
| Left stick click | Medkit |
| Left grip | Crouch |
| Left trigger | Sprint |

## Desktop / LAN testing

1. Install [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) (Chrome/Edge).
2. `npm run dev` — Vite binds `host: true` so LAN devices can connect.
3. Open the game → use the **ENTER VR** button (bottom center).
4. Emulator: verify move, snap turn, fire, Y menu, Solo / Range.

## Quest 3 on-device checklist

WebXR on Quest requires a **secure context**:

- `https://…` (recommended), or
- `http://localhost` only on the headset itself (not useful for LAN)

Practical options:

1. Deploy a preview build over HTTPS, or
2. Use a tunnel (`cloudflared`, `ngrok`) to your Vite host, or
3. Set up a local trusted HTTPS cert and open `https://<LAN-IP>:5173`

### Verify on headset

- [ ] ENTER VR starts immersive session
- [ ] Left stick moves; walls collide
- [ ] Right stick snaps without continuous spin
- [ ] Right trigger fires; M4 holds full-auto
- [ ] Weapon follows right grip
- [ ] Y opens world-space menu; trigger selects Solo / Range / Exit VR
- [ ] Wrist HUD shows HP / ammo / wave
- [ ] Exit VR restores desktop/mobile UI
- [ ] Comfortable frame rate (no heavy judder)

## Out of scope (v1)

- Hand tracking as primary input
- PVP over Quest (server URL is still local `ws://` oriented)
- Teleport locomotion
- Two-handed weapon IK

## Settings

Desktop **Settings** panel includes snap turn degrees, VR move speed, and comfort vignette preference. In VR, **COMFORT / SETTINGS** on the world menu cycles snap angle + vignette pref.
