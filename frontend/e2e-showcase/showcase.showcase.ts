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
const ADMIN = 'Administración'
const CUSTOMER = 'Cliente'

/** Elige un usuario en el selector de /entrar y entra con él. */
async function enterAs(page: Page, label: string) {
  await picker(page).selectOption({ label })
  await page.getByRole('button', { name: 'Usar este usuario' }).click()
}

const signOut = async (page: Page) => {
  // Por debajo de 768 px el perfil con la cuenta está al pie del drawer.
  const openMenu = page.getByRole('button', { name: 'Abrir menú' })
  if (await openMenu.isVisible()) await openMenu.click()
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
  await expect(
    page.getByText('Elige un usuario de demostración para ver los tickets, clientes y reportes'),
  ).toBeVisible()
  await expect(page.getByText('Usa tu cuenta')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Entrar con tu cuenta' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: NOTICE })).toContainText('los cambios no se guardan')
  expect((await picker(page).locator('option').allTextContents()).length).toBe(3)
  expect(leaked).toEqual([])
})

for (const theme of themes) {
  test(`el selector y su descripción caben a 320 px sin recortes · ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('')
    const select = picker(page)
    await expect(select).toBeVisible()
    expect(await select.locator('option').allTextContents()).toEqual(['Administración', 'Agente', 'Cliente'])
    await expect(page.getByText(/Administración ve y gestiona todo; Agente atiende tickets/)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
    const box = (await select.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  })
}

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

test('recargar conserva el usuario y la ruta', async ({ page }) => {
  await page.goto('')
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()
  await page.getByRole('link', { name: 'Tickets' }).click()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)

  await page.reload()
  await expect(heading(page, 'Tickets')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)
  // Sigue siendo el cliente, no la administración.
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
})

test('un enlace profundo recargado a mano conserva la sesión en esa ruta', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  await page.goto('tickets/1048')
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets\/1048$/)
})

test('abrir de nuevo la dirección de la demostración tras entrar sigue dentro', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  // Una carga completa de la dirección pública: GitHub Pages redirige `/resolve` a `/resolve/`, que es lo que abre `goto('')`.
  await page.goto('')
  await expect(heading(page, 'Resumen')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
  await expect(page).not.toHaveURL(/\/entrar$/)
})

test('los cambios no se guardan: un artículo creado desaparece al recargar aunque la sesión siga', async ({ page }) => {
  const title = 'Artículo efímero de la demostración'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, ADMIN)
  await page.goto('conocimiento/nuevo')
  await page.getByRole('textbox', { name: 'Título' }).fill(title)
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
  await page.getByRole('textbox', { name: 'Contenido' }).fill('Texto de prueba.')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(heading(page, 'Editar artículo')).toBeVisible()
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Conocimiento' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.reload()
  await expect(heading(page, 'Base de conocimiento')).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

test('una pestaña nueva empieza en /entrar aunque otra tenga sesión', async ({ page, context }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  const other = await context.newPage()
  await other.goto('')
  await expect(other.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(other).toHaveURL(/\/resolve\/entrar$/)
})

test('cerrar sesión y recargar deja en /entrar', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  await signOut(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
})

test('elegir otro usuario tras cerrar sesión sustituye la elección que sobrevive a la recarga', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
  await signOut(page)
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
})

for (const width of [390, 1440]) {
  test(`recargar conserva la sesión y cerrar sesión la quita · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('')
    await enterAs(page, ADMIN)
    await expect(heading(page, 'Resumen')).toBeVisible()
    await page.goto('reportes')
    await expect(page).toHaveURL(/\/resolve\/reportes$/)
    await page.reload()
    await expect(page).toHaveURL(/\/resolve\/reportes$/)
    await expect(heading(page, 'Reportes')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await signOut(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  })
}

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

test('la búsqueda global funciona con la API simulada: Ctrl+K, resultados agrupados y navegación', async ({ page }) => {
  const leaked = watchNetwork(page)
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, 'Resumen')).toBeVisible()
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'Buscar en Resolve' })
  await expect(search).toBeFocused()
  await search.fill('ac')
  const list = page.getByRole('listbox', { name: 'Resultados de la búsqueda' })
  await expect(list.getByRole('group', { name: 'Tickets' })).toBeVisible()
  await expect(list.getByRole('group', { name: 'Clientes' })).toBeVisible()
  await expect(list.getByRole('group', { name: 'Artículos' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/resolve\/tickets\/\d+$/)
  expect(leaked).toEqual([])
})
