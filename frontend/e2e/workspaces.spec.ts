import type { Locator, Page } from '@playwright/test'
import type { OrganizationRef } from '../src/api/schema'
import { expect, mockApi, test } from './fixtures'
import { acme, demoCreatedIn, demoWorkspaces, lumen, norte } from './mocks/session'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const

/** Los cuatro espacios de la demostración: administrador en Acme y en Kora Fitness, agente en Lumen Diseño y cliente en Norte Viajes. */
const spaces = demoWorkspaces.admin!

const card = (page: Page) => page.getByRole('button', { name: /^Espacio: .*\. Cambiar de espacio$/ })
const selector = (page: Page) => page.getByRole('menu', { name: 'Cambiar de espacio' })
/** El valor resuelto de un color de espacio en el tema activo, como lo calcula el navegador (`rgb(…)`). */
const tokenColor = (page: Page, key: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.background = `var(--color-workspace-${name})`
    document.body.append(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  }, key)
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const longName = (name: string) =>
  `${name} `
    .repeat(Math.ceil(120 / (name.length + 1)))
    .slice(0, 119)
    .trimEnd() + 'x'

const manySpaces = (count: number): OrganizationRef[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `0192f000-0000-7000-8000-0000000002${String(index).padStart(2, '0')}`,
    name: index === 0 ? 'Acme Studio' : `Espacio ${index + 1}`,
    role: index % 2 === 0 ? 'admin' : 'agent',
    color: 'blue',
    memberCount: index + 2,
  }))

