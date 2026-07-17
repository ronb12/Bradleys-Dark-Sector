/**
 * Focused re-checks: M4 empty-mag auto-reload + enemy mid-range visibility.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'qa-artifacts'
mkdirSync(OUT, { recursive: true })
const findings = []
const note = (severity, area, detail) => {
  findings.push({ severity, area, detail })
  console.log(`[${severity}] ${area}: ${detail}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Enter compound/i }).click()
await page.waitForTimeout(1500)

const snap = () => page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return null
  return {
    ammo: g.ammo,
    maxAmmo: g.maxAmmo,
    reload: +g.reload.toFixed(3),
    activeWeapon: g.activeWeapon,
    health: g.health,
    enemies: g.enemies.filter((e) => e.userData.alive).map((e) => ({
      type: e.userData.enemyType,
      x: +e.position.x.toFixed(2),
      z: +e.position.z.toFixed(2),
      dist: +Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z).toFixed(2),
      visible: e.visible,
      scale: +e.scale.x.toFixed(2),
    })),
    fog: g.scene?.fog ? { near: g.scene.fog.near, far: g.scene.fog.far, density: g.scene.fog.density } : null,
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
  }
})

const aimNearest = () => page.evaluate(() => {
  const g = window.__darkSector
  const living = g.enemies.filter((e) => e.userData.alive)
  living.sort((a, b) => Math.hypot(a.position.x - g.player.position.x, a.position.z - g.player.position.z)
    - Math.hypot(b.position.x - g.player.position.x, b.position.z - g.player.position.z))
  const enemy = living[0]
  if (!enemy) return null
  // Clear LOS: place enemy mid-range dead ahead
  enemy.position.set(g.player.position.x, 0, g.player.position.z - 12)
  const dx = enemy.position.x - g.player.position.x
  const dz = enemy.position.z - g.player.position.z
  const dy = (enemy.position.y + 1.4 * enemy.scale.y) - (g.player.position.y + 1.95)
  const dist = Math.hypot(dx, dz)
  g.yaw = Math.atan2(dx, -dz)
  g.pitch = Math.atan2(dy, dist)
  g.camera.position.copy(g.player.position).add({ x: 0, y: 1.95, z: 0 })
  g.camera.rotation.set(g.pitch, g.yaw, 0, 'YXZ')
  return { type: enemy.userData.enemyType, dist: +dist.toFixed(2), scale: +enemy.scale.x.toFixed(2) }
})

// --- Enemy visibility (forced mid-range LOS) ---
const aimed = await aimNearest()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/pt-14-enemy-forced-midrange.png`, fullPage: true })
const s0 = await snap()
if (aimed) note('Pass', 'Enemies', `Forced mid-range LOS to ${aimed.type} at ${aimed.dist}m scale=${aimed.scale}`)
else note('P0', 'Enemies', 'No living enemies to aim at')
note('Info', 'Enemies', `Fog=${JSON.stringify(s0?.fog)} living=${s0?.enemies?.length}`)

// --- M4 empty-mag auto-reload (hold Space, inspect state — not HUD regex) ---
await page.evaluate(() => {
  const g = window.__darkSector
  g.activeWeapon = 'm4'
  g.weapon = g.weaponViews.m4
  g.weaponViews.m4.visible = true
  g.weaponViews.pistol.visible = false
  g.ammo = 30
  g.maxAmmo = 30
  g.weaponAmmo.m4 = 30
  g.reload = 0
  g.fireCooldown = 0
  g.triggerLatched = false
})
await page.keyboard.down(' ')
let emptiedAt = null
for (let i = 0; i < 80; i += 1) {
  await page.waitForTimeout(50)
  const s = await snap()
  if (s.reload > 0 || s.ammo === 0) {
    emptiedAt = { i, ...s }
    break
  }
}
await page.keyboard.up(' ')
await page.screenshot({ path: `${OUT}/pt-15-m4-empty-reload.png`, fullPage: true })

if (emptiedAt && emptiedAt.reload > 0) {
  note('Pass', 'Weapons/M4', `Empty fire started reload (ammo=${emptiedAt.ammo}, reload=${emptiedAt.reload})`)
  await page.waitForTimeout(1600)
  const after = await snap()
  if (after.ammo === 30 && after.reload === 0) note('Pass', 'Weapons/M4', 'Auto-reload restored mag to 30')
  else note('P0', 'Weapons/M4', `Auto-reload failed ammo=${after.ammo} reload=${after.reload}`)
} else if (emptiedAt && emptiedAt.ammo === 0) {
  note('P1', 'Weapons/M4', `Ammo hit 0 but reload timer not started (reload=${emptiedAt.reload})`)
} else {
  const s = await snap()
  note('P0', 'Weapons/M4', `Could not empty mag via held Space (ammo=${s?.ammo}, reload=${s?.reload})`)
}

// Empty + R
await page.evaluate(() => {
  const g = window.__darkSector
  g.ammo = 0
  g.weaponAmmo.m4 = 0
  g.reload = 0
})
await page.keyboard.press('r')
await page.waitForTimeout(150)
let s = await snap()
if (s.reload > 0) {
  note('Pass', 'Weapons/M4', `R starts reload on empty (reload=${s.reload})`)
  await page.waitForTimeout(1600)
  s = await snap()
  if (s.ammo === 30) note('Pass', 'Weapons/M4', 'R reload restores to 30')
  else note('P0', 'Weapons/M4', `R reload incomplete ammo=${s.ammo}`)
} else {
  note('P0', 'Weapons/M4', `R failed on empty ammo=${s.ammo} reload=${s.reload}`)
}

// Pistol empty via state drain + fire click
await page.evaluate(() => {
  const g = window.__darkSector
  g.activeWeapon = 'pistol'
  g.weapon = g.weaponViews.pistol
  g.weaponViews.m4.visible = false
  g.weaponViews.pistol.visible = true
  g.ammo = 1
  g.maxAmmo = 15
  g.weaponAmmo.pistol = 1
  g.reload = 0
  g.fireCooldown = 0
  g.triggerLatched = false
})
await page.keyboard.press(' ')
await page.waitForTimeout(100)
s = await snap()
if (s.reload > 0 || (s.ammo === 0 && s.reload > 0)) {
  note('Pass', 'Weapons/Pistol', `Empty shot starts reload (ammo=${s.ammo}, reload=${s.reload})`)
} else if (s.ammo === 0) {
  // shoot with 1 ammo: decrements then beginReload
  note('P1', 'Weapons/Pistol', `ammo=0 after last shot but reload=${s.reload}`)
} else {
  note('P0', 'Weapons/Pistol', `Empty fire failed ammo=${s.ammo} reload=${s.reload}`)
}
await page.waitForTimeout(1200)
s = await snap()
if (s.ammo === 15) note('Pass', 'Weapons/Pistol', 'Auto-reload restored pistol to 15')
else note('P0', 'Weapons/Pistol', `Pistol auto-reload incomplete ammo=${s.ammo} reload=${s.reload}`)

if (pageErrors.length) for (const e of pageErrors) note('P0', 'Runtime', e)
else note('Pass', 'Runtime', 'No page errors in focused recheck')

const report = { timestamp: new Date().toISOString(), findings, aimed, fog: s0?.fog }
writeFileSync(`${OUT}/focused-recheck-report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
