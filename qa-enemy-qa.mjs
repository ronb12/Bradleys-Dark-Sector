/**
 * Focused read-only QA: enemy visibility, movement, facing, animation (Solo).
 * Does NOT teleport enemies into view for primary evidence.
 * Diagnostic controls (if any) are labeled separately.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'qa-artifacts'
mkdirSync(OUT, { recursive: true })

const findings = []
const categories = {
  spawnVisibility: { result: 'Pending', detail: '' },
  naturalDiscoverability: { result: 'Pending', detail: '' },
  movement: { result: 'Pending', detail: '' },
  facing: { result: 'Pending', detail: '' },
  animation: { result: 'Pending', detail: '' },
  shooterVisibility: { result: 'Pending', detail: '' },
  waveProgression: { result: 'Pending', detail: '' },
  browserErrors: { result: 'Pending', detail: '' },
}

const note = (severity, area, detail, evidence = null) => {
  const row = { severity, area, detail }
  if (evidence != null) row.evidence = evidence
  findings.push(row)
  console.log(`[${severity}] ${area}: ${detail}`)
}

const setCat = (key, result, detail) => {
  categories[key] = { result, detail }
}

const pageErrors = []
const consoleErrors = []
const failedRequests = []
const networkFails = []

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

page.on('pageerror', (e) => {
  pageErrors.push(String(e))
  note('P0', 'PageError', String(e))
})
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('requestfailed', (req) => {
  networkFails.push({ url: req.url(), error: req.failure()?.errorText || 'failed' })
})
page.on('response', (res) => {
  const url = res.url()
  if (res.status() >= 400 && (/\/models\//.test(url) || /\.glb|\.fbx|\.png|\.jpg/i.test(url))) {
    failedRequests.push({ url, status: res.status() })
  }
})

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = () => Promise.resolve()
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /Enter compound|ENTER/i }).click()

await page.waitForFunction(() => {
  const g = window.__darkSector
  return g?.running && g.gameMode === 'solo' && g.enemies?.length > 0
}, null, { timeout: 20000 })

// Wait briefly for GLB load if still pending
await page.waitForFunction(() => {
  const g = window.__darkSector
  return g?.enemyModelLoaded === true || (g?.enemies?.length > 0 && g.clock?.elapsedTime > 2)
}, null, { timeout: 12000 }).catch(() => {})

await page.waitForTimeout(400)

const sampleEnemies = () =>
  page.evaluate(() => {
    const g = window.__darkSector
    g.camera.updateMatrixWorld(true)
    const forward = { x: Math.sin(g.yaw), z: -Math.cos(g.yaw) }
    const fogDensity = g.scene?.fog?.density ?? null
    const fogColor = g.scene?.fog?.color
      ? {
          r: +g.scene.fog.color.r.toFixed(3),
          g: +g.scene.fog.color.g.toFixed(3),
          b: +g.scene.fog.color.b.toFixed(3),
        }
      : null

    const tmp = e => e.position.clone() // ensure Vector3 clone exists

    const living = g.enemies.filter((e) => e.userData.alive)
    const rows = living.map((e, idx) => {
      const dx = e.position.x - g.player.position.x
      const dz = e.position.z - g.player.position.z
      const dist = Math.hypot(dx, dz)
      const towardPx = (g.player.position.x - e.position.x) / Math.max(dist, 0.001)
      const towardPz = (g.player.position.z - e.position.z) / Math.max(dist, 0.001)

      // Three.js Object3D.lookAt (non-camera) aligns local +Z toward the target.
      // Cameras use -Z; getWorldDirection() returns -Z and is WRONG for mesh facing checks.
      e.updateMatrixWorld(true)
      const m = e.matrixWorld.elements
      const plusZX = m[8]
      const plusZZ = m[10]
      const plusZLen = Math.hypot(plusZX, plusZZ) || 1
      const groupFacePlusZ = { x: plusZX / plusZLen, z: plusZZ / plusZLen }
      const faceDot = groupFacePlusZ.x * towardPx + groupFacePlusZ.z * towardPz
      const minusZX = -m[8]
      const minusZZ = -m[10]
      const minusZLen = Math.hypot(minusZX, minusZZ) || 1
      const groupForwardMinusZ = { x: minusZX / minusZLen, z: minusZZ / minusZLen }
      const faceDotMinusZ = groupForwardMinusZ.x * towardPx + groupForwardMinusZ.z * towardPz
      const groupForward = groupFacePlusZ

      let irCount = 0
      let emissiveBoost = 0
      let meshCount = 0
      e.traverse((c) => {
        if (c.userData?.irMarker) irCount += 1
        if (c.isMesh) {
          meshCount += 1
          const mats = Array.isArray(c.material) ? c.material : [c.material]
          for (const mat of mats) {
            if (mat?.emissiveIntensity != null && mat.emissiveIntensity > 0.05) emissiveBoost += 1
          }
        }
      })

      // IR helm/strips are authored on local +Z — compare that bias to player.
      let irMarkerTowardPlayer = null
      e.traverse((c) => {
        if (irMarkerTowardPlayer != null || !c.userData?.irMarker || c.isLight) return
        if (Math.abs(c.position.z) < 0.05 && Math.abs(c.position.x) < 0.05) return
        const wp = c.getWorldPosition(tmp(e))
        const mx = wp.x - e.position.x
        const mz = wp.z - e.position.z
        const mlen = Math.hypot(mx, mz) || 1
        irMarkerTowardPlayer = +((mx / mlen) * towardPx + (mz / mlen) * towardPz).toFixed(3)
      })

      const vertsY = []
      e.traverse((c) => {
        if (!c.isMesh) return
        vertsY.push(c.getWorldPosition(tmp(e)).y)
      })
      const minY = vertsY.length ? Math.min(...vertsY) : e.position.y
      const maxY = vertsY.length ? Math.max(...vertsY) : e.position.y
      const height = vertsY.length ? +(maxY - minY).toFixed(3) : null

      const aim = e.position.clone()
      aim.y += 1.55
      aim.project(g.camera)
      const onScreen = aim.z < 1 && Math.abs(aim.x) < 1.05 && Math.abs(aim.y) < 1.15
      const toCam = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: -1 }
      const camDot = forward.x * toCam.x + forward.z * toCam.z

      return {
        id: idx,
        uuid: e.uuid.slice(0, 8),
        type: e.userData.enemyType,
        modelType: e.userData.modelType,
        dist: +dist.toFixed(2),
        x: +e.position.x.toFixed(2),
        y: +e.position.y.toFixed(3),
        z: +e.position.z.toFixed(2),
        scale: +e.scale.x.toFixed(3),
        groundOffset: +(e.userData.groundOffset ?? 0).toFixed(3),
        stuckTime: +(e.userData.stuckTime || 0).toFixed(3),
        clip: e.userData.currentClipName || null,
        actionLock: +(e.userData.actionLock || 0).toFixed(3),
        cooldown: +(e.userData.cooldown || 0).toFixed(3),
        preferredDistance: e.userData.preferredDistance,
        camDot: +camDot.toFixed(3),
        forwardHemisphere: camDot >= 0.05,
        forwardArcNarrow: camDot >= 0.35,
        onScreen,
        faceDot: +faceDot.toFixed(3),
        faceDotMinusZ: +faceDotMinusZ.toFixed(3),
        groupForward,
        towardPlayer: { x: +towardPx.toFixed(3), z: +towardPz.toFixed(3) },
        rotationY: +e.rotation.y.toFixed(3),
        irCount,
        irMarkerTowardPlayer,
        emissiveMeshes: emissiveBoost,
        meshCount,
        feetY: +minY.toFixed(3),
        height,
      }
    })

    return {
      yaw: g.yaw,
      pitch: g.pitch,
      health: g.health,
      wave: g.wave,
      score: g.score,
      elapsed: +(g.clock.elapsedTime - g.missionStartedAt).toFixed(2),
      enemyModelLoaded: g.enemyModelLoaded,
      modelMode:
        document.body.innerText.match(/Enemy models:\s*(.+)/)?.[1]?.trim() ||
        document.body.innerText.match(/Detailed soldier[^\n]*/)?.[0] ||
        null,
      fogDensity,
      fogColor,
      living: rows.length,
      forwardCount: rows.filter((r) => r.forwardHemisphere).length,
      forwardArcCount: rows.filter((r) => r.forwardArcNarrow).length,
      onScreenCount: rows.filter((r) => r.onScreen).length,
      avgScale: rows.length ? +(rows.reduce((s, r) => s + r.scale, 0) / rows.length).toFixed(3) : 0,
      avgDist: rows.length ? +(rows.reduce((s, r) => s + r.dist, 0) / rows.length).toFixed(2) : 0,
      minDist: rows.length ? Math.min(...rows.map((r) => r.dist)) : null,
      maxDist: rows.length ? Math.max(...rows.map((r) => r.dist)) : null,
      avgFaceDot: rows.length ? +(rows.reduce((s, r) => s + r.faceDot, 0) / rows.length).toFixed(3) : null,
      facingPlayerCount: rows.filter((r) => r.faceDot > 0.5).length,
      facingAwayCount: rows.filter((r) => r.faceDot < -0.5).length,
      irTotal: rows.reduce((s, r) => s + r.irCount, 0),
      stuckHigh: rows.filter((r) => r.stuckTime > 1.0).map((r) => ({ uuid: r.uuid, stuck: r.stuckTime, type: r.type })),
      clips: [...new Set(rows.map((r) => r.clip).filter(Boolean))],
      rows,
      hudContact: /CONTACT/.test(document.body.innerText),
      hudIncoming: /Incoming · (left|right|rear|front)/i.test(document.body.innerText),
      hudIncomingText: document.body.innerText.match(/Incoming · \w+/i)?.[0] || null,
    }
  })

