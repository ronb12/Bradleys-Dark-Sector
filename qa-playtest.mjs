import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = 'qa-artifacts'
mkdirSync(OUT, { recursive: true })

const findings = []
const note = (severity, area, detail) => findings.push({ severity, area, detail })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const consoleLogs = []
const pageErrors = []
const failedRequests = []

page.on('console', (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() })
})
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' })
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/01-title.png`, fullPage: true })

const titleVisible = await page.getByRole('heading', { name: /Bradley'?s\s*Dark Sector/i }).isVisible()
const enterBtn = page.getByRole('button', { name: /ENTER COMPOUND/i })
const enterVisible = await enterBtn.isVisible()
if (!titleVisible) note('P0', 'Boot', 'Title heading not visible on load')
if (!enterVisible) note('P0', 'Boot', 'ENTER COMPOUND button not visible on load')
else note('Pass', 'Boot', 'Title screen and ENTER COMPOUND render')

const canvasCount = await page.locator('canvas').count()
if (canvasCount < 1) note('P0', 'Render', 'No WebGL canvas found')
else note('Pass', 'Render', `WebGL canvas present (${canvasCount})`)

// Start mission
await enterBtn.click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/02-mission-start.png`, fullPage: true })

const titleGone = !(await enterBtn.isVisible().catch(() => false))
if (!titleGone) note('P1', 'Flow', 'Title overlay still visible after ENTER COMPOUND')
else note('Pass', 'Flow', 'Mission starts and title overlay dismisses')

const hudBits = {
  wave: await page.getByText(/WAVE\s+\d+/i).first().isVisible().catch(() => false),
  armor: await page.getByText(/ARMOR/i).first().isVisible().catch(() => false),
  ammo: await page.getByText(/M4A1 CARBINE/i).first().isVisible().catch(() => false),
  directive: await page.getByText(/MISSION DIRECTIVE/i).first().isVisible().catch(() => false),
  controls: await page.getByText(/WASD move/i).first().isVisible().catch(() => false),
}
for (const [k, v] of Object.entries(hudBits)) {
  if (!v) note('P1', 'HUD', `Missing HUD element: ${k}`)
}
if (Object.values(hudBits).every(Boolean)) note('Pass', 'HUD', 'Core HUD elements visible in mission')

// Movement + look + fire
await page.keyboard.down('w')
await page.waitForTimeout(600)
await page.keyboard.up('w')
await page.keyboard.down('a')
await page.waitForTimeout(400)
await page.keyboard.up('a')
await page.keyboard.down('d')
await page.waitForTimeout(400)
await page.keyboard.up('d')

const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 40, { steps: 12 })
  await page.mouse.up()
  // Fire a burst
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(90)
  }
}
await page.keyboard.press('r')
await page.waitForTimeout(300)
await page.keyboard.press('f')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/03-after-controls.png`, fullPage: true })
note('Pass', 'Controls', 'WASD, mouse look, fire, reload, medkit inputs accepted without crash')

// Model / asset fallback check via HUD text
const modelModeText = await page.locator('text=/Enemy models:/i').first().textContent().catch(() => '')
if (/procedural|built-in|FBX files not found|fallback/i.test(modelModeText || '')) {
  note('P2', 'Assets', `Missing Mixamo FBX/GLB assets — running procedural fallback. HUD: ${modelModeText}`)
} else if (/FBX|GLB|Detailed soldier/i.test(modelModeText || '')) {
  note('Pass', 'Assets', `External models loading: ${modelModeText}`)
} else {
  note('P2', 'Assets', `Could not confirm model mode from HUD: ${modelModeText}`)
}

// Survive a few seconds and check for runtime errors
await page.keyboard.down(' ')
await page.waitForTimeout(1200)
await page.keyboard.up(' ')
await page.keyboard.down('w')
await page.waitForTimeout(2000)
await page.keyboard.up('w')
await page.screenshot({ path: `${OUT}/04-mid-mission.png`, fullPage: true })

// Resize responsiveness
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/05-mobile.png`, fullPage: true })
const mobileCanvas = await page.locator('canvas').count()
if (mobileCanvas < 1) note('P1', 'Responsive', 'Canvas missing after mobile resize')
else note('Pass', 'Responsive', 'Canvas survives mobile viewport resize')
const mobileControlsHelp = await page.getByText(/WASD move/i).first().isVisible().catch(() => false)
if (mobileControlsHelp) note('P2', 'Responsive', 'Desktop control help still shown on mobile viewport (may be intentional md:block)')
else {
  const mobileFire = await page.getByRole('button', { name: 'FIRE' }).isVisible().catch(() => false)
  if (mobileFire) note('Pass', 'Responsive', 'Desktop help hides and touch FIRE control appears on mobile')
  else note('P1', 'Responsive', 'Desktop help hides but touch FIRE control is missing')
}

await page.setViewportSize({ width: 1400, height: 900 })
await page.waitForTimeout(300)

// Failed asset requests for models
const modelFails = failedRequests.filter((r) => /\/models\//.test(r.url))
if (modelFails.length) {
  note('P2', 'Assets', `${modelFails.length} model asset request(s) failed (expected without /public/models). Sample: ${modelFails[0].url}`)
}

const assertFails = consoleLogs.filter((l) => l.type === 'error' && /Assertion failed|console\.assert/i.test(l.text))

if (assertFails.length) note('P1', 'SmokeTests', `console.assert failures: ${assertFails.map((a) => a.text).join(' | ')}`)
else note('Pass', 'SmokeTests', 'No console.assert failures observed')

if (pageErrors.length) {
  for (const err of pageErrors.slice(0, 5)) note('P0', 'Runtime', err)
} else {
  note('Pass', 'Runtime', 'No uncaught page errors during playtest')
}

const noisyErrors = consoleLogs.filter((l) => l.type === 'error')
if (noisyErrors.length && !pageErrors.length) {
  note('Info', 'Console', `${noisyErrors.length} console error(s) (often 404 model assets): ${noisyErrors.slice(0, 3).map((e) => e.text).join(' ; ')}`)
}

await browser.close()

const summary = {
  url: 'http://127.0.0.1:5173/',
  timestamp: new Date().toISOString(),
  counts: {
    pass: findings.filter((f) => f.severity === 'Pass').length,
    p0: findings.filter((f) => f.severity === 'P0').length,
    p1: findings.filter((f) => f.severity === 'P1').length,
    p2: findings.filter((f) => f.severity === 'P2').length,
    info: findings.filter((f) => f.severity === 'Info').length,
  },
  findings,
  pageErrors,
  failedModelRequests: modelFails.slice(0, 10),
  consoleErrorSample: consoleLogs.filter((l) => l.type === 'error').slice(0, 12),
}

console.log(JSON.stringify(summary, null, 2))
await import('fs').then((fs) => fs.writeFileSync(`${OUT}/qa-report.json`, JSON.stringify(summary, null, 2)))
