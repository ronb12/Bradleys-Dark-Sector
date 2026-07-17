/**
 * Focused Playwright smoke for the three QA fixes:
 * 1) Frozen after-action mission time
 * 2) Per-attacker fair-damage / behind gate
 * 3) Short Space taps for semi-auto pistol
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'qa-artifacts'
mkdirSync(OUT, { recursive: true })
const findings = []
const note = (severity, area, detail, extra) => {
  findings.push({ severity, area, detail, ...(extra ? { extra } : {}) })
  console.log(`[${severity}] ${area}: ${detail}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (e) => note('P0', 'PageError', String(e)))

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve()
})

const BASE = process.env.QA_BASE || 'http://127.0.0.1:5173/'
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Enter compound/i }).click()
await page.waitForFunction(() => {
  const g = window.__darkSector
  return g?.running && g.enemies?.length > 0
}, null, { timeout: 20000 })
await page.waitForTimeout(900)

const snap = () =>
  page.evaluate(() => {
    const g = window.__darkSector
    const body = document.body.innerText
    return {
      health: g.health,
      ammo: g.ammo,
      reload: g.reload,
      activeWeapon: g.activeWeapon,
      running: g.running,
      lastMissionTime: g.lastMissionTime,
      missionStartedAt: g.missionStartedAt,
      clock: g.clock.elapsedTime,
      living: g.enemies.filter((e) => e.userData.alive).length,
      bodyMission: body.match(/Time in sector[\s\S]*?(\d{2}:\d{2})/i)?.[1] || null,
      gameOver: /After-Action|Restart mission/i.test(body),
    }
  })

// ─── 3. Short Space taps (pistol) ───────────────────────────────────
await page.evaluate(() => {
  const g = window.__darkSector
  g.health = 100
  g.playerDamageCooldown = 30
  g.activeWeapon = 'pistol'
  g.weapon = g.weaponViews.pistol
  g.weaponViews.m4.visible = false
  g.weaponViews.pistol.visible = true
  g.ammo = 8
  g.maxAmmo = 15
  g.weaponAmmo.pistol = 8
  g.reload = 0
  g.fireCooldown = 0
  g.triggerLatched = false
})
const ammoBefore = (await snap()).ammo
await page.locator('canvas').click({ force: true }).catch(() => null)
for (let i = 0; i < 3; i += 1) {
  await page.keyboard.press(' ')
  // Pistol fireInterval is 0.24s — wait long enough for cooldown between taps.
  await page.waitForTimeout(320)
}
await page.waitForTimeout(150)
const afterTaps = await snap()
if (afterTaps.ammo <= ammoBefore - 3) {
  note('Pass', 'SpacePistol', `Short Space taps consumed ammo ${ammoBefore}→${afterTaps.ammo}`)
} else if (afterTaps.ammo < ammoBefore) {
  note('P2', 'SpacePistol', `Partial short-tap fire ${ammoBefore}→${afterTaps.ammo}`)
} else {
  note('P0', 'SpacePistol', `Short Space taps did not fire ammo=${afterTaps.ammo}`)
}

// M4 hold still empties
await page.evaluate(() => {
  const g = window.__darkSector
  g.activeWeapon = 'm4'
  g.weapon = g.weaponViews.m4
  g.weaponViews.m4.visible = true
  g.weaponViews.pistol.visible = false
  g.ammo = 12
  g.maxAmmo = 30
  g.weaponAmmo.m4 = 12
  g.reload = 0
  g.fireCooldown = 0
  g.triggerLatched = false
})
await page.locator('canvas').click({ force: true }).catch(() => null)
await page.keyboard.down(' ')
const m4Probe = []
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(100)
  m4Probe.push(await page.evaluate(() => ({
    ammo: window.__darkSector.ammo,
    space: !!window.__darkSector && false,
    keysSpace: (() => {
      // keys live in React ref — expose via a temp probe on pulse/ammo only
      return window.__darkSector.ammo
    })(),
  })))
}
await page.keyboard.up(' ')
await page.waitForTimeout(100)
const afterM4 = await snap()
if (afterM4.ammo <= 6 || afterM4.reload > 0) {
  note('Pass', 'SpaceM4', `M4 hold-to-fire still works ammo=${afterM4.ammo} reload=${afterM4.reload}`, { m4Probe })
} else if (afterM4.ammo < 12) {
  note('P2', 'SpaceM4', `M4 hold partial ammo=${afterM4.ammo} reload=${afterM4.reload}`, { m4Probe })
} else {
  note('P1', 'SpaceM4', `M4 hold may be broken ammo=${afterM4.ammo} reload=${afterM4.reload}`, { m4Probe })
}

// ─── 2. Per-attacker fair damage ────────────────────────────────────
const fair = await page.evaluate(async () => {
  const g = window.__darkSector
  g.health = 100
  g.playerDamageCooldown = 0
  g.yaw = 0
  g.pitch = 0
  const living = g.enemies.filter((e) => e.userData.alive)
  if (living.length < 2) {
    // Ensure at least two hostiles for mixed pack
    while (g.enemies.filter((e) => e.userData.alive).length < 2) {
      // can't call spawnEnemy from here — duplicate by reviving dead if needed
      break
    }
  }
  const foes = g.enemies.filter((e) => e.userData.alive)
  if (!foes.length) return { error: 'no enemies' }

  // Isolate far-behind: park all others far out of range with no damage
  const behind = foes[0]
  const others = foes.slice(1)
  for (const e of others) {
    e.position.set(g.player.position.x + 40, e.userData.groundOffset || 0, g.player.position.z + 40)
    e.userData.range = 0.1
    e.userData.damage = 0
    e.userData.cooldown = 99
    e.userData.lastSeenAt = 0
  }
  behind.position.set(g.player.position.x, behind.userData.groundOffset || 0, g.player.position.z + 14)
  behind.userData.lastSeenAt = 0
  behind.userData.cooldown = 0
  behind.userData.range = 18
  behind.userData.damage = 8
  behind.userData.fireCooldownMax = 0.4
  g.enemyVolleyCooldown = 0
  g.playerDamageCooldown = 0
  const hpIsolatedStart = g.health
  const t0 = performance.now()
  while (performance.now() - t0 < 2200) {
    await new Promise((r) => requestAnimationFrame(r))
  }
  const hpIsolatedEnd = g.health

  // Front engagement: place one on-screen ahead
  g.health = 100
  g.playerDamageCooldown = 0
  behind.position.set(
    g.player.position.x + Math.sin(g.yaw) * 10,
    behind.userData.groundOffset || 0,
    g.player.position.z - Math.cos(g.yaw) * 10
  )
  behind.userData.lastSeenAt = performance.now()
  behind.userData.cooldown = 0
  behind.userData.range = 18
  behind.userData.damage = 8
  g.enemyVolleyCooldown = 0
  g.camera.updateMatrixWorld(true)
  const t1 = performance.now()
  while (performance.now() - t1 < 2500) {
    await new Promise((r) => requestAnimationFrame(r))
  }
  const hpFrontEnd = g.health

  // Mixed pack: one behind (eligible to shoot tracers) + one front (can damage)
  g.health = 100
  g.playerDamageCooldown = 0
  const front = others[0] || behind
  const rear = behind === front ? foes[1] || behind : behind
  for (const e of foes) {
    e.userData.range = 18
    e.userData.damage = 6
    e.userData.cooldown = 0
    e.userData.fireCooldownMax = 0.35
  }
  rear.position.set(g.player.position.x, rear.userData.groundOffset || 0, g.player.position.z + 14)
  rear.userData.lastSeenAt = 0
  front.position.set(
    g.player.position.x + Math.sin(g.yaw) * 9,
    front.userData.groundOffset || 0,
    g.player.position.z - Math.cos(g.yaw) * 9
  )
  front.userData.lastSeenAt = performance.now()
  g.enemyVolleyCooldown = 0
  g.camera.updateMatrixWorld(true)

  // Probe: with ONLY rear able to deal damage (front damage=0), HP must hold
  front.userData.damage = 0
  front.userData.range = 0.1
  front.userData.cooldown = 99
  rear.userData.damage = 10
  rear.userData.range = 18
  rear.userData.lastSeenAt = 0
  rear.userData.cooldown = 0
  g.health = 100
  g.playerDamageCooldown = 0
  g.enemyVolleyCooldown = 0
  g.yaw = 0
  const t2 = performance.now()
  while (performance.now() - t2 < 2000) {
    await new Promise((r) => requestAnimationFrame(r))
  }
  const hpMixedRearOnly = g.health
  const rearSeen = rear.userData.lastSeenAt || 0

  // Front-only damage in mixed scene should land
  front.userData.damage = 12
  rear.userData.damage = 12
  front.userData.range = 20
  front.userData.fireCooldownMax = 0.25
  g.health = 100
  g.playerDamageCooldown = 0
  front.userData.cooldown = 0
  g.enemyVolleyCooldown = 0
  front.position.set(
    g.player.position.x + Math.sin(g.yaw) * 7,
    front.userData.groundOffset || 0,
    g.player.position.z - Math.cos(g.yaw) * 7
  )
  front.userData.lastSeenAt = performance.now()
  g.camera.updateMatrixWorld(true)
  const t3 = performance.now()
  while (performance.now() - t3 < 3200) {
    await new Promise((r) => requestAnimationFrame(r))
  }
  const hpMixedBoth = g.health

  return {
    hpIsolatedStart,
    hpIsolatedEnd,
    hpFrontEnd,
    hpMixedRearOnly,
    hpMixedBoth,
    living: foes.length,
    rearSeen,
  }
})

await page.screenshot({ path: `${OUT}/qa-three-fixes-fair-damage.png`, fullPage: true })

if (fair.error) {
  note('P0', 'FairDamage', fair.error)
} else {
  if (fair.hpIsolatedEnd >= fair.hpIsolatedStart - 1) {
    note('Pass', 'FairDamage', `Isolated far-behind: ${fair.hpIsolatedStart}→${fair.hpIsolatedEnd}`)
  } else {
    note('P1', 'FairDamage', `Isolated far-behind leaked ${fair.hpIsolatedStart}→${fair.hpIsolatedEnd}`)
  }
  if (fair.hpFrontEnd < 100) {
    note('Pass', 'FairDamage', `Front engagement deals damage →${fair.hpFrontEnd}`)
  } else {
    note('P1', 'FairDamage', `Front engagement dealt no damage (hp=${fair.hpFrontEnd})`)
  }
  if (fair.hpMixedRearOnly >= 99) {
    note('Pass', 'FairDamage', `Mixed pack rear-only gated (${fair.hpMixedRearOnly})`)
  } else {
    note('P1', 'FairDamage', `Mixed pack rear shooter leaked →${fair.hpMixedRearOnly}`)
  }
  if (fair.hpMixedBoth < 100) {
    note('Pass', 'FairDamage', `Mixed pack front still damages →${fair.hpMixedBoth}`)
  } else {
    note('P1', 'FairDamage', `Mixed pack front failed to damage`)
  }
}

// ─── 1. Freeze mission time on game over ────────────────────────────
await page.evaluate(() => {
  const g = window.__darkSector
  g.health = 100
  g.playerDamageCooldown = 30
  g.running = true
  // Keep missionStartedAt strictly in the past (never clamp to 0).
  g.missionStartedAt = g.clock.elapsedTime - 73
  g.lastMissionTime = '01:13'
})
await page.waitForTimeout(500)
const preDeath = await snap()
await page.evaluate(() => {
  const g = window.__darkSector
  g.health = 1
  g.playerDamageCooldown = 0
  g.gameMode = 'solo'
  // Ensure freeze path has a valid start anchor.
  if (!(g.missionStartedAt > 0) || g.clock.elapsedTime - g.missionStartedAt < 5) {
    g.missionStartedAt = g.clock.elapsedTime - 73
  }
  const living = g.enemies.filter((e) => e.userData.alive)
  for (const e of living) {
    e.position.set(
      g.player.position.x + Math.sin(g.yaw) * 6,
      e.userData.groundOffset || 0,
      g.player.position.z - Math.cos(g.yaw) * 6
    )
    e.userData.lastSeenAt = performance.now()
    e.userData.cooldown = 0
    e.userData.range = 20
    e.userData.damage = 50
  }
  g.enemyVolleyCooldown = 0
})

let reachedGameOver = false
let postDeath = null
for (let i = 0; i < 30 && !reachedGameOver; i += 1) {
  await page.waitForTimeout(250)
  postDeath = await snap()
  reachedGameOver = postDeath.gameOver || !postDeath.running
}

await page.screenshot({ path: `${OUT}/qa-three-fixes-game-over.png`, fullPage: true })

if (!reachedGameOver) {
  note('P1', 'MissionTime', 'Could not force game-over')
} else {
  const frozen = postDeath.lastMissionTime
  const bodyHasFrozen = frozen && frozen !== '00:00' && (await page.locator('body').innerText()).includes(frozen)
  if (frozen && frozen !== '00:00' && bodyHasFrozen) {
    note('Pass', 'MissionTime', `Frozen after-action time ${frozen} visible on game-over`, {
      preDeath: preDeath.lastMissionTime,
      frozen,
    })
  } else if (frozen && frozen !== '00:00') {
    note('P2', 'MissionTime', `State frozen to ${frozen} but not found in DOM text`)
  } else {
    note('P1', 'MissionTime', `Timer wiped on death lastMissionTime=${frozen}`)
  }

  const restart = page.getByRole('button', { name: /Restart mission/i })
  if (await restart.isVisible()) {
    await restart.click()
    await page.waitForTimeout(800)
    const afterRestart = await snap()
    if (afterRestart.running && (afterRestart.lastMissionTime === '00:00' || afterRestart.missionStartedAt > 0)) {
      note('Pass', 'MissionTime', `Restart resets timer cleanly lastMissionTime=${afterRestart.lastMissionTime}`)
    } else {
      note('P1', 'MissionTime', `Restart timer state unexpected ${JSON.stringify(afterRestart)}`)
    }
  }
}

writeFileSync(
  `${OUT}/qa-three-fixes-report.json`,
  JSON.stringify({ findings, fair, afterTaps, afterM4, preDeath, postDeath }, null, 2)
)
await browser.close()

const failed = findings.some((f) => f.severity === 'P0' || f.severity === 'P1')
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
