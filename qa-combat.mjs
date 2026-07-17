import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /ENTER COMPOUND/i }).click()
await page.waitForTimeout(1000)

// Expose lightweight runtime probe via React fiber is hard; instead drive camera with arrows
// and spray while moving forward toward spawn edges.
const readHud = async () => {
  const body = await page.locator('body').innerText()
  const ammo = body.match(/M4A1 CARBINE[\s\S]*?\n(\d+|\.\.\.)/)?.[1]
  const score = body.match(/Score\s+(\d+)/)?.[1]
  const hostiles = body.match(/Hostiles:\s+(\d+)/)?.[1]
  const armor = body.match(/ARMOR[\s\S]*?(\d+)%/)?.[1]
  const wave = body.match(/WAVE\s+(\d+)/)?.[1]
  return { ammo, score, hostiles, armor, wave }
}

const before = await readHud()

// Move forward and turn while holding fire for several seconds
await page.keyboard.down('w')
await page.keyboard.down(' ')
for (let i = 0; i < 40; i += 1) {
  await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight')
  await page.waitForTimeout(120)
}
await page.keyboard.up(' ')
await page.keyboard.up('w')
await page.waitForTimeout(500)

// Also try looking around with mouse drag + click fire
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
if (box) {
  for (let angle = -200; angle <= 200; angle += 40) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + angle, box.y + box.height / 2 - 20, { steps: 6 })
    await page.mouse.up()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(80)
  }
}

await page.waitForTimeout(800)
const after = await readHud()

// Let enemies close in to validate melee damage
await page.waitForTimeout(8000)
const late = await readHud()

console.log(JSON.stringify({ before, after, late }, null, 2))
await page.screenshot({ path: 'qa-artifacts/06-combat-probe.png', fullPage: true })
await browser.close()
