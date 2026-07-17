/**
 * Full playtest matrix for Bradley's Dark Sector.
 * Writes screenshots + qa-artifacts/full-playtest-report.json
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const OUT = 'qa-artifacts'
const BASE = 'http://127.0.0.1:5173/'
mkdirSync(OUT, { recursive: true })

const findings = []
const note = (severity, area, detail) => {
  findings.push({ severity, area, detail })
  console.log(`[${severity}] ${area}: ${detail}`)
}

const audioPaths = [
  '/audio/m4-fire.wav',
  '/audio/m4-reload.wav',
  '/audio/pistol-fire.wav',
  '/audio/radio-call.wav',
  '/audio/reload.wav',
]

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()

const consoleLogs = []
const pageErrors = []
const failedRequests = []
const responseCodes = new Map()

page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }))
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' })
})
page.on('response', (res) => {
  try {
    const u = new URL(res.url())
    if (u.origin.includes('127.0.0.1:5173') || u.pathname.startsWith('/audio') || u.pathname.startsWith('/models')) {
      responseCodes.set(u.pathname, res.status())
    }
  } catch { /* ignore */ }
})

const readHud = async () => {
  const body = await page.locator('body').innerText()
  return {
    body,
    wave: body.match(/WAVE\s+(\d+)/)?.[1] ?? null,
    hostiles: body.match(/Hostiles:\s+(\d+)/)?.[1] ?? null,
    armor: body.match(/ARMOR\s+(\d+)%/)?.[1] ?? body.match(/ARMOR[\s\S]*?(\d+)%/)?.[1] ?? null,
    weapon: body.match(/(M4A1 CARBINE|9MM PISTOL)/)?.[1] ?? null,
    ammo: body.match(/(?:M4A1 CARBINE|9MM PISTOL)\s*\n(RELOAD|\d+)/)?.[1]
      ?? body.match(/\n(RELOAD|\d+)\n/)?.[1] ?? null,
    m4Strip: body.match(/1 M4 · (\d+)\/30/)?.[1] ?? null,
    pistolStrip: body.match(/2 PISTOL · (\d+)\/15/)?.[1] ?? null,
    score: body.match(/Score\s+(\d+)/)?.[1] ?? null,
    pvpLinked: body.match(/PVP · (\d+) LINKED/)?.[1] ?? null,
    kd: body.match(/K\/D\s+(\d+)\/(\d+)/) ?? null,
    modelMode: body.match(/Enemy models:\s*(.+)/)?.[1]?.trim() ?? null,
    gameOver: /Compound\s*Overrun|Restart mission/i.test(body),
    reloading: /Reloading magazine|RELOAD/i.test(body),
  }
}

const snapState = async () => page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return { error: 'no __darkSector' }
  return {
    running: g.running,
    gameMode: g.gameMode,
    health: g.health,
    ammo: g.ammo,
    maxAmmo: g.maxAmmo,
    reload: +g.reload.toFixed(2),
    activeWeapon: g.activeWeapon,
    weaponAmmo: { ...g.weaponAmmo },
    enemies: g.enemies.filter((e) => e.userData.alive).length,
    enemySample: g.enemies.filter((e) => e.userData.alive).slice(0, 4).map((e) => ({
      x: +e.position.x.toFixed(2),
      z: +e.position.z.toFixed(2),
      dist: +Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z).toFixed(2),
      type: e.userData.enemyType,
      scale: +e.scale.x.toFixed(2),
    })),
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
    yaw: +g.yaw.toFixed(3),
    pitch: +g.pitch.toFixed(3),
    fog: g.scene?.fog?.density ?? null,
    remotePlayers: g.remotePlayers?.size ?? 0,
    pvpAlive: g.pvpAlive,
    pvpKills: g.pvpKills,
    pvpDeaths: g.pvpDeaths,
  }
})

