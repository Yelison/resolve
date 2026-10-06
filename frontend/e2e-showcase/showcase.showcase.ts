import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * La demostración estática (`--mode showcase`) servida bajo `/resolve/`: el frontend completo con la API simulada de los
 * e2e, sin red. Las rutas son relativas para que se resuelvan bajo la base.
 */

const NOTICE = 'Demostración con datos de ejemplo'
const widths = [320, 1440]
const themes = ['light', 'dark'] as const

/** Ninguna petición a `/api` debe salir hacia la red: las atiende el adaptador dentro de la página. */
function watchNetwork(page: Page) {
  const leaked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) leaked.push(request.url())
  })
  return leaked
}

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })
const picker = (page: Page) => page.getByRole('combobox', { name: 'Usuario de demostración' })
const ADMIN = 'Administración · ve y gestiona todo'
const CUSTOMER = 'Cliente · portal de una clienta'

/** Elige un usuario en el selector de /entrar y entra con él. */
async function enterAs(page: Page, label: string) {
  await picker(page).selectOption({ label })
  await page.getByRole('button', { name: 'Usar este usuario' }).click()
}

const signOut = async (page: Page) => {
  await page.getByRole('button', { name: /^Cuenta:/ }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
}

test('la raíz empieza en /entrar con el selector de usuarios y sin proveedor de identidad', async ({ page }) => {
  const leaked = watchNetwork(page)
  await page.goto('')
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
  await expect(picker(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar con tu cuenta' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: NOTICE })).toContainText('los cambios no se guardan')
  expect((await picker(page).locator('option').allTextContents()).length).toBe(3)
  expect(leaked).toEqual([])
})

test('una URL profunda sin sesión lleva a /entrar y vuelve a ella tras elegir usuario', async ({ page }) => {
  await page.goto('tickets/1048')
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
  await enterAs(page, ADMIN)
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets\/1048$/)
})

test('recorre Resumen, Tickets, un ticket, Clientes, Conocimiento y Ajustes', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/?$/)

  const nav = page.getByRole('navigation')
  await nav.getByRole('link', { name: 'Tickets' }).click()
  await expect(heading(page, 'Tickets')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)

  await page
    .getByRole('link', { name: /No puedo acceder a mi cuenta/ })
    .first()
    .click()
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()

  await nav.getByRole('link', { name: 'Clientes' }).click()
  await expect(heading(page, 'Clientes')).toBeVisible()

  await nav.getByRole('link', { name: 'Conocimiento' }).click()
  await expect(heading(page, 'Base de conocimiento')).toBeVisible()

  await nav.getByRole('link', { name: 'Configuración' }).click()
  await expect(heading(page, 'Configuración')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('se entra como cliente y se ve lo propio del cliente; cerrar sesión vuelve a /entrar', async ({ page }) => {
  await page.goto('')
  await enterAs(page, CUSTOMER)
  await expect(heading(page, 'Resumen').or(heading(page, 'Tickets'))).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()

  await signOut(page)
  // Volver a elegir al mismo usuario tras cerrar sesión también entra.
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()

  // Y como administración se ve lo que el cliente no.
  await signOut(page)
  await enterAs(page, ADMIN)
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
})

test('los cambios no se guardan: recargar reinicia la demostración en /entrar', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  // Una recarga completa: GitHub Pages redirige `/resolve` a `/resolve/`, que es lo que abre `goto('')`.
  await page.goto('')
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
})

for (const theme of themes) {
  for (const width of widths) {
    test(`el aviso cabe sin recortes ni scroll horizontal · ${theme} · ${width}px`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('')
      await enterAs(page, ADMIN)
      await expect(heading(page, 'Resumen')).toBeVisible()
      const banner = page.getByRole('region', { name: NOTICE })
      await expect(banner).toBeVisible()
      const link = banner.getByRole('link', { name: 'ver el código' })
      await expect(link).toHaveAttribute('href', 'https://github.com/Yelison/resolve')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
      expect(await banner.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
      const box = (await banner.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeCloseTo(900, 0)
      if (width < 768) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)

      // Contraste legible en ambos temas: el texto no hereda el color del fondo.
      const { color, background } = await banner.evaluate((element) => {
        const style = getComputedStyle(element)
        return { color: style.color, background: style.backgroundColor }
      })
      expect(color).not.toBe(background)
    })
  }
}

test('404.html es idéntico a index.html para que una URL profunda cargue en GitHub Pages', () => {
  const dist = resolve(import.meta.dirname, '../dist/showcase')
  expect(readFileSync(resolve(dist, '404.html'), 'utf8')).toBe(readFileSync(resolve(dist, 'index.html'), 'utf8'))
})
