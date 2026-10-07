import type { Page } from '@playwright/test'
import { expect, mockApi, test, tickets } from './fixtures'

/** Búsqueda global del navbar: tickets, clientes y artículos a la vez, con la API simulada. */

const views = [
  { width: 390, scheme: 'light' },
  { width: 390, scheme: 'dark' },
  { width: 1440, scheme: 'light' },
  { width: 1440, scheme: 'dark' },
] as const

/** El botón de la barra superior: con texto y atajo desde 768 px, y de icono por debajo. */
const searchButton = (page: Page, width: number) =>
  width < 768
    ? page.getByRole('button', { name: 'Buscar', exact: true })
    : page.getByRole('button', { name: /^Buscar…/ })

const combobox = (page: Page) => page.getByRole('combobox', { name: 'Buscar en Resolve' })
const live = (page: Page) => page.getByRole('dialog', { name: 'Buscar' }).locator('p[role="status"]')

/** Espera a que acabe la animación de entrada del diálogo: su caja se mide ya en reposo. */
const settled = (page: Page) =>
  page
    .getByRole('dialog', { name: 'Buscar' })
    .evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)))

async function noPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
}

test.describe('búsqueda global', () => {
  for (const { width, scheme } of views) {
    test(`se abre con el botón, agrupa, se recorre con flechas y Enter abre el detalle · ${width}px ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/clientes')
      await searchButton(page, width).click()

      const dialog = page.getByRole('dialog', { name: 'Buscar' })
      await expect(dialog).toBeVisible()
      await expect(combobox(page)).toBeFocused()
      await combobox(page).fill('ac')

      const list = page.getByRole('listbox', { name: 'Resultados de la búsqueda' })
      await expect(list.getByRole('group', { name: 'Tickets' })).toBeVisible()
      await expect(list.getByRole('group', { name: 'Clientes' })).toBeVisible()
      await expect(list.getByRole('group', { name: 'Artículos' })).toBeVisible()
      await expect(live(page)).toHaveText(/^\d+ resultados$/)
      await noPageOverflow(page)
      const box = (await dialog.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)

      await page.keyboard.press('ArrowDown')
      const first = list.getByRole('option').first()
      await expect(first).toHaveAttribute('aria-selected', 'true')
      await expect(combobox(page)).toHaveAttribute('aria-activedescendant', (await first.getAttribute('id'))!)
      await page.keyboard.press('ArrowDown')
      await expect(list.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Enter')

      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(/\/tickets\/\d+$/)
      await expect(page.getByRole('main')).toBeFocused()
    })
  }

  for (const width of [320, 390, 767, 768, 1024, 1199, 1200, 1440]) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`cabe en el viewport sin scroll horizontal · ${width}px ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.setViewportSize({ width, height: 700 })
        await page.goto('/tickets')
        await searchButton(page, width).click()
        await combobox(page).fill('ac')
        await expect(live(page)).toHaveText(/^\d+ resultados$/)
        await settled(page)
        await noPageOverflow(page)
        const box = (await page.getByRole('dialog', { name: 'Buscar' }).boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(700)
      })
    }
  }

  test('Ctrl+K abre la búsqueda, Escape la cierra y el foco vuelve al botón de la barra', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.keyboard.press('Control+k')
    await expect(combobox(page)).toBeFocused()
    await combobox(page).fill('ac')
    await expect(page.getByRole('listbox')).toBeVisible()
    // Un solo Escape cierra aunque haya texto.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeHidden()
    await expect(searchButton(page, 1440)).toBeFocused()
    await expect(page).toHaveURL(/\/equipo$/)
  })

  test('/ abre la búsqueda salvo al escribir en un campo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const inboxSearch = page.getByRole('searchbox', { name: 'Buscar tickets' })
    await inboxSearch.focus()
    await page.keyboard.type('a/b')
    await expect(inboxSearch).toHaveValue('a/b')
    await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeHidden()
    await inboxSearch.blur()
    await page.keyboard.press('/')
    await expect(combobox(page)).toBeFocused()
  })

  test('cada grupo lleva a su listado con ?q= aplicado, y el buscador de la página lo muestra', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const [group, path, field] of [
      ['tickets', '/tickets', 'Buscar tickets'],
      ['clientes', '/clientes', 'Buscar clientes'],
      ['artículos', '/conocimiento', 'Buscar artículos'],
    ] as const) {
      await page.goto('/equipo')
      await searchButton(page, 1440).click()
      await combobox(page).fill('ac')
      await page.getByRole('option', { name: `Ver todos los resultados de ${group}` }).click()
      await expect(page).toHaveURL(new RegExp(`${path}\\?q=ac$`))
      await expect(page.getByRole('searchbox', { name: field })).toHaveValue('ac')
    }
  })

  test('sin coincidencias lo dice y lo anuncia', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await searchButton(page, 390).click()
    await expect(page.getByText('Escribe al menos 2 caracteres para buscar.')).toBeVisible()
    await combobox(page).fill('zzzz')
    await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
    await expect(live(page)).toHaveText('Sin resultados')
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })

  test('al borrar y escribir otro texto de golpe, los resultados del anterior no se activan', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    // Un predicado y no un glob: `*` no cruza `/` y `/api/knowledge/articles` quedaría sin retener.
    await page.route(
      (url) => url.searchParams.get('q') === 'zq',
      async (route) => {
        await held
        await route.fallback()
      },
    )
    await page.goto('/equipo')
    await searchButton(page, 1440).click()
    await combobox(page).fill('ac')
    const options = page.getByRole('listbox', { name: 'Resultados de la búsqueda' }).getByRole('option')
    await expect(live(page)).toHaveText(/^\d+ resultados$/)
    const shown = await options.count()
    expect(shown).toBeGreaterThan(0)

    // Menos de 250 ms entre borrar y escribir: la consulta sigue siendo la de «ac».
    await combobox(page).fill('')
    await combobox(page).pressSequentially('zq')
    await expect(options).toHaveCount(shown)
    for (const option of await options.all()) await expect(option).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(combobox(page)).not.toHaveAttribute('aria-activedescendant')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/equipo$/)
    await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible()

    release()
    await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
    await expect(live(page)).toHaveText('Sin resultados')
  })

  test('un grupo que falla no oculta los demás y se puede reintentar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    let failing = true
    await page.route('**/api/customers?*', async (route) => {
      if (failing) await route.fulfill({ status: 500, json: { status: 500, title: 'Error' } })
      else await route.fallback()
    })
    await page.goto('/tickets')
    await searchButton(page, 1440).click()
    await combobox(page).fill('ac')
    const retry = page.getByRole('option', { name: /Reintentar clientes/ })
    await expect(retry).toBeVisible()
    await expect(page.getByRole('group', { name: 'Tickets' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Artículos' })).toBeVisible()
    await expect(live(page)).toHaveText(/resultados\. No se pudo buscar en clientes\.$/)

    failing = false
    await retry.click()
    await expect(page.getByRole('group', { name: 'Clientes' })).toBeVisible()
    await expect(live(page)).toHaveText(/^\d+ resultados$/)
  })

  test('un cliente solo busca en tickets y artículos', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    const requested: string[] = []
    page.on('request', (request) => requested.push(new URL(request.url()).pathname))
    await page.goto('/tickets')
    await searchButton(page, 1440).click()
    await combobox(page).fill('ac')
    await expect(page.getByRole('group', { name: 'Tickets' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Artículos' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Clientes' })).toHaveCount(0)
    expect(requested.filter((path) => path.startsWith('/api/customers'))).toEqual([])
  })

  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`los nombres largos envuelven sin recortar ni desbordar · ${width}px`, async ({ page }) => {
      const long = `Ac${'x'.repeat(118)}`
      await page.route('**/api/tickets?*', async (route) => {
        const [first] = tickets
        await route.fulfill({
          json: {
            items: [{ ...first, subject: long }],
            page: 0,
            size: 5,
            totalItems: 1,
            totalPages: 1,
          },
        })
      })
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/tickets')
      await searchButton(page, width).click()
      await combobox(page).fill('ac')
      const option = page.getByRole('option', { name: new RegExp(long) })
      await expect(option).toBeVisible()
      await noPageOverflow(page)
      const dialog = (await page.getByRole('dialog', { name: 'Buscar' }).boundingBox())!
      const box = (await option.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(dialog.x)
      expect(box.x + box.width).toBeLessThanOrEqual(dialog.x + dialog.width)
      const scrolls = await option.evaluate((element) => element.scrollWidth > element.clientWidth)
      expect(scrolls, 'el texto largo debe envolver dentro de la fila').toBe(false)
    })
  }

  test('los resultados miden al menos 44 px de alto por debajo de 768 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await searchButton(page, 390).click()
    await combobox(page).fill('ac')
    await expect(live(page)).toHaveText(/^\d+ resultados$/)
    for (const option of await page
      .getByRole('listbox', { name: 'Resultados de la búsqueda' })
      .getByRole('option')
      .all()) {
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect((await searchButton(page, 390).boundingBox())!.width).toBeGreaterThanOrEqual(44)
  })

  for (const width of [320, 390, 1440]) {
    test(`el campo y el diálogo no se mueven al llegar los resultados ni al cambiar el texto · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets?*', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/tickets')
      await searchButton(page, width).click()
      const dialog = page.getByRole('dialog', { name: 'Buscar' })
      await settled(page)
      const empty = (await dialog.boundingBox())!
      const emptyField = (await combobox(page).boundingBox())!

      await combobox(page).fill('ac')
      await expect(page.getByText('Buscando en tickets…')).toBeAttached()
      const loading = (await dialog.boundingBox())!
      expect(await combobox(page).boundingBox()).toEqual(emptyField)

      release()
      await expect(page.getByRole('group', { name: 'Tickets' })).toBeVisible()
      expect(await dialog.boundingBox()).toEqual(loading)
      expect(loading).toEqual(empty)

      await combobox(page).fill('zzzz')
      await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
      expect(await dialog.boundingBox()).toEqual(empty)
      expect(await combobox(page).boundingBox()).toEqual(emptyField)
    })
  }
})