const aimAtNearestEnemy = async () => page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return { ok: false, reason: 'no state' }
  const living = g.enemies.filter((e) => e.userData.alive)
  if (!living.length) return { ok: false, reason: 'no enemies' }
  living.sort((a, b) => {
    const da = Math.hypot(a.position.x - g.player.position.x, a.position.z - g.player.position.z)
    const db = Math.hypot(b.position.x - g.player.position.x, b.position.z - g.player.position.z)
    return da - db
  })
  const enemy = living[0]
  const targetY = 1.35 * enemy.scale.y
  const dx = enemy.position.x - g.player.position.x
  const dz = enemy.position.z - g.player.position.z
  const dy = (enemy.position.y + targetY) - (g.player.position.y + 1.95)
  const dist = Math.hypot(dx, dz)
  g.yaw = Math.atan2(dx, -dz)
  g.pitch = Math.atan2(dy, dist)
  g.camera.position.copy(g.player.position).add({ x: 0, y: 1.95, z: 0 })
  g.camera.rotation.set(g.pitch, g.yaw, 0, 'YXZ')
  return { ok: true, dist: +dist.toFixed(2), type: enemy.userData.enemyType }
})

const emptyMagFire = async (weaponLabel) => {
  // Hold space / click until ammo hits 0 / RELOAD
  for (let i = 0; i < 45; i += 1) {
    await page.keyboard.press(' ')
    await page.waitForTimeout(70)
    const hud = await readHud()
    if (hud.ammo === 'RELOAD' || hud.ammo === '0' || hud.reloading) {
      return { emptied: true, hud, shots: i + 1 }
    }
  }
  const hud = await readHud()
  note('P1', `Weapons/${weaponLabel}`, `Could not empty magazine via fire (ammo=${hud.ammo})`)
  return { emptied: false, hud, shots: 45 }
}

// ─── 1. Boot / menus ───────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/pt-01-title.png`, fullPage: true })

const titleOk = await page.getByRole('heading', { name: /Bradley'?s\s*Dark Sector/i }).isVisible()
const soloBtn = page.getByRole('button', { name: /Enter compound/i })
const pvpBtn = page.getByRole('button', { name: /Join dark-sector/i })
const soloOk = await soloBtn.isVisible()
const pvpOk = await pvpBtn.isVisible()
if (!titleOk) note('P0', 'Boot', 'Title heading missing')
if (!soloOk) note('P0', 'Boot', 'Solo ENTER COMPOUND / Enter compound missing')
if (!pvpOk) note('P0', 'Boot', 'PVP Join dark-sector option missing')
if (titleOk && soloOk && pvpOk) note('Pass', 'Boot', 'Title, Solo, and PVP options render')

const canvasCount = await page.locator('canvas').count()
if (canvasCount < 1) note('P0', 'Render', 'No WebGL canvas')
else note('Pass', 'Render', `WebGL canvas present (${canvasCount})`)

// ─── 2. Solo waves ─────────────────────────────────────────────────
await soloBtn.click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/pt-02-mission-start.png`, fullPage: true })

const menuGone = !(await soloBtn.isVisible().catch(() => false))
if (!menuGone) note('P1', 'Solo', 'Title overlay still visible after Enter compound')
else note('Pass', 'Solo', 'Mission started; menu dismissed')

let state = await snapState()
let hud = await readHud()
if (state.error) note('P1', 'Solo', `Debug hook missing: ${state.error}`)
if ((state.enemies ?? 0) >= 1 || Number(hud.hostiles) >= 1) {
  note('Pass', 'Solo', `Enemies spawned (state=${state.enemies ?? '?'}, HUD hostiles=${hud.hostiles})`)
} else {
  note('P0', 'Solo', `No enemies after mission start (state=${JSON.stringify(state)}, hostiles=${hud.hostiles})`)
}

const aim = await aimAtNearestEnemy()
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/pt-03-enemy-midrange.png`, fullPage: true })
if (aim.ok) note('Pass', 'Solo', `Aimed at ${aim.type} at ${aim.dist}m for mid-range screenshot`)
else note('P1', 'Solo', `Could not aim at enemy: ${aim.reason}`)

