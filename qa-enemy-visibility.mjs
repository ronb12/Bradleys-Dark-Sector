/**
 * Verify enemies spawn in forward view and damage coincides with on-screen
 * hostiles and/or a CONTACT / damage-bearing HUD cue.
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
page.on('pageerror', (e) => note('P0', 'PageError', String(e)))

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve()
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Enter compound/i }).click()
await page.waitForFunction(() => {
  const g = window.__darkSector
  return g?.running && g.enemies?.length > 0 && g.enemyModelLoaded
}, null, { timeout: 15000 })
await page.waitForTimeout(800)

const spawnSnap = await page.evaluate(() => {
  const g = window.__darkSector
  const forward = { x: Math.sin(g.yaw), z: -Math.cos(g.yaw) }
  const living = g.enemies.filter((e) => e.userData.alive)
  const rows = living.map((e) => {
    const dx = e.position.x - g.player.position.x
    const dz = e.position.z - g.player.position.z
    const dist = Math.hypot(dx, dz)
    const to = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: -1 }
    const dot = forward.x * to.x + forward.z * to.z
    return {
      type: e.userData.enemyType,
      dist: +dist.toFixed(2),
      dot: +dot.toFixed(3),
      scale: +e.scale.x.toFixed(2),
      y: +e.position.y.toFixed(3),
      groundOffset: +(e.userData.groundOffset ?? 0).toFixed(3),
      forwardHemisphere: dot >= 0.05,
    }
  })
  return {
    yaw: g.yaw,
    health: g.health,
    living: rows.length,
    forwardCount: rows.filter((r) => r.forwardHemisphere).length,
    minY: Math.min(...rows.map((r) => r.y)),
    avgScale: rows.reduce((s, r) => s + r.scale, 0) / Math.max(1, rows.length),
    rows,
  }
})

note(
  spawnSnap.forwardCount >= Math.ceil(spawnSnap.living * 0.7) ? 'Pass' : 'P0',
  'Spawn',
  `${spawnSnap.forwardCount}/${spawnSnap.living} enemies in forward hemisphere (yaw=${spawnSnap.yaw})`
)
note(
  spawnSnap.avgScale >= 1.45 ? 'Pass' : 'P1',
  'Scale',
  `avgScale=${spawnSnap.avgScale.toFixed(2)} minY=${spawnSnap.minY}`
)

await page.evaluate(() => {
  const g = window.__darkSector
  const living = g.enemies.filter((e) => e.userData.alive)
  if (!living.length) return
  living.sort(
    (a, b) =>
      Math.hypot(a.position.x - g.player.position.x, a.position.z - g.player.position.z) -
      Math.hypot(b.position.x - g.player.position.x, b.position.z - g.player.position.z)
  )
  const target = living[0]
  const dx = target.position.x - g.player.position.x
  const dz = target.position.z - g.player.position.z
  g.yaw = Math.atan2(dx, -dz)
  g.pitch = -0.08
  g.playerDamageCooldown = 0
  target.position.set(
    g.player.position.x + Math.sin(g.yaw) * 11,
    target.userData.groundOffset || 0,
    g.player.position.z - Math.cos(g.yaw) * 11
  )
  target.userData.lastSeenAt = performance.now()
  target.userData.cooldown = 0
  g.enemyVolleyCooldown = 0
})

await page.screenshot({ path: `${OUT}/pt-20-enemies-forward-spawn.png`, fullPage: true })

let damaged = null
for (let i = 0; i < 80; i += 1) {
  await page.waitForTimeout(120)
  const s = await page.evaluate(() => {
    const g = window.__darkSector
    g.camera.updateMatrixWorld()
    const living = g.enemies.filter((e) => e.userData.alive)
    let onScreen = 0
    for (const e of living) {
      const v3 = e.position.clone()
      v3.y += 1.55
      v3.project(g.camera)
      if (v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.15) onScreen += 1
    }
    const body = document.body.innerText
    return {
      health: g.health,
      contact: /CONTACT/.test(body),
      bearing: /Incoming · (left|right|rear)/i.test(body) || /\bREAR\b/.test(body),
      onScreen,
      living: living.length,
    }
  })
  if (s.health < 100) {
    damaged = s
    break
  }
}

await page.screenshot({ path: `${OUT}/pt-21-after-damage-contact.png`, fullPage: true })

if (!damaged) {
  note('P0', 'Damage', 'No damage taken within probe window')
} else {
  const ok = damaged.onScreen >= 1 || damaged.contact || damaged.bearing
  note(
    ok ? 'Pass' : 'P0',
    'Visibility',
    `health=${damaged.health} onScreen=${damaged.onScreen} contact=${damaged.contact} bearing=${damaged.bearing}`
  )
}

const behindGate = await page.evaluate(() => {
  const g = window.__darkSector
  const enemy = g.enemies.find((e) => e.userData.alive)
  if (!enemy) return { error: 'no enemy' }
  const before = g.health
  enemy.position.set(g.player.position.x, enemy.userData.groundOffset || 0, g.player.position.z + 14)
  enemy.userData.lastSeenAt = 0
  enemy.userData.cooldown = 0
  g.enemyVolleyCooldown = 0
  g.playerDamageCooldown = 0
  g.yaw = 0
  return { before, type: enemy.userData.enemyType }
})

await page.waitForTimeout(2500)
const afterBehind = await page.evaluate(() => ({
  health: window.__darkSector.health,
}))

if (behindGate.error) {
  note('P1', 'BehindGate', behindGate.error)
} else if (afterBehind.health >= behindGate.before - 1) {
  note('Pass', 'BehindGate', `Far-behind shooter dealt little/no damage (${behindGate.before}→${afterBehind.health})`)
} else {
  note('P1', 'BehindGate', `Unexpected damage from behind ${behindGate.before}→${afterBehind.health}`)
}

await page.screenshot({ path: `${OUT}/pt-22-behind-damage-gate.png`, fullPage: true })

writeFileSync(`${OUT}/enemy-visibility-report.json`, JSON.stringify({ findings, spawnSnap, damaged, behindGate, afterBehind }, null, 2))
await browser.close()

const failed = findings.some((f) => f.severity === 'P0')
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
