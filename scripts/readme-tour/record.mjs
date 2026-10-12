// Records the README tour against the real stack (deploy/docker-compose.prod.yml with the demo data).
// Usage: node scripts/readme-tour/record.mjs [outDir]   (env: BASE_URL, PASSWORD; outDir defaults to the system temp dir)
// Writes outDir/frames/*.jpg and outDir/frames.json (timestamps in seconds); make_gif.py turns them into the GIF.
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(here, '../../frontend/package.json'))
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080'
const ADMIN = 'yelisson.ortiz@acme.example'
const PASSWORD = process.env.PASSWORD ?? 'demo' // password of the development realm, public on purpose
const outDir = resolve(process.argv[2] ?? join(tmpdir(), 'resolve-tour'))
const framesDir = resolve(outDir, 'frames')
rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'es-ES',
  colorScheme: 'light',
  reducedMotion: 'no-preference',
})
// Playwright does not draw the pointer: a dot that follows mousemove, on every page (Keycloak included).
await context.addInitScript(() => {
  const draw = () => {
    if (document.getElementById('tour-cursor') || !document.body) return
    const dot = document.createElement('div')
    dot.id = 'tour-cursor'
    dot.style.cssText =
      'position:fixed;z-index:2147483647;width:20px;height:20px;margin:-4px 0 0 -4px;border-radius:50%;pointer-events:none;' +
      'background:rgba(79,70,229,.35);border:2px solid #4f46e5;box-shadow:0 0 0 1px #fff;left:-40px;top:-40px'
    document.body.appendChild(dot)
    addEventListener('mousemove', (e) => {
      dot.style.left = e.clientX + 'px'
      dot.style.top = e.clientY + 'px'
    })
  }
  addEventListener('DOMContentLoaded', draw)
  new MutationObserver(draw).observe(document, { childList: true, subtree: true })
})
const page = await context.newPage()

const cdp = await context.newCDPSession(page)
const frames = []
let t0 = null
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  t0 ??= metadata.timestamp
  const name = `f${String(frames.length).padStart(5, '0')}.jpg`
  writeFileSync(resolve(framesDir, name), Buffer.from(data, 'base64'))
  frames.push({ file: name, t: metadata.timestamp - t0 })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })

let startedAt = 0
const pause = (ms = 1000) => page.waitForTimeout(ms)
let mouse = { x: 640, y: 400 }
async function glide(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y, { steps: 25 })
  mouse = { x, y }
}
async function click(locator, wait = 500) {
  await glide(locator)
  await pause(250)
  await locator.click()
  await pause(wait)
}

try {
  // 1. Sign in through Keycloak
  await page.goto(`${BASE_URL}/entrar`)
  await page
    .getByRole('button', { name: /Entrar con tu cuenta/ })
    .or(page.getByRole('link', { name: /Entrar con tu cuenta/ }))
    .waitFor()
  await pause(300)
  startedAt = frames.at(-1)?.t ?? 0 // everything before is the blank page
  await pause(900)
  await click(
    page
      .getByRole('button', { name: /Entrar con tu cuenta/ })
      .or(page.getByRole('link', { name: /Entrar con tu cuenta/ })),
    300,
  )
  await page.waitForURL(/\/realms\/resolve\//)
  await pause(1200)
  await click(page.locator('#username'), 100)
  await page.keyboard.type(ADMIN, { delay: 35 })
  await click(page.locator('#password'), 100)
  await page.keyboard.type(PASSWORD, { delay: 60 })
  await pause(400)
  await click(page.locator('#kc-login'), 0)

  // 2. Overview
  await page.waitForURL((u) => u.origin === new URL(BASE_URL).origin && !u.pathname.startsWith('/api'))
  await page.getByText('Necesitan atención').first().waitFor()
  await pause(1200)
  await page.mouse.move(700, 480, { steps: 20 })
  await pause(900)

  // 3. Open a ticket and answer it
  await click(page.getByRole('link', { name: 'Tickets', exact: true }).first(), 1200)
  const first = page.locator('a[data-inbox-item]').first()
  await click(first, 1000)
  await click(page.getByRole('link', { name: 'Abrir completo' }), 1000)
  const reply = page.getByRole('textbox', { name: 'Respuesta al cliente' })
  await click(reply, 200)
  const text = 'Hola, ya revisamos tu caso y te escribimos hoy con una solución.'
  await page.keyboard.type(text, { delay: 30 })
  await pause(500)
  await click(page.getByRole('button', { name: 'Enviar respuesta' }), 400)
  await page.getByText(text).first().waitFor()
  await pause(1000)

  // 4. The admin belongs to one workspace in the demo data: show «Tus espacios», then Customers and Reports
  await click(page.getByRole('button', { name: /Cambiar de espacio/ }).first(), 800)
  await click(page.getByRole('menuitem', { name: 'Tus espacios' }), 1100)
  await click(page.getByRole('link', { name: 'Clientes', exact: true }).first(), 1200)
  await page.mouse.wheel(0, 250)
  await pause(800)
  await click(page.getByRole('link', { name: 'Reportes', exact: true }).first(), 1200)

  // 5. Sign out
  await click(page.getByRole('button', { name: /^Cuenta:/ }), 700)
  await click(page.getByRole('menuitem', { name: 'Cerrar sesión' }), 0)
  await page
    .getByRole('button', { name: /Entrar con tu cuenta/ })
    .or(page.getByRole('link', { name: /Entrar con tu cuenta/ }))
    .waitFor({ timeout: 15000 })
  await pause(1000)
} catch (error) {
  await page.screenshot({ path: resolve(outDir, 'failure.png') })
  console.error('Tour failed:', error)
  process.exitCode = 1
} finally {
  await cdp.send('Page.stopScreencast')
  writeFileSync(resolve(outDir, 'frames.json'), JSON.stringify({ start: startedAt, frames }))
  await browser.close()
}
console.log(`${frames.length} frames, ${(frames.at(-1)?.t - startedAt).toFixed(1)} s`)