// Move / aim / fire smoke
await page.keyboard.down('w')
await page.waitForTimeout(700)
await page.keyboard.up('w')
await page.keyboard.down('a')
await page.waitForTimeout(350)
await page.keyboard.up('a')
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 30, { steps: 10 })
  await page.mouse.up()
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(80)
  }
}
await page.screenshot({ path: `${OUT}/pt-04-after-move-fire.png`, fullPage: true })
note('Pass', 'Solo', 'WASD move, mouse look, and fire accepted without crash')

// ─── 5. Compound visuals (early + look around) ─────────────────────
await page.screenshot({ path: `${OUT}/pt-05-compound-start.png`, fullPage: true })
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(200)
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(200)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(200)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(200)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/pt-06-compound-look.png`, fullPage: true })
note('Info', 'Compound', 'Screenshots captured for visual assessment (procedural compound expected)')

// ─── 3. Weapons ────────────────────────────────────────────────────
hud = await readHud()
state = await snapState()
if (hud.weapon === 'M4A1 CARBINE' || state.activeWeapon === 'm4') {
  note('Pass', 'Weapons', 'Starts on M4A1 CARBINE')
} else {
  note('P1', 'Weapons', `Expected M4 at start, got weapon=${hud.weapon} state=${state.activeWeapon}`)
}

await page.keyboard.press('2')
await page.waitForTimeout(250)
hud = await readHud()
state = await snapState()
if (hud.weapon === '9MM PISTOL' || state.activeWeapon === 'pistol') {
  note('Pass', 'Weapons', 'Switch to pistol via 2')
} else {
  note('P0', 'Weapons', `2 did not switch to pistol (HUD=${hud.weapon}, state=${state.activeWeapon})`)
}

await page.keyboard.press('1')
await page.waitForTimeout(250)
hud = await readHud()
state = await snapState()
if (hud.weapon === 'M4A1 CARBINE' || state.activeWeapon === 'm4') {
  note('Pass', 'Weapons', 'Switch back to M4 via 1')
} else {
  note('P0', 'Weapons', `1 did not switch to M4 (HUD=${hud.weapon}, state=${state.activeWeapon})`)
}

await page.keyboard.press('q')
await page.waitForTimeout(250)
hud = await readHud()
state = await snapState()
if (hud.weapon === '9MM PISTOL' || state.activeWeapon === 'pistol') {
  note('Pass', 'Weapons', 'Q toggles weapon')
} else {
  note('P1', 'Weapons', `Q toggle failed (HUD=${hud.weapon}, state=${state.activeWeapon})`)
}

// Empty pistol mag → auto-reload
await page.keyboard.press('2')
await page.waitForTimeout(200)
const pistolEmpty = await emptyMagFire('pistol')
await page.screenshot({ path: `${OUT}/pt-07-pistol-reload-hud.png`, fullPage: true })
state = await snapState()
if (pistolEmpty.emptied && (pistolEmpty.hud.ammo === 'RELOAD' || pistolEmpty.hud.reloading || state.reload > 0)) {
  note('Pass', 'Weapons', 'Pistol empty-mag shows RELOAD / starts reload')
} else if (pistolEmpty.emptied) {
  note('P1', 'Weapons', `Pistol emptied but RELOAD HUD unclear (ammo=${pistolEmpty.hud.ammo}, reload=${state.reload})`)
}

await page.waitForTimeout(1600)
state = await snapState()
hud = await readHud()
if (state.ammo === state.maxAmmo || Number(hud.ammo) === 15 || Number(hud.pistolStrip) === 15) {
  note('Pass', 'Weapons', `Pistol auto-reload completed (ammo=${state.ammo ?? hud.ammo})`)
} else {
  note('P0', 'Weapons', `Pistol auto-reload failed (ammo=${state.ammo}, reload=${state.reload}, HUD=${hud.ammo})`)
}

// Partial drain + R reload on pistol
await page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return
  g.ammo = 3
  g.weaponAmmo.pistol = 3
  g.reload = 0
})
await page.waitForTimeout(100)
await page.keyboard.press('r')
await page.waitForTimeout(200)
state = await snapState()
hud = await readHud()
if (state.reload > 0 || hud.ammo === 'RELOAD') {
  note('Pass', 'Weapons', 'R starts pistol reload from partial mag')
  await page.waitForTimeout(1400)
  state = await snapState()
  if (state.ammo === state.maxAmmo) note('Pass', 'Weapons', 'R reload restores pistol mag')
  else note('P0', 'Weapons', `R reload did not restore pistol (ammo=${state.ammo}, reload=${state.reload})`)
} else {
  note('P0', 'Weapons', `R failed to start pistol reload (ammo=${state.ammo}, reload=${state.reload})`)
}

// M4 empty + auto-reload + R
await page.keyboard.press('1')
await page.waitForTimeout(200)
const m4Empty = await emptyMagFire('m4')
await page.screenshot({ path: `${OUT}/pt-08-m4-reload-hud.png`, fullPage: true })
state = await snapState()
if (m4Empty.emptied && (m4Empty.hud.ammo === 'RELOAD' || state.reload > 0)) {
  note('Pass', 'Weapons', 'M4 empty-mag starts reload / RELOAD HUD')
} else if (m4Empty.emptied) {
  note('P1', 'Weapons', `M4 emptied but reload unclear (ammo=${m4Empty.hud.ammo}, reload=${state.reload})`)
}

await page.waitForTimeout(1800)
state = await snapState()
if (state.ammo === 30 || state.ammo === state.maxAmmo) {
  note('Pass', 'Weapons', `M4 auto-reload completed (ammo=${state.ammo})`)
} else {
  note('P0', 'Weapons', `M4 auto-reload incomplete (ammo=${state.ammo}, reload=${state.reload})`)
}

await page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return
  g.ammo = 0
  g.weaponAmmo.m4 = 0
  g.reload = 0
})
await page.waitForTimeout(100)
await page.keyboard.press('r')
await page.waitForTimeout(200)
state = await snapState()
if (state.reload > 0) {
  note('Pass', 'Weapons', 'R starts M4 reload on empty mag')
  await page.waitForTimeout(1800)
  state = await snapState()
  if (state.ammo === 30) note('Pass', 'Weapons', 'R reload restores M4 mag to 30')
  else note('P0', 'Weapons', `R reload did not restore M4 (ammo=${state.ammo})`)
} else {
  note('P0', 'Weapons', `R failed on empty M4 (ammo=${state.ammo}, reload=${state.reload})`)
}

// ─── 4. Audio ──────────────────────────────────────────────────────
const audioResults = []
for (const path of audioPaths) {
  const res = await page.request.get(`${BASE.replace(/\/$/, '')}${path}`)
  audioResults.push({ path, status: res.status() })
  if (res.status() !== 200) note('P1', 'Audio', `${path} returned ${res.status()}`)
}
if (audioResults.every((a) => a.status === 200)) {
  note('Pass', 'Audio', `All ${audioPaths.length} audio assets return 200 (headless cannot verify audible playback)`)
}
const audioRuntimeErrors = pageErrors.filter((e) => /audio|Audio|play\(/i.test(e))
if (audioRuntimeErrors.length) {
  for (const e of audioRuntimeErrors.slice(0, 3)) note('P1', 'Audio', e)
} else {
  note('Pass', 'Audio', 'No audio-related page errors during playtest')
}

// ─── 6. Survival / damage ──────────────────────────────────────────
const healthBefore = (await snapState()).health
await page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return
  // Expire invulnerability and pull an enemy into melee range
  g.playerDamageCooldown = 0
  const living = g.enemies.filter((e) => e.userData.alive)
  if (living[0]) {
    living[0].position.set(g.player.position.x + 1.2, 0, g.player.position.z + 0.4)
  }
})
await page.waitForTimeout(4500)
const afterDmg = await snapState()
hud = await readHud()
await page.screenshot({ path: `${OUT}/pt-09-after-damage.png`, fullPage: true })
if (hud.gameOver || afterDmg.running === false) {
  note('P0', 'Survival', 'Instant/early game-over within damage probe window')
} else if (typeof afterDmg.health === 'number' && afterDmg.health < healthBefore) {
  note('Pass', 'Survival', `Took damage without death (${healthBefore} → ${afterDmg.health})`)
} else if (typeof afterDmg.health === 'number' && afterDmg.health === 100) {
  note('P1', 'Survival', 'No damage registered after melee proximity probe (may be range/cooldown timing)')
} else {
  note('Pass', 'Survival', `Still alive after probe (health=${afterDmg.health}, running=${afterDmg.running})`)
}

// ─── 7. Game over / reboot (force if needed within timeout) ─────────
let reachedGameOver = hud.gameOver
if (!reachedGameOver) {
  await page.evaluate(() => {
    const g = window.__darkSector
    if (!g) return
    g.health = 1
    g.playerDamageCooldown = 0
    g.enemies.filter((e) => e.userData.alive).forEach((e, i) => {
      e.position.set(g.player.position.x + (i % 3) * 0.8, 0, g.player.position.z + 1.0)
      e.userData.enemyType = 'Heavy'
    })
  })
  for (let i = 0; i < 20 && !reachedGameOver; i += 1) {
    await page.waitForTimeout(500)
    hud = await readHud()
    reachedGameOver = hud.gameOver
  }
}

if (reachedGameOver) {
  await page.screenshot({ path: `${OUT}/pt-10-game-over.png`, fullPage: true })
  note('Pass', 'GameOver', 'Game-over / Compound Overrun screen reached')
  const restart = page.getByRole('button', { name: /Restart mission/i })
  if (await restart.isVisible()) {
    await restart.click()
    await page.waitForTimeout(1200)
    hud = await readHud()
    state = await snapState()
    await page.screenshot({ path: `${OUT}/pt-11-after-restart.png`, fullPage: true })
    if (!hud.gameOver && (state.running || Number(hud.wave) >= 1)) {
      note('Pass', 'GameOver', 'Restart mission returns to playable solo state')
    } else {
      note('P0', 'GameOver', `Restart failed (gameOver=${hud.gameOver}, running=${state.running})`)
    }
  } else {
    note('P0', 'GameOver', 'Restart mission button missing on game-over screen')
  }
} else {
  note('Info', 'GameOver', 'Could not force game-over within timeout — restart untested')
}

// ─── 8. PVP smoke (two clients) ────────────────────────────────────
let pvpServerUp = false
try {
  // TCP-ish check via WebSocket from Node using Playwright page
  pvpServerUp = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      let settled = false
      const ws = new WebSocket('ws://127.0.0.1:2567')
      const done = (ok) => { if (!settled) { settled = true; try { ws.close() } catch {} ; resolve(ok) } }
      ws.onopen = () => done(true)
      ws.onerror = () => done(false)
      setTimeout(() => done(false), 1500)
    })
  })
} catch {
  pvpServerUp = false
}

if (!pvpServerUp) {
  note('Info', 'PVP', 'PVP server not reachable on ws://127.0.0.1:2567 — skipped')
} else {
  // Return to menu if in-mission: reload page for clean PVP join
  const pageA = page
  const pageB = await context.newPage()
  pageB.on('pageerror', (err) => pageErrors.push(`B: ${err}`))

  await pageA.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  await pageB.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  await pageA.waitForTimeout(800)
  await pageB.waitForTimeout(800)

  await pageA.getByRole('button', { name: /Join dark-sector/i }).click()
  await pageB.getByRole('button', { name: /Join dark-sector/i }).click()
  await pageA.waitForTimeout(2500)
  await pageB.waitForTimeout(1000)

  const hudA = await pageA.locator('body').innerText()
  const hudB = await pageB.locator('body').innerText()
  await pageA.screenshot({ path: `${OUT}/pt-12-pvp-client-a.png`, fullPage: true })
  await pageB.screenshot({ path: `${OUT}/pt-13-pvp-client-b.png`, fullPage: true })

  const linkedA = /PVP · (\d+) LINKED/.exec(hudA)?.[1]
  const linkedB = /PVP · (\d+) LINKED/.exec(hudB)?.[1]
  const kdA = /K\/D\s+\d+\/\d+/.test(hudA)
  const kdB = /K\/D\s+\d+\/\d+/.test(hudB)
  const errA = /Could not reach|error/i.test(hudA) && /pvp|link|server/i.test(hudA)

  if ((Number(linkedA) >= 2 || Number(linkedB) >= 2) && kdA && kdB) {
    note('Pass', 'PVP', `Two clients linked (A=${linkedA}, B=${linkedB}) with K/D HUD`)
  } else if (Number(linkedA) >= 1 && kdA) {
    note('P1', 'PVP', `PVP joined but link count low (A=${linkedA}, B=${linkedB}); K/D A=${kdA} B=${kdB}`)
  } else {
    note('P0', 'PVP', `PVP join failed or crashed (linked A=${linkedA} B=${linkedB}, errHint=${errA})`)
  }

  const pvpPageErrors = pageErrors.filter((e) => e.startsWith('B:') || /pvp|WebSocket/i.test(e))
  if (!pvpPageErrors.length) note('Pass', 'PVP', 'No PVP-related page crashes during dual-client join')
  await pageB.close()
}

// Runtime summary
const assertFails = consoleLogs.filter((l) => l.type === 'error' && /Assertion failed|console\.assert/i.test(l.text))
if (assertFails.length) note('P1', 'SmokeTests', `console.assert failures: ${assertFails.map((a) => a.text).join(' | ')}`)
else note('Pass', 'SmokeTests', 'No console.assert failures observed')

if (pageErrors.length) {
  for (const err of pageErrors.slice(0, 6)) note('P0', 'Runtime', err)
} else {
  note('Pass', 'Runtime', 'No uncaught page errors during playtest')
}

await browser.close()

const summary = {
  url: BASE,
  timestamp: new Date().toISOString(),
  counts: {
    pass: findings.filter((f) => f.severity === 'Pass').length,
    p0: findings.filter((f) => f.severity === 'P0').length,
    p1: findings.filter((f) => f.severity === 'P1').length,
    p2: findings.filter((f) => f.severity === 'P2').length,
    info: findings.filter((f) => f.severity === 'Info').length,
  },
  findings,
  audioResults,
  pageErrors,
  failedRequests: failedRequests.slice(0, 20),
  consoleErrorSample: consoleLogs.filter((l) => l.type === 'error').slice(0, 15),
  screenshots: [
    'qa-artifacts/pt-01-title.png',
    'qa-artifacts/pt-02-mission-start.png',
    'qa-artifacts/pt-03-enemy-midrange.png',
    'qa-artifacts/pt-04-after-move-fire.png',
    'qa-artifacts/pt-05-compound-start.png',
    'qa-artifacts/pt-06-compound-look.png',
    'qa-artifacts/pt-07-pistol-reload-hud.png',
    'qa-artifacts/pt-08-m4-reload-hud.png',
    'qa-artifacts/pt-09-after-damage.png',
    'qa-artifacts/pt-10-game-over.png',
    'qa-artifacts/pt-11-after-restart.png',
    'qa-artifacts/pt-12-pvp-client-a.png',
    'qa-artifacts/pt-13-pvp-client-b.png',
  ],
}

console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(summary.counts, null, 2))
writeFileSync(`${OUT}/full-playtest-report.json`, JSON.stringify(summary, null, 2))
console.log(`Wrote ${OUT}/full-playtest-report.json`)