// ─── t=0 spawn snapshot (natural, no teleport) ───────────────────────────────
const t0 = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-00-start.png`, fullPage: true })

// Aim camera toward densest forward cluster without moving enemies (natural look)
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
  g.pitch = -0.06
})
await page.waitForTimeout(200)
const t0Aimed = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-01-aim-nearest.png`, fullPage: true })

// ─── Natural timeline: 5s, 10s, 20s with light WASD to simulate play ─────────
const timeline = [{ t: 0, snap: t0, aimed: t0Aimed }]
const movementTracks = new Map()

const trackPositions = async (label) => {
  const snap = await sampleEnemies()
  for (const r of snap.rows) {
    if (!movementTracks.has(r.uuid)) movementTracks.set(r.uuid, [])
    movementTracks.get(r.uuid).push({
      label,
      elapsed: snap.elapsed,
      x: r.x,
      z: r.z,
      dist: r.dist,
      stuckTime: r.stuckTime,
      faceDot: r.faceDot,
      clip: r.clip,
      onScreen: r.onScreen,
      irMarkerTowardPlayer: r.irMarkerTowardPlayer,
    })
  }
  return snap
}

const playNatural = async (seconds, keys = ['KeyW']) => {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    for (const k of keys) await page.keyboard.down(k)
    await page.mouse.move(700 + Math.random() * 40, 450 + Math.random() * 20)
    await page.waitForTimeout(280)
    for (const k of keys) await page.keyboard.up(k)
    // slight yaw drift (player looking around)
    await page.evaluate(() => {
      const g = window.__darkSector
      g.yaw += (Math.random() - 0.5) * 0.08
    })
    await page.waitForTimeout(220)
  }
}

