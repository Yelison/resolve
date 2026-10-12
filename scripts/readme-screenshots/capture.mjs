// Takes the README screenshots from the published static demo (fictional data).
// Run from frontend/ so Playwright resolves: node ../scripts/readme-screenshots/capture.mjs [outDir]
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(resolve('node_modules/playwright/index.mjs')).href)

const BASE = process.env.DEMO_URL ?? 'https://yelison.github.io/resolve'
const OUT = resolve(process.argv[2] ?? '../docs/screenshots')

const browser = await chromium.launch()

async function session(viewport, theme) {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/entrar`)
  await page.getByRole('button', { name: 'Usar este usuario' }).click() // first option: the demo administrator
  await page
    .getByRole('link', { name: 'Tickets', exact: true })
    .or(page.getByRole('button', { name: 'Abrir menú' }))
    .first()
    .waitFor()
  return { context, page }
}

async function shot(page, path, name, ready) {
  await page.goto(`${BASE}${path}`)
  await ready(page)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUT}/${name}`, type: 'png' })
  console.log('saved', name)
}

const desktop = { width: 1440, height: 900 }
const mobile = { width: 390, height: 844 }

// Inside the static demo a hard navigation resets the in-memory session, so every move goes through the router.
function tour({ page }, out) {
  return {
    async save(name) {
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: `${out}/${name}`, type: 'png' })
      console.log('saved', name)
    },
    async open(label) {
      await page.getByRole('link', { name: label, exact: true }).first().click()
    },
  }
}

{
  const s = await session(desktop, 'light')
  const t = tour(s, OUT)
  const { page } = s
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await t.save('home.png')
  await t.open('Tickets')
  await page.getByRole('heading', { name: 'Tickets', level: 1 }).waitFor()
  await page.getByRole('link', { name: /#1048/ }).first().click()
  await page.getByText('Nota interna').first().waitFor()
  await t.save('tickets.png')
  await t.open('Clientes')
  await page.getByRole('heading', { name: 'Clientes', level: 1 }).waitFor()
  await t.save('customers.png')
  await t.open('Reportes')
  await page.getByRole('heading', { name: 'Reportes', level: 1 }).waitFor()
  await t.save('reports.png')
  await s.context.close()
}

{
  const s = await session(desktop, 'dark')
  const t = tour(s, OUT)
  const { page } = s
  await t.open('Tickets')
  await page.getByRole('link', { name: /#1047/ }).first().click()
  await page.getByText('Nota interna').first().waitFor()
  await t.save('ticket-dark.png')
  await s.context.close()
}

{
  const s = await session(mobile, 'light')
  const { page } = s
  await page.getByRole('button', { name: /menú/i }).first().click()
  await page.getByRole('link', { name: 'Tickets', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Tickets', level: 1 }).waitFor()
  await tour(s, OUT).save('tickets-mobile.png')
  await s.context.close()
}

await browser.close()