/** El cuadro cae dentro del viewport y no mide menos de 44 px en ninguna dirección. */
async function expectTouchTarget(locator: Locator, width: number) {
  const box = (await locator.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

test.describe('selector de espacios', () => {
  test('escritorio: la tarjeta abre el selector, con teclado cambia de espacio y el foco queda con sentido', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const trigger = card(page)
    await expect(trigger).toContainText('Acme Studio')
    await expect(trigger).toContainText('Administrador')
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = selector(page)
    const rows = menu.getByRole('menuitemradio')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(rows.nth(0)).toBeFocused()
    // Tras el separador: «Crear espacio» (el administrador ha creado 2 de 3) y «Tus espacios».
    await expect(menu.getByRole('menuitem')).toHaveText(['Crear espacio', 'Tus espacios'])

    // Escape cierra y devuelve el foco a la tarjeta.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()

    // Por nombre, como el servidor: Acme Studio, Kora Fitness, Lumen Diseño, Norte Viajes.
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(2)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/$/)
    await expect(card(page)).toContainText('Lumen Diseño')
    await expect(card(page)).toContainText('Agente')
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Ahora trabajas en Lumen Diseño')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })

  test('cambiar de espacio desde un ticket no vuelve a pedir ese ticket en el espacio nuevo', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1046')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const after: string[] = []
    let switched = false
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/api/session/organization'))
        switched = true
    })
    page.on('request', (request) => {
      if (switched && new URL(request.url()).pathname.startsWith('/api/tickets/1046')) after.push(request.url())
    })
    await card(page).click()
    await selector(page)
      .getByRole('menuitemradio', { name: /^Lumen Diseño/ })
      .click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Ahora trabajas en Lumen Diseño')
    await page.waitForTimeout(500)
    expect(after).toEqual([])
  })

  for (const theme of themes) {
    test(`la tarjeta expandida distingue el cuadro de iniciales de su fondo, con y sin color · ${theme}`, async ({
      page,
    }) => {
      await mockApi(page, 'admin', { organizations: spaces })
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      // Mientras /me carga no hay color: el cuadro es neutro y toma el fondo del propio sidebar (el arreglo de la fase 1).
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/me', async (route) => {
        await gate
        await route.fallback()
      })
      await page.goto('/')
      const nav = page.getByRole('navigation', { name: 'Principal' })
      const neutralCard = nav.locator('xpath=preceding-sibling::*[1]')
      const neutralMark = neutralCard.locator('[aria-hidden="true"]').first()
      await expect(neutralMark).toBeVisible()
      const sidebarBackground = await nav.locator('..').evaluate((node) => getComputedStyle(node).backgroundColor)
      expect(await neutralMark.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(sidebarBackground)
      const loaded = page.waitForResponse('**/api/me')
      release()
      await loaded
      // Con color se distingue solo: el fondo del espacio, distinto del de la tarjeta, con iniciales blancas.
      const trigger = card(page)
      await expect(trigger).toContainText('AS')
      const [cardBackground, markBackground, markInk] = await trigger.evaluate((node) => [
        getComputedStyle(node).backgroundColor,
        getComputedStyle(node.firstElementChild!).backgroundColor,
        getComputedStyle(node.firstElementChild!).color,
      ])
      expect(markBackground).not.toBe(cardBackground)
      expect(markBackground).toBe(await tokenColor(page, 'blue'))
      expect(markInk).toBe('rgb(255, 255, 255)')
    })

    test(`cada espacio lleva su color en la tarjeta, en el selector y en «Tus espacios» · ${theme}`, async ({
      page,
    }) => {
      await mockApi(page, 'admin', { organizations: spaces })
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      const blue = await tokenColor(page, 'blue')
      const green = await tokenColor(page, 'green')
      const orange = await tokenColor(page, 'orange')
      const teal = await tokenColor(page, 'teal')
      // Acme Studio, Kora Fitness, Lumen Diseño y Norte Viajes, por nombre como en el servidor.
      const colors = [blue, teal, green, orange]
      expect(new Set(colors).size).toBe(4)
      await card(page).click()
      const rows = selector(page).getByRole('menuitemradio')
      for (const [index, color] of colors.entries()) {
        const mark = rows.nth(index).locator('[aria-hidden="true"]').first()
        expect(await mark.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(color)
      }
      await page.keyboard.press('Escape')
      await page.goto('/configuracion/espacios')
      const list = page.locator('section[aria-labelledby="workspaces-heading"] li')
      for (const [index, color] of colors.entries()) {
        const mark = list.nth(index).locator('[aria-hidden="true"]').first()
        expect(await mark.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(color)
      }
    })
  }

  test('un color guardado se queda en su espacio: en la fila del selector, tras recargar y al ir a Lumen y volver a Acme', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/empresa')
    await page.getByRole('radio', { name: 'Violeta' }).check({ force: true })
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    const violet = await tokenColor(page, 'violet')
    const green = await tokenColor(page, 'green')
    const markOf = (locator: Locator) =>
      locator
        .locator('[aria-hidden="true"]')
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    const rowColors = async () => {
      await card(page).click()
      const rows = selector(page).getByRole('menuitemradio')
      const colors = [await markOf(rows.nth(0)), await markOf(rows.nth(2))]
      await page.keyboard.press('Escape')
      return colors
    }
    // Sin recargar: la tarjeta y la fila de Acme ya son violeta.
    expect(await markOf(card(page))).toBe(violet)
    expect(await rowColors()).toEqual([violet, green])
    // Ir a Lumen: su tarjeta es verde y Acme conserva el violeta; no pasa a Lumen.
    await card(page).click()
    await selector(page).getByRole('menuitemradio').nth(2).click()
    await expect(card(page)).toContainText('Lumen Diseño')
    expect(await markOf(card(page))).toBe(green)
    expect(await rowColors()).toEqual([violet, green])
    // Volver a Acme y recargar: sigue violeta.
    await card(page).click()
    await selector(page).getByRole('menuitemradio').nth(0).click()
    await expect(card(page)).toContainText('Acme Studio')
    expect(await markOf(card(page))).toBe(violet)
    await page.reload()
    await expect(card(page)).toContainText('Acme Studio')
    expect(await markOf(card(page))).toBe(violet)
  })

  test('una clave de color sin mapeo vuelve al fondo neutro: el cuadro no queda transparente', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    // El servidor manda un color que este cliente aún no conoce: se cambia en la respuesta de `/me`.
    await page.addInitScript(() => {
      const network = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const response = await network(input, init)
        const url = new URL(response.url || String(input), window.location.href)
        if (url.pathname !== '/api/me') return response
        const body = await response.clone().json()
        body.organization.color = 'chartreuse'
        body.organizations = body.organizations?.map((ref: object) => ({ ...ref, color: 'chartreuse' }))
        return new Response(JSON.stringify(body), { status: response.status, headers: response.headers })
      }
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const trigger = card(page)
    await expect(trigger).toContainText('AS')
    const mark = trigger.locator('[data-color="chartreuse"]')
    await expect(mark).toBeVisible()
    const background = await mark.evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(background).not.toBe('rgba(0, 0, 0, 0)')
    await trigger.click()
    const row = selector(page).getByRole('menuitemradio').first().locator('[data-color]')
    expect(await row.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('colapsada, el cuadro conserva el color con su nombre accesible', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    const trigger = card(page)
    await expect(trigger).toHaveAccessibleName('Espacio: Acme Studio. Cambiar de espacio')
    expect(await trigger.evaluate((node) => getComputedStyle(node.firstElementChild!).backgroundColor)).toBe(
      await tokenColor(page, 'blue'),
    )
  })

  test('móvil: la tarjeta del drawer y sus filas llevan el color de cada espacio', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const trigger = card(page)
    await trigger.click()
    const group = page.getByRole('group', { name: 'Cambiar de espacio' })
    const green = await tokenColor(page, 'green')
    const lumen = group
      .getByRole('button', { name: 'Lumen Diseño', exact: true })
      .locator('[aria-hidden="true"]')
      .first()
    expect(await lumen.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(green)
    expect(await trigger.evaluate((node) => getComputedStyle(node.firstElementChild!).backgroundColor)).toBe(
      await tokenColor(page, 'blue'),
    )
  })

  test('colapsada: el cuadro es el disparador, con nombre accesible y tooltip también con foco', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    const trigger = card(page)
    await expect(trigger).toHaveAccessibleName('Espacio: Acme Studio. Cambiar de espacio')
    await expect(trigger).not.toContainText('Administrador')
    await expectTouchTarget(trigger, 1024)
    await trigger.focus()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveText('Acme Studio')
    const [tip, anchor] = await Promise.all([tooltip.boundingBox(), trigger.boundingBox()])
    // Junto al cuadro, dentro del viewport.
    expect(tip!.x + tip!.width).toBeLessThanOrEqual(1024)
    expect(Math.abs(tip!.y + tip!.height / 2 - (anchor!.y + anchor!.height / 2))).toBeLessThan(40)
    await page.keyboard.press('Enter')
    await expect(selector(page)).toBeVisible()
    const box = (await selector(page).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(1024)
    expect(box.y + box.height).toBeLessThanOrEqual(800)
  })

  test('móvil: cada fila del drawer se anuncia como la del menú de escritorio: el espacio es su nombre y el rol su descripción', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await card(page).click()
    const group = page.getByRole('group', { name: 'Cambiar de espacio' })
    const rows = [
      ['Acme Studio', 'Administrador'],
      ['Kora Fitness', 'Administrador'],
      ['Lumen Diseño', 'Agente'],
      ['Norte Viajes', 'Cliente'],
    ] as const
    for (const [name, role] of rows) {
      const row = group.getByRole('button', { name, exact: true })
      await expect(row).toHaveAccessibleName(name)
      await expect(row).toHaveAccessibleDescription(role)
    }
  })

  test('móvil: dentro del drawer se despliega la lista; elegir otro espacio cierra el drawer', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const trigger = card(page)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const group = page.getByRole('group', { name: 'Cambiar de espacio' })
    for (const row of await group.getByRole('button').all()) await expectTouchTarget(row, 390)
    await expect(group.getByRole('link', { name: 'Tus espacios' })).toBeVisible()
    await group.getByRole('button', { name: 'Lumen Diseño', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('dialog', { name: 'Menú principal' })).toBeHidden()
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(card(page)).toContainText('Lumen Diseño')
  })

  test('desde 8 espacios hay «Buscar espacio» y filtra; con 7 no', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: manySpaces(9) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await card(page).click()
    const search = page.getByRole('searchbox', { name: 'Buscar espacio' })
    await expect(search).toBeFocused()
    await page.keyboard.type('Espacio 7')
    await expect(selector(page).getByRole('menuitemradio')).toHaveCount(1)
    await expect(selector(page).getByRole('menuitem', { name: 'Tus espacios' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(selector(page)).toBeHidden()

    await mockApi(page, 'admin', { organizations: manySpaces(7) })
    await page.reload()
    await card(page).click()
    await expect(selector(page).getByRole('menuitemradio')).toHaveCount(7)
    await expect(page.getByRole('searchbox', { name: 'Buscar espacio' })).toHaveCount(0)
  })

  test('móvil: con 8 espacios o más, Escape en el buscador del drawer borra el texto y solo el segundo cierra el drawer', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: manySpaces(9) })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    const drawer = page.getByRole('dialog', { name: 'Menú principal' })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await card(page).click()
    const group = page.getByRole('group', { name: 'Cambiar de espacio' })
    const search = group.getByRole('searchbox', { name: 'Buscar espacio' })
    await search.fill('Espacio 7')
    await expect(group.getByRole('button', { name: /^Espacio 7,/ })).toHaveCount(1)
    // El primer Escape solo vacía el campo: ni el drawer ni la lista se cierran.
    await search.press('Escape')
    await expect(search).toHaveValue('')
    await expect(drawer).toBeVisible()
    await expect(group).toBeVisible()
    // Con el campo vacío, Escape cierra el drawer y el foco vuelve al botón del menú.
    await search.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
  })

  for (const theme of themes) {
    test(`móvil: el texto escrito en «Buscar espacio» del drawer se lee sobre el campo · ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await mockApi(page, 'admin', { organizations: manySpaces(9) })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/tickets')
      await page.getByRole('button', { name: 'Abrir menú' }).click()
      await card(page).click()
      const search = page
        .getByRole('group', { name: 'Cambiar de espacio' })
        .getByRole('searchbox', { name: 'Buscar espacio' })
      await search.fill('Espacio 7')
      // El drawer es una banda oscura con texto claro: el campo (`--color-surface`) no debe heredarlo.
      const ratio = await search.evaluate((input) => {
        const channels = (value: string) =>
          value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((value) => {
            const c = value / 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
        }
        const style = getComputedStyle(input)
        const [a, b] = [luminance(channels(style.color)), luminance(channels(style.backgroundColor))]
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
      expect(ratio, 'contraste del texto escrito').toBeGreaterThanOrEqual(4.5)
    })
  }

  test('un cliente con un solo espacio no tiene selector; con dos, solo cambia', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(page.getByText('Soporte', { exact: true }).first()).toBeVisible()
    await expect(card(page)).toHaveCount(0)

    const twoSpaces = [{ ...lumen, role: 'customer' as const, memberCount: null }, norte]
    await mockApi(page, 'customer', { organizations: twoSpaces })
    await page.reload()
    await card(page).click()
    await expect(selector(page).getByRole('menuitemradio')).toHaveCount(2)
    await expect(selector(page).getByRole('menuitem')).toHaveCount(0)
  })

  test('sin saltos de layout: la tarjeta del espacio ocupa su sitio mientras /me carga y la navegación no se mueve al llegar', async ({
    page,
  }) => {
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/me', async (route) => {
        await gate
        await route.fallback()
      })
      await page.goto('/tickets')
      // La tarjeta es el elemento justo antes de la navegación; la navegación solo se mide arriba y de ancho: sus enlaces
      // llegan con el rol (a propósito), pero no mueven nada de lo que tiene encima.
      const nav = page.getByRole('navigation', { name: 'Principal' })
      const workspace = nav.locator('xpath=preceding-sibling::*[1]')
      await expect(workspace).toBeVisible()
      const measure = async () => {
        const [cardBox, navBox] = await Promise.all([workspace.boundingBox(), nav.boundingBox()])
        return { card: cardBox, nav: { x: navBox!.x, y: navBox!.y, width: navBox!.width } }
      }
      const before = await measure()
      const loaded = page.waitForResponse('**/api/me')
      release()
      await loaded
      await expect(card(page)).toBeVisible()
      expect(await measure()).toEqual(before)
      await page.unroute('**/api/me')
    }
  })
})

test.describe('Configuración › Tus espacios', () => {
  for (const theme of themes) {
    test(`escritorio: lista los espacios con tu rol; el cliente no tiene «Salir» · ${theme}`, async ({ page }) => {
      await mockApi(page, 'admin', { organizations: spaces, createdIn: demoCreatedIn })
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/configuracion/general')
      await page.getByRole('link', { name: /^Tus espacios/ }).click()
      await expect(page).toHaveURL(/\/configuracion\/espacios$/)
      await expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible()
      const rows = page.locator('section[aria-labelledby="workspaces-heading"] li')
      await expect(rows).toHaveCount(4)
      await expect(rows.nth(0)).toContainText('Administrador · 4 personas')
      await expect(rows.nth(0)).toContainText('Estás aquí')
      await expect(rows.nth(1)).toContainText('Administrador · 3 personas')
      await expect(rows.nth(2)).toContainText('Agente · 6 personas')
      await expect(rows.nth(3)).toContainText('Soporte de Norte Viajes')
      await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeVisible()
      await expect(page.getByText('Has creado 2 de 3 espacios.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Salir de Norte Viajes' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Salir de Lumen Diseño' })).toBeEnabled()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('salir de otro espacio: confirma, avisa, actualiza la lista y deja el foco en el título', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    await page.getByRole('button', { name: 'Salir de Lumen Diseño' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await expect(dialog).toContainText('Para volver, un administrador tendrá que invitarte.')
    await expect(dialog).toContainText('Los tickets que tengas asignados quedarán sin asignar.')
    // El foco queda atrapado en el diálogo.
    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press('Tab')
      // Dentro del diálogo, o en ninguna parte de la página (el resto está inerte): nunca en el contenido de detrás.
      expect(
        await dialog.evaluate(
          (node) => node.contains(document.activeElement) || document.activeElement === document.body,
        ),
      ).toBe(true)
    }
    const request = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/me/organizations/'))
    await dialog.getByRole('button', { name: 'Salir del espacio' }).click()
    expect((await request).headers()['x-organization-id']).toBe(acme.id)
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Saliste de Lumen Diseño')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Salir de Lumen Diseño' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeFocused()
    // El selector ya no lo ofrece.
    await card(page).click()
    await expect(selector(page).getByRole('menuitemradio')).toHaveCount(3)
  })

  test('cancelar no sale y devuelve el foco al botón «Salir»; Escape también', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    const leave = page.getByRole('button', { name: 'Salir de Lumen Diseño' })
    await leave.click()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(leave).toBeFocused()
    await leave.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(leave).toBeFocused()
  })

  test('el último administrador ve «No puedes salir de …» y «Ir a Equipo» lo lleva allí', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    await page.getByRole('button', { name: 'Salir de Acme Studio' }).click()
    await page
      .getByRole('dialog', { name: '¿Salir de Acme Studio?' })
      .getByRole('button', { name: 'Salir del espacio' })
      .click()
    const blocked = page.getByRole('dialog', { name: 'No puedes salir de Acme Studio' })
    await expect(blocked.getByRole('status')).toContainText('Eres el único administrador')
    await blocked.getByRole('button', { name: 'Ir a Equipo' }).click()
    await expect(page).toHaveURL(/\/equipo$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeVisible()
  })

  test('salir del espacio actual recarga la sesión en otro espacio y vuelve a Inicio', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await card(page).click()
    await selector(page)
      .getByRole('menuitemradio', { name: /^Lumen Diseño/ })
      .click()
    await expect(card(page)).toContainText('Lumen Diseño')
    await page.goto('/configuracion/espacios')
    await page.getByRole('button', { name: 'Salir de Lumen Diseño' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Salir del espacio' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(card(page)).toContainText('Acme Studio')
    await expect(card(page)).toContainText('Administrador')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })

  test('con un solo espacio «Salir» está deshabilitado y dice «Es tu único espacio»', async ({ page }) => {
    await mockApi(page, 'admin')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    const leave = page.getByRole('button', { name: 'Salir de Acme Studio' })
    await expect(leave).toBeDisabled()
    await expect(page.getByText('Es tu único espacio')).toBeVisible()
  })

  test('el servidor, como el real, responde last-organization si se intenta igualmente', async ({ page }) => {
    await mockApi(page, 'admin')
    await page.goto('/configuracion/espacios')
    await expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible()
    const attempt = await page.evaluate(async () => {
      const token = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''
      const me = (await (await fetch('/api/me')).json()) as { organization: { id: string } }
      const response = await fetch(`/api/me/organizations/${me.organization.id}`, {
        method: 'DELETE',
        headers: { 'X-XSRF-TOKEN': token, 'X-Organization-Id': me.organization.id },
      })
      return { status: response.status, type: ((await response.json()) as { type: string }).type }
    })
    expect(attempt).toEqual({ status: 409, type: 'https://resolve.example/problems/last-organization' })
  })

  test('un cliente no tiene la sección: su ruta da el estado sin permisos y no está en la navegación', async ({
    page,
  }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible()
    await expect(page.getByRole('link', { name: /^Tus espacios/ })).toHaveCount(0)
  })

  test('en la demostración, quien pasa a «Norte Viajes» es cliente: sin «Tus espacios» en el selector', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await card(page).click()
    await selector(page)
      .getByRole('menuitemradio', { name: /^Norte Viajes/ })
      .click()
    await expect(card(page)).toContainText('Soporte')
    await card(page).click()
    await expect(selector(page).getByRole('menuitem', { name: 'Tus espacios' })).toHaveCount(0)
    await expect(selector(page).getByRole('separator')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  })

  test('móvil: toda la fila abre el espacio y «⋯» abre una hoja con las acciones', async ({ page }) => {
    await mockApi(page, 'admin', { organizations: spaces })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/configuracion/espacios')
    await expect(page.getByText('Toca un espacio para abrirlo.')).toBeVisible()
    const more = page.getByRole('button', { name: 'Más acciones para Lumen Diseño' })
    await expectTouchTarget(more, 390)
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'Lumen Diseño' })
    await expect(sheet).toBeVisible()
    // Hoja inferior: pegada al borde de abajo y a todo el ancho.
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!
        return [box.x, box.width, Math.round(box.y + box.height)]
      })
      .toEqual([0, 390, 844])
    for (const control of await sheet.getByRole('button').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(sheet.getByRole('button', { name: 'Abrir Lumen Diseño' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(more).toBeFocused()

    await more.click()
    await sheet.getByRole('button', { name: 'Salir del espacio' }).click()
    const confirm = page.getByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await expect
      .poll(async () => {
        const box = (await confirm.boundingBox())!
        return [box.x, box.width, Math.round(box.y + box.height)]
      })
      .toEqual([0, 390, 844])
    await confirm.getByRole('button', { name: 'Salir del espacio' }).click()
    await expect(page.getByRole('button', { name: 'Más acciones para Lumen Diseño' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Tus espacios' })).toBeFocused()

    // En Norte Viajes eres cliente: el resumen del personal no existe y la app abre sus solicitudes.
    await page.getByRole('button', { name: /^Norte Viajes/ }).click()
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible()
  })

  for (const theme of themes) {
    for (const width of widths) {
      test(`nombres de 120 caracteres caben, sin scroll horizontal ni textos cortados · ${theme} · ${width}px`, async ({
        page,
      }) => {
        const long: OrganizationRef[] = spaces.map((space) => ({ ...space, name: longName(space.name) }))
        await mockApi(page, 'admin', { organizations: long })
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/configuracion/espacios')
        await expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible()
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        const rows = page.locator('section[aria-labelledby="workspaces-heading"] li')
        await expect(rows).toHaveCount(4)
        for (const row of await rows.all()) {
          const box = (await row.boundingBox())!
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          // El nombre se parte (`overflow-wrap`), no se corta: su alto crece en lugar de ocultar texto.
          const name = row
            .locator('span')
            .filter({ hasText: /^.{100,}$/ })
            .first()
          expect(await name.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          if (width < 768)
            for (const button of await row.getByRole('button').all()) await expectTouchTarget(button, width)
          else
            for (const button of await row.getByRole('button').all()) {
              const buttonBox = (await button.boundingBox())!
              expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(width)
            }
        }
      })
    }
  }
})

test.describe('modo abierto (`resolve.organizations.creation: open`): quién ve «Crear espacio»', () => {
  const customerSpaces = [{ ...lumen, role: 'customer' as const, memberCount: null }, norte]

  test('un agente lo ve en el selector y en «Tus espacios»; con la instalación cerrada, no', async ({ page }) => {
    await mockApi(page, 'agent', { creation: 'open' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await card(page).click()
    await expect(selector(page).getByRole('menuitem', { name: 'Crear espacio' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto('/configuracion/espacios')
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeVisible()

    // En el drawer móvil también: el predicado es el mismo, pero una regresión solo ahí no se vería.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await card(page).click()
    await expect(
      page.getByRole('group', { name: 'Cambiar de espacio' }).getByRole('button', { name: 'Crear espacio' }),
    ).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })

    await mockApi(page, 'agent', { creation: 'admins' })
    await page.goto('/configuracion/espacios')
    await expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)
  })

  test('un cliente no lo ve, aunque la sesión diga que puede crear: ni en el selector ni en el drawer', async ({
    page,
  }) => {
    await mockApi(page, 'customer', { creation: 'open', organizations: customerSpaces })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const allowed = await page.evaluate(
      async () =>
        ((await (await fetch('/api/me')).json()) as { organizationCreation: { allowed: boolean } })
          .organizationCreation,
    )
    expect(allowed.allowed, 'el servidor dice que puede crear: es la interfaz la que no lo ofrece').toBe(true)
    await card(page).click()
    await expect(selector(page).getByRole('menuitemradio')).toHaveCount(2)
    await expect(selector(page).getByRole('menuitem')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await card(page).click()
    const group = page.getByRole('group', { name: 'Cambiar de espacio' })
    await expect(group.getByRole('button')).toHaveCount(2)
    await expect(group.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)
  })
})