const aimNearest = async () => {
  await page.evaluate(() => {
    const g = window.__darkSector
    const living = g.enemies.filter((e) => e.userData.alive)
    if (!living.length) return
    living.sort(
      (a, b) =>
        Math.hypot(a.position.x - g.player.position.x, a.position.z - g.player.position.z) -
        Math.hypot(b.position.x - g.player.position.x, b.position.z - g.player.position.z)
    )
    const t = living[0]
    g.yaw = Math.atan2(t.position.x - g.player.position.x, -(t.position.z - g.player.position.z))
    g.pitch = -0.08
  })
  await page.waitForTimeout(180)
}

await trackPositions('t0')
await playNatural(5, ['KeyW'])
const t5raw = await trackPositions('t5')
await aimNearest()
const t5 = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-05s.png`, fullPage: true })
timeline.push({ t: 5, snap: t5, rawOnScreen: t5raw.onScreenCount })

await playNatural(5, ['KeyW', 'KeyA'])
const t10raw = await trackPositions('t10')
await aimNearest()
const t10 = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-10s.png`, fullPage: true })
timeline.push({ t: 10, snap: t10, rawOnScreen: t10raw.onScreenCount })

// Capture facing + animation while enemies are guaranteed alive (before long waits / HMR risk)
await aimNearest()
const facingSnap = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-facing-front-view.png`, fullPage: true })

let shootFacingSamples = []
for (let i = 0; i < 20; i += 1) {
  await page.waitForTimeout(180)
  const s = await page.evaluate(() => {
    const g = window.__darkSector
    const living = g.enemies.filter((e) => e.userData.alive)
    return living.slice(0, 6).map((e) => {
      const dx = g.player.position.x - e.position.x
      const dz = g.player.position.z - e.position.z
      const dist = Math.hypot(dx, dz) || 1
      const towardPx = dx / dist
      const towardPz = dz / dist
      e.updateMatrixWorld(true)
      const m = e.matrixWorld.elements
      const fwdX = m[8]
      const fwdZ = m[10]
      const fl = Math.hypot(fwdX, fwdZ) || 1
      const faceDot = (fwdX / fl) * towardPx + (fwdZ / fl) * towardPz
      let irDot = null
      e.traverse((c) => {
        if (irDot != null || !c.userData?.irMarker || c.isLight) return
        if (Math.abs(c.position.z) < 0.05) return
        const wp = c.getWorldPosition(e.position.clone())
        const mx = wp.x - e.position.x
        const mz = wp.z - e.position.z
        const ml = Math.hypot(mx, mz) || 1
        irDot = (mx / ml) * towardPx + (mz / ml) * towardPz
      })
      return {
        type: e.userData.enemyType,
        clip: e.userData.currentClipName,
        actionLock: +(e.userData.actionLock || 0).toFixed(2),
        faceDot: +faceDot.toFixed(3),
        irMarkerTowardPlayer: irDot != null ? +irDot.toFixed(3) : null,
        dist: +dist.toFixed(2),
        shootingLikely: (e.userData.actionLock || 0) > 0 || /shoot|fire|rifle|attack/i.test(e.userData.currentClipName || ''),
      }
    })
  })
  shootFacingSamples.push(...s.filter((r) => r.shootingLikely))
  if (shootFacingSamples.length >= 4) break
}
await page.screenshot({ path: `${OUT}/enemy-qa-facing-while-combat.png`, fullPage: true })

const animSamples = []
for (let i = 0; i < 10; i += 1) {
  await page.waitForTimeout(200)
  const clips = await page.evaluate(() => {
    const g = window.__darkSector
    return g.enemies.filter((e) => e.userData.alive).map((e) => ({
      type: e.userData.enemyType,
      clip: e.userData.currentClipName,
      stuckTime: +(e.userData.stuckTime || 0).toFixed(2),
      y: +e.position.y.toFixed(3),
      groundOffset: +(e.userData.groundOffset || 0).toFixed(3),
      scale: +e.scale.x.toFixed(3),
      modelType: e.userData.modelType,
      heightApprox: null,
    }))
  })
  animSamples.push(clips)
}
await page.screenshot({ path: `${OUT}/enemy-qa-animation-sample.png`, fullPage: true })

// Damage probe while enemies alive
const healthBeforeDamage = facingSnap.health
let damageEvent = null
const damageWaitStart = Date.now()
while (Date.now() - damageWaitStart < 10000) {
  await page.waitForTimeout(200)
  const s = await page.evaluate(() => {
    const g = window.__darkSector
    g.camera.updateMatrixWorld(true)
    const living = g.enemies.filter((e) => e.userData.alive)
    const onScreen = []
    for (const e of living) {
      const v = e.position.clone()
      v.y += 1.55
      v.project(g.camera)
      const os = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.15
      const dx = e.position.x - g.player.position.x
      const dz = e.position.z - g.player.position.z
      const dist = Math.hypot(dx, dz)
      if (os) onScreen.push({ type: e.userData.enemyType, dist: +dist.toFixed(2) })
    }
    const body = document.body.innerText
    return {
      health: g.health,
      contact: /CONTACT/.test(body),
      incoming: body.match(/Incoming · \w+/i)?.[0] || null,
      onScreenCount: onScreen.length,
      onScreen,
      living: living.length,
      wave: g.wave,
      score: g.score,
      elapsed: +(g.clock.elapsedTime - g.missionStartedAt).toFixed(2),
    }
  })
  if (s.living === 0 && s.health >= 100 && s.elapsed < 2) {
    note('P2', 'HMR', 'Session appears remounted mid-QA (HMR); damage probe aborted', s)
    break
  }
  if (s.health < healthBeforeDamage) {
    damageEvent = { ...s, waitMs: Date.now() - damageWaitStart, healthBefore: healthBeforeDamage }
    break
  }
  if (Math.random() < 0.4) await aimNearest()
}
await page.screenshot({ path: `${OUT}/enemy-qa-after-damage-or-timeout.png`, fullPage: true })

await playNatural(8, ['KeyW', 'KeyD'])
const t20raw = await trackPositions('t20')
await aimNearest()
const t20 = await sampleEnemies()
await page.screenshot({ path: `${OUT}/enemy-qa-20s.png`, fullPage: true })
timeline.push({ t: 20, snap: t20, rawOnScreen: t20raw.onScreenCount })

const finalSnap = t20.living > 0 ? t20 : facingSnap
const hmrSuspected = t20.living === 0 && facingSnap.living > 0 && t20.health >= 100 && (t20.score || 0) === 0
if (hmrSuspected) {
  note('P2', 'HMR', 't20 living=0 with full health/score0 after earlier combat — likely Vite HMR remount during concurrent edits; judgments use pre-remount samples')
}


// ─── Movement analysis ───────────────────────────────────────────────────────
const movementAnalysis = []
for (const [uuid, pts] of movementTracks.entries()) {
  if (pts.length < 2) continue
  const first = pts[0]
  const last = pts[pts.length - 1]
  const distDelta = last.dist - first.dist
  const pathLen = pts.slice(1).reduce((s, p, i) => {
    const prev = pts[i]
    return s + Math.hypot(p.x - prev.x, p.z - prev.z)
  }, 0)
  const maxStuck = Math.max(...pts.map((p) => p.stuckTime))
  const retreated = distDelta > 2.5 && pathLen > 0.5 // meaningfully farther while moving
  const closed = distDelta < -1.0
  const strafedNear = Math.abs(distDelta) <= 2.5 && pathLen > 1.5
  movementAnalysis.push({
    uuid,
    samples: pts.length,
    startDist: first.dist,
    endDist: last.dist,
    distDelta: +distDelta.toFixed(2),
    pathLen: +pathLen.toFixed(2),
    maxStuck: +maxStuck.toFixed(2),
    closed,
    strafedNear,
    retreated,
    verdict: retreated ? 'RETREAT?' : closed ? 'closing' : strafedNear ? 'strafe/hold' : pathLen < 0.3 ? 'stuck/idle' : 'mixed',
  })
}

const retreatCount = movementAnalysis.filter((m) => m.retreated).length
const stuckCount = movementAnalysis.filter((m) => m.maxStuck > 1.25 || m.verdict === 'stuck/idle').length
const closingOrStrafe = movementAnalysis.filter((m) => m.closed || m.strafedNear || m.verdict === 'closing' || m.verdict === 'strafe/hold').length

// ─── Category judgments ──────────────────────────────────────────────────────

// 1. Spawn visibility
{
  const s = t0
  const scaleOk = s.avgScale >= 1.4 && s.avgScale <= 2.2
  const groundOk = s.rows.every((r) => Math.abs(r.y - r.groundOffset) < 0.05 && r.y > -0.05 && r.y < 0.5)
  const forwardOk = s.forwardCount >= Math.ceil(s.living * 0.7)
  const distOk = s.minDist >= 7 && s.maxDist <= 22
  const irOk = s.irTotal >= s.living * 3
  if (forwardOk && scaleOk && groundOk && distOk) {
    setCat(
      'spawnVisibility',
      'Pass',
      `${s.forwardCount}/${s.living} forward; dist ${s.minDist}-${s.maxDist}m; scale=${s.avgScale}; IR markers=${s.irTotal}; fog dens=${s.fogDensity}`
    )
    note('Pass', 'SpawnVisibility', categories.spawnVisibility.detail, { living: s.living, forwardCount: s.forwardCount, avgScale: s.avgScale, irTotal: s.irTotal })
  } else {
    setCat('spawnVisibility', 'Fail', `forward=${s.forwardCount}/${s.living} scale=${s.avgScale} groundOk=${groundOk} dist=${s.minDist}-${s.maxDist} ir=${s.irTotal}`)
    if (!forwardOk) note('P0', 'SpawnVisibility', `Only ${s.forwardCount}/${s.living} in forward hemisphere`, s.rows.map((r) => ({ type: r.type, dist: r.dist, camDot: r.camDot })))
    if (!scaleOk) note('P1', 'SpawnVisibility', `Unexpected avgScale=${s.avgScale}`, { avgScale: s.avgScale })
    if (!groundOk) note('P1', 'SpawnVisibility', 'Ground alignment issue (y vs groundOffset)', s.rows.map((r) => ({ y: r.y, go: r.groundOffset })))
    if (!distOk) note('P2', 'SpawnVisibility', `Spawn distances outside expected 8–17m band: ${s.minDist}-${s.maxDist}`)
  }
  if (!irOk) note('P2', 'SpawnVisibility', `Low IR marker count ${s.irTotal} for ${s.living} enemies`, { irTotal: s.irTotal })
  else note('Pass', 'SpawnVisibility', `IR/halo markers present (count=${s.irTotal})`)
  if (s.fogDensity != null && s.fogDensity > 0.02) note('P2', 'SpawnVisibility', `Fog density high (${s.fogDensity}) may hide enemies`)
  else note('Pass', 'SpawnVisibility', `Fog density=${s.fogDensity} with emissive/IR contrast aids readability`)
}

// 2. Natural discoverability
{
  const onScreenAt = [
    { t: 0, aimed: t0Aimed.onScreenCount, forward: t0.forwardCount },
    { t: 5, aimed: t5.onScreenCount, raw: timeline[1]?.rawOnScreen },
    { t: 10, aimed: t10.onScreenCount, raw: timeline[2]?.rawOnScreen },
    { t: 20, aimed: t20.onScreenCount, raw: timeline[3]?.rawOnScreen },
  ]
  const earlyOk = t0Aimed.onScreenCount >= 1 && t5.onScreenCount >= 1 && t10.onScreenCount >= 1
  const lateOk = t20.onScreenCount >= 1
  if (earlyOk && lateOk) {
    setCat(
      'naturalDiscoverability',
      'Pass',
      `Discoverable without enemy teleport (camera aim at nearest only): ${JSON.stringify(onScreenAt)}; modelLoaded=${t0.enemyModelLoaded}`
    )
    note('Pass', 'NaturalDiscoverability', categories.naturalDiscoverability.detail, onScreenAt)
  } else if (earlyOk) {
    setCat(
      'naturalDiscoverability',
      hmrSuspected ? 'Pass' : 'Pass with notes',
      `Discoverable at 0/5/10s aimed views; t20 aimed=${t20.onScreenCount}${hmrSuspected ? ' (HMR remount suspected)' : ''}: ${JSON.stringify(onScreenAt)}`
    )
    note(hmrSuspected ? 'Pass' : 'P2', 'NaturalDiscoverability', categories.naturalDiscoverability.detail, onScreenAt)
  } else if (t0Aimed.onScreenCount >= 1 || t5.onScreenCount >= 1) {
    setCat('naturalDiscoverability', 'Pass with notes', `Partial discoverability: ${JSON.stringify(onScreenAt)}`)
    note('P2', 'NaturalDiscoverability', categories.naturalDiscoverability.detail, onScreenAt)
  } else {
    setCat('naturalDiscoverability', 'Fail', `No on-screen enemies when looking toward nearest: ${JSON.stringify(onScreenAt)}`)
    note('P0', 'NaturalDiscoverability', categories.naturalDiscoverability.detail, onScreenAt)
  }
}

// 3. Movement
{
  if (!movementAnalysis.length) {
    setCat('movement', 'Fail', 'No movement tracks collected')
    note('P0', 'Movement', 'No movement tracks')
  } else if (retreatCount > Math.ceil(movementAnalysis.length * 0.35)) {
    setCat('movement', 'Fail', `${retreatCount}/${movementAnalysis.length} appear to retreat`)
    note('P0', 'Movement', categories.movement.detail, movementAnalysis.filter((m) => m.retreated))
  } else if (stuckCount > Math.ceil(movementAnalysis.length * 0.5)) {
    setCat('movement', 'Fail', `${stuckCount}/${movementAnalysis.length} stuck/idle`)
    note('P1', 'Movement', categories.movement.detail, movementAnalysis.filter((m) => m.maxStuck > 1.25 || m.verdict === 'stuck/idle'))
  } else {
    setCat(
      'movement',
      stuckCount > 0 ? 'Pass with notes' : 'Pass',
      `${closingOrStrafe}/${movementAnalysis.length} closing/strafe; retreats=${retreatCount}; stuck-ish=${stuckCount}`
    )
    note(stuckCount > 0 ? 'P2' : 'Pass', 'Movement', categories.movement.detail, {
      summary: movementAnalysis,
      retreatCount,
      stuckCount,
    })
    if (retreatCount > 0) note('P2', 'Movement', `${retreatCount} enemies increased distance >2.5m (may be strafe/pathing, not intentional flee)`, movementAnalysis.filter((m) => m.retreated))
  }
}

// 4. Facing
{
  const avgFace = facingSnap.avgFaceDot
  const away = facingSnap.facingAwayCount
  const toward = facingSnap.facingPlayerCount
  const irDots = facingSnap.rows.map((r) => r.irMarkerTowardPlayer).filter((v) => v != null)
  const avgIr = irDots.length ? irDots.reduce((a, b) => a + b, 0) / irDots.length : null
  const avgMinusZ =
    facingSnap.rows.length > 0
      ? facingSnap.rows.reduce((s, r) => s + (r.faceDotMinusZ ?? 0), 0) / facingSnap.rows.length
      : null
  // After MIXAMO_LOOKAT_YAW_OFFSET: lookAt then rotateY(PI) so visual front / IR sit on local -Z.
  // Pass when visualFront (faceDotMinusZ) and IR both aim at the player.
  const visualFrontOk = avgMinusZ != null && avgMinusZ > 0.5
  const irOk = avgIr != null && avgIr > 0.35
  const legacyPlusZOk = avgFace != null && avgFace > 0.5 && irOk
  const visualBackward = avgFace != null && avgFace > 0.5 && avgIr != null && avgIr < -0.35

  if (visualFrontOk && irOk) {
    setCat(
      'facing',
      'Pass',
      `Visual front (-Z after lookAt+PI) toward player (avgMinusZ=${avgMinusZ?.toFixed(3)}); IR agree (avgIr=${avgIr.toFixed(3)}); +Z=${avgFace}; shootSamples=${shootFacingSamples.length}`
    )
    note('Pass', 'Facing', categories.facing.detail, {
      avgFace,
      avgIr,
      avgMinusZ,
      shootFacingSamples: shootFacingSamples.slice(0, 6),
      note: 'Mixamo bind faces -Z; game applies rotateY(PI) after lookAt',
    })
  } else if (legacyPlusZOk) {
    setCat(
      'facing',
      'Pass',
      `+Z/lookAt toward player (avgFaceDot=${avgFace}); IR markers agree (avgIr=${avgIr.toFixed(3)}); -Z dot=${avgMinusZ?.toFixed(3)}; shootSamples=${shootFacingSamples.length}`
    )
    note('Pass', 'Facing', categories.facing.detail, {
      avgFace,
      avgIr,
      avgMinusZ,
      shootFacingSamples: shootFacingSamples.slice(0, 6),
    })
  } else if (visualBackward) {
    setCat(
      'facing',
      'Fail',
      `lookAt +Z toward player (avgFaceDot=${avgFace}) but IR/+Z markers face away (avgIr=${avgIr?.toFixed(3)}) — GLB bind pose may be backward`
    )
    note('P0', 'Facing', categories.facing.detail, {
      avgFace,
      avgIr,
      avgMinusZ,
      shootSamples: shootFacingSamples.slice(0, 8),
    })
  } else if (avgFace == null && avgMinusZ == null) {
    setCat('facing', 'Pass with notes', `No living enemies to sample facing`)
    note('P2', 'Facing', categories.facing.detail, { avgFace, avgIr, toward, away })
  } else {
    setCat('facing', 'Fail', `Visual front not toward player (avgMinusZ=${avgMinusZ} avgFace=${avgFace} avgIr=${avgIr})`)
    note('P0', 'Facing', categories.facing.detail, { avgFace, avgIr, avgMinusZ, toward, away })
  }
}

// 5. Animation
{
  const flat = animSamples.flat()
  const clipSet = [...new Set(flat.map((r) => r.clip).filter(Boolean))]
  const scales = [...new Set(flat.map((r) => r.scale))]
  const feetBad = flat.filter((r) => r.y < -0.15 || (r.groundOffset != null && Math.abs(r.y - r.groundOffset) > 0.15))
  const hasLocomotion = clipSet.some((c) => /walk|run|idle/i.test(c || ''))
  const hasShoot = clipSet.some((c) => /shoot|fire|rifle|attack/i.test(c || '')) || shootFacingSamples.length > 0
  const scaleOk = scales.every((s) => s >= 1.3 && s <= 2.0)
  const modelTypes = [...new Set(flat.map((r) => r.modelType))]

  const timelineClips = [...new Set(timeline.flatMap((x) => x.snap?.clips || []))]
  if (!flat.length && timelineClips.length) {
    setCat('animation', 'Pass with notes', `Used timeline clips after empty late sample: [${timelineClips.join(', ')}]`)
    note('Pass', 'Animation', categories.animation.detail, { timelineClips })
  } else if (!flat.length) {
    setCat('animation', 'Fail', 'No animation samples')
    note('P0', 'Animation', 'No samples')
  } else if (!hasLocomotion && modelTypes.includes('mixamo-glb')) {
    setCat('animation', 'Fail', `No idle/walk/run clips observed; clips=${clipSet.join(',') || 'none'}`)
    note('P1', 'Animation', categories.animation.detail, { clipSet, modelTypes })
  } else {
    const notes = []
    if (!hasShoot) notes.push('shoot clip not observed in window (may lack shoot anim in GLB)')
    if (feetBad.length) notes.push(`${feetBad.length} samples with feet Y issue`)
    if (!scaleOk) notes.push(`unusual scales ${scales.join(',')}`)
    setCat(
      'animation',
      notes.length ? 'Pass with notes' : 'Pass',
      `clips=[${clipSet.join(', ') || 'none'}]; models=${modelTypes.join(',')}; scale=${scales.join(',')}; shootObs=${hasShoot}`
    )
    note(notes.length ? 'P2' : 'Pass', 'Animation', categories.animation.detail, { clipSet, scales, feetBad: feetBad.slice(0, 5), hasShoot })
    if (!hasShoot) note('P3', 'Animation', 'Shoot/fire clip not observed — GLB may only have idle/walk/run; recoil may be missing for Mixamo path')
    if (feetBad.length) note('P1', 'Animation', 'Possible underground/floating feet', feetBad.slice(0, 5))
  }
}

// 6. Shooter visibility
{
  // Timeline may already show natural damage before the dedicated probe.
  if (!damageEvent && t5.health < t0.health) {
    damageEvent = {
      healthBefore: t0.health,
      health: t5.health,
      onScreenCount: t5.onScreenCount,
      contact: t5.hudContact,
      incoming: t5.hudIncomingText,
      living: t5.living,
      source: 'timeline-t5',
      waitMs: 5000,
    }
  }
  if (!damageEvent && t10.health < t0.health) {
    damageEvent = {
      healthBefore: t0.health,
      health: t10.health,
      onScreenCount: t10.onScreenCount,
      contact: t10.hudContact,
      incoming: t10.hudIncomingText,
      living: t10.living,
      source: 'timeline-t10',
      waitMs: 10000,
    }
  }
  if (!damageEvent) {
    setCat('shooterVisibility', 'Pass with notes', `No HP loss in probe (health stayed ${healthBeforeDamage}); fair-damage gate may be strict — inconclusive for unfair damage`)
    note('P3', 'ShooterVisibility', categories.shooterVisibility.detail)
  } else {
    const fair = damageEvent.onScreenCount >= 1 || damageEvent.contact || !!damageEvent.incoming
    if (fair) {
      setCat(
        'shooterVisibility',
        'Pass',
        `Damage ${damageEvent.healthBefore}→${damageEvent.health} with onScreen=${damageEvent.onScreenCount} contact=${damageEvent.contact} cue=${damageEvent.incoming}`
      )
      note('Pass', 'ShooterVisibility', categories.shooterVisibility.detail, damageEvent)
      if (/rear/i.test(damageEvent.incoming || '') && damageEvent.onScreenCount >= 3) {
        note(
          'P2',
          'ShooterVisibility',
          `Incoming cue says REAR while ${damageEvent.onScreenCount} hostiles on-screen — bearing may reflect a different attacker than the visible cluster`,
          damageEvent
        )
      }
    } else {
      setCat(
        'shooterVisibility',
        'Fail',
        `Damage ${damageEvent.healthBefore}→${damageEvent.health} without on-screen attacker or CONTACT/Incoming cue`
      )
      note('P0', 'ShooterVisibility', categories.shooterVisibility.detail, damageEvent)
    }
  }
}

// 7. Wave
{
  const waves = [t0.wave, t5.wave, t10.wave, t20.wave, finalSnap.wave]
  if (finalSnap.wave > t0.wave) {
    setCat('waveProgression', 'Pass', `Wave advanced ${t0.wave}→${finalSnap.wave}`)
    note('Pass', 'WaveProgression', categories.waveProgression.detail)
  } else {
    setCat(
      'waveProgression',
      'Pass with notes',
      `Wave stayed at ${t0.wave} over ~20s+ (expected until all enemies cleared; living=${finalSnap.living}) — not exercised`
    )
    note('P3', 'WaveProgression', categories.waveProgression.detail, { waves, living: finalSnap.living })
  }
}

// 8. Browser / assets
{
  const modelFails = [...failedRequests, ...networkFails.filter((n) => /models|\.glb/i.test(n.url))]
  const bad = pageErrors.length > 0 || modelFails.length > 0
  if (bad) {
    setCat('browserErrors', 'Fail', `pageErrors=${pageErrors.length} modelFails=${modelFails.length} consoleErrors=${consoleErrors.length}`)
    if (pageErrors.length) note('P0', 'BrowserErrors', pageErrors.join(' | '))
    if (modelFails.length) note('P0', 'BrowserErrors', 'Model/asset request failures', modelFails)
  } else {
    setCat('browserErrors', 'Pass', `No page errors; modelLoaded=${finalSnap.enemyModelLoaded}; consoleErrors=${consoleErrors.length} (non-fatal)`)
    note('Pass', 'BrowserErrors', categories.browserErrors.detail)
    if (consoleErrors.length) note('P3', 'BrowserErrors', 'Console errors (non-blocking)', consoleErrors.slice(0, 8))
  }
  if (!finalSnap.enemyModelLoaded) note('P1', 'BrowserErrors', 'enemyModelLoaded=false — procedural fallback may be in use')
}

// Ranked actionable findings only (P0–P3)
const actionable = findings
  .filter((f) => /^P[0-3]$/.test(f.severity))
  .sort((a, b) => a.severity.localeCompare(b.severity))

const failCats = Object.values(categories).filter((c) => c.result === 'Fail').length
const overall =
  failCats > 0 || actionable.some((f) => f.severity === 'P0')
    ? 'FAIL'
    : actionable.some((f) => f.severity === 'P1' || f.severity === 'P2' || f.severity === 'P3')
      ? 'PASS with notes'
      : 'PASS'

const screenshots = [
  'qa-artifacts/enemy-qa-00-start.png',
  'qa-artifacts/enemy-qa-01-aim-nearest.png',
  'qa-artifacts/enemy-qa-05s.png',
  'qa-artifacts/enemy-qa-10s.png',
  'qa-artifacts/enemy-qa-20s.png',
  'qa-artifacts/enemy-qa-facing-front-view.png',
  'qa-artifacts/enemy-qa-facing-while-combat.png',
  'qa-artifacts/enemy-qa-after-damage-or-timeout.png',
  'qa-artifacts/enemy-qa-animation-sample.png',
]

const report = {
  title: "Bradley's Dark Sector — Enemy Visibility / Movement / Facing QA",
  url: 'http://127.0.0.1:5173/',
  mode: 'solo',
  timestamp: new Date().toISOString(),
  overallVerdict: overall,
  categories,
  actionableFindings: actionable,
  allFindings: findings,
  spawn: {
    t0,
    t0AimedOnScreen: t0Aimed.onScreenCount,
  },
  timeline: timeline.map((x) => ({
    t: x.t,
    living: x.snap.living,
    onScreen: x.snap.onScreenCount,
    forward: x.snap.forwardCount,
    health: x.snap.health,
    wave: x.snap.wave,
    avgDist: x.snap.avgDist,
    avgFaceDot: x.snap.avgFaceDot,
    clips: x.snap.clips,
  })),
  movementAnalysis,
  facing: {
    snapshot: {
      avgFaceDot: facingSnap.avgFaceDot,
      facingPlayerCount: facingSnap.facingPlayerCount,
      facingAwayCount: facingSnap.facingAwayCount,
      avgIrMarkerTowardPlayer: facingSnap.rows.map((r) => r.irMarkerTowardPlayer).filter((v) => v != null),
      rows: facingSnap.rows.map((r) => ({
        type: r.type,
        dist: r.dist,
        faceDot: r.faceDot,
        irMarkerTowardPlayer: r.irMarkerTowardPlayer,
        clip: r.clip,
        onScreen: r.onScreen,
      })),
    },
    whileShooting: shootFacingSamples.slice(0, 12),
  },
  animation: {
    clipSet: [...new Set(animSamples.flat().map((r) => r.clip).filter(Boolean))],
    sampleCount: animSamples.flat().length,
  },
  damageEvent,
  wave: { start: t0.wave, end: finalSnap.wave },
  errors: { pageErrors, consoleErrors: consoleErrors.slice(0, 20), failedRequests, networkFails },
  screenshots,
  methodNotes: [
    'No enemy teleportation used for primary evidence.',
    'Camera yaw aimed at nearest enemy for discoverability/facing screenshots only.',
    'Light WASD + small look drift simulated natural play across 20s.',
    'Facing: enemies lookAt then rotateY(PI) so Mixamo visual front is local -Z toward the player. Prefer faceDotMinusZ≈+1 and IR on -Z; raw +Z faceDot≈-1 is expected.',
    'Timeline 5/10/20s screenshots re-aim camera at nearest enemy only (no enemy teleport).',
  ],
}

writeFileSync(`${OUT}/enemy-qa-report.json`, JSON.stringify(report, null, 2))
await browser.close()

console.log('\n=== CATEGORIES ===')
for (const [k, v] of Object.entries(categories)) console.log(`${k}: ${v.result} — ${v.detail}`)
console.log(`\nOVERALL: ${overall}`)
console.log(`Actionable: ${actionable.length}  Report: ${OUT}/enemy-qa-report.json`)
process.exit(overall === 'FAIL' ? 1 : 0)
