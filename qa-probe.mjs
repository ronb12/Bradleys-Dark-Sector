import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /ENTER COMPOUND/i }).click()
await page.waitForTimeout(1200)

const probe1 = await page.evaluate(() => {
  const g = window.__darkSector
  if (!g) return { error: 'no state' }
  return {
    running: g.running,
    enemies: g.enemies.length,
    positions: g.enemies.slice(0, 5).map((e) => ({
      name: e.userData.enemyType || e.name,
      x: +e.position.x.toFixed(2),
      z: +e.position.z.toFixed(2),
      alive: e.userData.alive,
      hp: e.userData.health,
      scale: e.scale.x,
    })),
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
    yaw: +g.yaw.toFixed(3),
    pitch: +g.pitch.toFixed(3),
  }
})

// Aim directly at first enemy and fire many shots
const aimFire = await page.evaluate(() => {
  const g = window.__darkSector
  if (!g || !g.enemies[0]) return { error: 'no enemy' }
  const enemy = g.enemies[0]
  const target = enemy.position.clone().add({ x: 0, y: 1.35, z: 0 })
  // Point camera at target
  const dx = target.x - g.player.position.x
  const dz = target.z - g.player.position.z
  const dy = target.y - (g.player.position.y + 1.95)
  const dist = Math.hypot(dx, dz)
  g.yaw = Math.atan2(dx, -dz)
  g.pitch = Math.atan2(dy, dist)
  g.camera.position.copy(g.player.position).add({ x: 0, y: 1.95, z: 0 })
  g.camera.rotation.set(g.pitch, g.yaw, 0, 'YXZ')

  // Manual ray check mirroring game logic
  const origin = g.camera.position.clone()
  // Reconstruct direction from yaw/pitch
  const dir = {
    x: Math.sin(g.yaw) * Math.cos(g.pitch),
    y: Math.sin(g.pitch),
    z: -Math.cos(g.yaw) * Math.cos(g.pitch),
  }
  const len = Math.hypot(dir.x, dir.y, dir.z)
  dir.x /= len; dir.y /= len; dir.z /= len

  const toTarget = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z }
  const along = toTarget.x * dir.x + toTarget.y * dir.y + toTarget.z * dir.z
  const closest = { x: origin.x + dir.x * along, y: origin.y + dir.y * along, z: origin.z + dir.z * along }
  const miss = Math.hypot(closest.x - target.x, closest.y - target.y, closest.z - target.z)

  // Also check camera quaternion direction used by the game
  const qDir = { x: 0, y: 0, z: -1 }
  const e = g.camera.quaternion
  // apply quaternion to (0,0,-1)
  const x = qDir.x, y = qDir.y, z = qDir.z
  const qx = e.x, qy = e.y, qz = e.z, qw = e.w
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  const camDir = {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
  const camLen = Math.hypot(camDir.x, camDir.y, camDir.z)
  camDir.x /= camLen; camDir.y /= camLen; camDir.z /= camLen
  const along2 = toTarget.x * camDir.x + toTarget.y * camDir.y + toTarget.z * camDir.z
  const closest2 = { x: origin.x + camDir.x * along2, y: origin.y + camDir.y * along2, z: origin.z + camDir.z * along2 }
  const miss2 = Math.hypot(closest2.x - target.x, closest2.y - target.y, closest2.z - target.z)

  const hpBefore = enemy.userData.health
  // Fire by synthesizing space key state through game loop is harder; call damage path via simulating shoot internals
  return {
    enemyAt: { x: +enemy.position.x.toFixed(2), z: +enemy.position.z.toFixed(2), type: enemy.userData.enemyType },
    yaw: +g.yaw.toFixed(3),
    pitch: +g.pitch.toFixed(3),
    missEuler: +miss.toFixed(4),
    missQuat: +miss2.toFixed(4),
    alongQuat: +along2.toFixed(2),
    hpBefore,
    scoreBefore: g.score,
  }
})

// Hold space while game loop runs with aimed camera
await page.keyboard.down(' ')
await page.waitForTimeout(1500)
await page.keyboard.up(' ')

const probe2 = await page.evaluate(() => {
  const g = window.__darkSector
  return {
    score: g.score,
    ammo: g.ammo,
    enemies: g.enemies.length,
    hps: g.enemies.map((e) => e.userData.health),
  }
})

// Wait and see if enemies approach
const startPos = await page.evaluate(() => window.__darkSector.enemies.map((e) => [e.position.x, e.position.z]))
await page.waitForTimeout(5000)
const endPos = await page.evaluate((starts) => {
  const g = window.__darkSector
  return {
    moved: g.enemies.map((e, i) => {
      const dx = e.position.x - starts[i][0]
      const dz = e.position.z - starts[i][1]
      return { type: e.userData.enemyType, dist: +Math.hypot(dx, dz).toFixed(2), x: +e.position.x.toFixed(2), z: +e.position.z.toFixed(2) }
    }),
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
    health: g.health,
  }
}, startPos)

console.log(JSON.stringify({ probe1, aimFire, probe2, endPos }, null, 2))
await browser.close()
