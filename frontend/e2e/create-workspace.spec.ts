import type { Locator, Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'
import { demoCreatedIn, demoWorkspaces } from './mocks/session'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const

/** El administrador de la demostración: cuatro espacios, dos de ellos creados por él (2 de 3). */
const demoAdmin = { organizations: demoWorkspaces.admin!, createdIn: demoCreatedIn }

const card = (page: Page) => page.getByRole('button', { name: /^Espacio: .*\. Cambiar de espacio$/ })
const selector = (page: Page) => page.getByRole('menu', { name: 'Cambiar de espacio' })
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Crear espacio' })
const toasts = (page: Page) => page.getByRole('region', { name: 'Notificaciones' })
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const longName = `Taller de diseño ${'muy largo '.repeat(12)}`.slice(0, 119).trimEnd() + 'x'

// La zona del navegador es el valor por defecto del diálogo: se fija para que no dependa de la máquina.
test.use({ timezoneId: 'Europe/Madrid' })

async function openFromSelector(page: Page) {
  await card(page).click()
  await selector(page).getByRole('menuitem', { name: 'Crear espacio' }).click()
  const dialog = dialogOf(page)
  await expect(dialog).toBeVisible()
  return dialog
}

async function expectTouchTarget(locator: Locator, width: number) {
  const box = (await locator.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

test.describe('Crear espacio · escritorio', () => {
  test('crea un espacio: nombre y zona del navegador, entra en él, avisa y enseña «Primeros pasos»', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const dialog = await openFromSelector(page)
    await expect(dialog.getByText(/Serás su administrador/)).toBeVisible()
    // La zona por defecto es la del navegador, con su nombre legible y su desfase.
    const zone = dialog.getByRole('combobox', { name: 'Zona horaria' })
    await expect(zone).toHaveValue('Europe/Madrid')
    await expect(zone.locator('option:checked')).toHaveText(/Madrid \(GMT\+\d/)
    const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/organizations'))
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('  Lumen Taller  ')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    expect((await request).postDataJSON()).toEqual({ name: 'Lumen Taller', timeZone: 'Europe/Madrid' })

    await expect(page).toHaveURL(/\/$/)
    await expect(dialog).toBeHidden()
    await expect(toasts(page)).toContainText('Ya estás en Lumen Taller')
    await expect(card(page)).toContainText('Lumen Taller')
    await expect(card(page)).toContainText('Administrador')
    // El foco no queda en `body`: va al contenido de la página nueva.
    await expect(page.locator('#contenido')).toBeFocused()

    const panel = page.getByRole('region', { name: 'Primeros pasos' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('status')).toHaveText('1 de 4 hechos')
    await expect(panel.getByRole('listitem')).toHaveText([
      /Crea tu espacio/,
      /Invita a tu equipo\s*Invitar/,
      /Añade tu primer cliente\s*Añadir cliente/,
      /Publica un artículo de ayuda\s*Escribir artículo/,
    ])
    // El primer paso, hecho: tachado y con su marca, sin depender del color.
    const done = panel.getByRole('listitem').first()
    expect(
      await done
        .locator('span')
        .filter({ hasText: 'Crea tu espacio' })
        .evaluate((n) => getComputedStyle(n).textDecorationLine),
    ).toBe('line-through')
    await expect(done.locator('svg')).toHaveCount(1)
  })

  test('«Primeros pasos» no empuja la página: nada se mueve al llegar y la franja de métricas queda donde estaba', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const dialog = await openFromSelector(page)
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Taller')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    const panel = page.getByRole('region', { name: 'Primeros pasos' })
    await expect(panel).toBeVisible()
    const strip = page.getByRole('group', { name: 'Así va el soporte hoy' })
    await expect(strip).toBeVisible()
    const before = [(await panel.boundingBox())!.y, (await strip.boundingBox())!.y]
    await page.waitForTimeout(800)
    expect([(await panel.boundingBox())!.y, (await strip.boundingBox())!.y]).toEqual(before)
  })

  test('invitar y añadir un cliente hacen su paso de verdad, sin botón y con el recuento al día; «Escribir artículo» lleva al editor', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const dialog = await openFromSelector(page)
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Taller')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    const panel = page.getByRole('region', { name: 'Primeros pasos' })
    await expect(panel).toBeVisible()

    // Invitar: el diálogo de Equipo se abre sin salir de Inicio.
    await panel.getByRole('button', { name: 'Invitar' }).click()
    const invite = page.getByRole('dialog', { name: 'Invitar agente' })
    await invite.getByRole('textbox', { name: 'Correo' }).fill('nueva@taller.example')
    await invite.getByRole('button', { name: 'Invitar' }).click()
    await expect(invite).toBeHidden()
    await expect(page).toHaveURL(/\/$/)
    await expect(panel.getByRole('status')).toHaveText('2 de 4 hechos')
    await expect(panel.getByRole('button', { name: 'Invitar' })).toHaveCount(0)
    await expect(panel.getByText('Invita a tu equipo (hecho)')).toBeAttached()
    // El botón desapareció con su paso: el foco pasa al título del panel.
    await expect(panel.getByRole('heading', { name: 'Primeros pasos' })).toBeFocused()

    // Añadir cliente: abre el alta de Clientes; al crearlo y volver a Inicio el paso consta.
    await panel.getByRole('link', { name: 'Añadir cliente' }).click()
    await expect(page).toHaveURL(/\/clientes\/nuevo$/)
    const customer = page.getByRole('dialog', { name: 'Nuevo cliente' })
    await customer.getByRole('textbox', { name: 'Nombre' }).fill('Cliente Uno')
    await customer.getByRole('textbox', { name: 'Correo' }).fill('uno@cliente.example')
    await customer.getByRole('button', { name: 'Crear cliente' }).click()
    await expect(page).toHaveURL(/\/clientes\/c-nuevo-1$/)
    await page.getByRole('link', { name: 'Inicio', exact: true }).first().click()
    await expect(panel.getByRole('status')).toHaveText('3 de 4 hechos')

    // Escribir artículo: lleva al editor.
    await panel.getByRole('link', { name: 'Escribir artículo' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/nuevo$/)
  })

  test('un espacio con la instalación ya en marcha, o el agente, no ven «Primeros pasos»', async ({ page }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('group', { name: 'Así va el soporte hoy' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)
    await mockApi(page, 'agent')
    await page.reload()
    await expect(page.getByRole('group', { name: 'Así va el soporte hoy' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)
  })
})

test.describe('Crear espacio · errores y límite', () => {
  test('sin nombre el error va bajo su campo, anunciado, y no se envía nada', async ({ page }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    let posts = 0
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/organizations')) posts += 1
    })
    const dialog = await openFromSelector(page)
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    const name = dialog.getByRole('textbox', { name: 'Nombre del espacio' })
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()
    await expect(dialog.getByRole('alert')).toHaveText('Escribe un nombre para el espacio.')
    await expect(name).toHaveAccessibleDescription(/Escribe un nombre para el espacio\./)
    expect(posts).toBe(0)
  })

  test('un 400 del servidor sobre la zona va bajo su campo, anunciado y con el foco, y el diálogo sigue abierto', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const dialog = await openFromSelector(page)
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Taller')
    await dialog.getByRole('combobox', { name: 'Zona horaria' }).selectOption('Pacific/Honolulu')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    const zone = dialog.getByRole('combobox', { name: 'Zona horaria' })
    await expect(zone).toHaveAttribute('aria-invalid', 'true')
    await expect(zone).toBeFocused()
    await expect(dialog.getByRole('alert')).toHaveText('Zona horaria no reconocida por el servidor.')
    await expect(dialog).toBeVisible()
  })

  test('al llegar al límite desde el diálogo (409) cambia al estado del límite y «Ver tus espacios» lleva a la lista', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    // Otra pestaña creó el tercero: el servidor responde el 409 aunque `Me` aún lo permita.
    await page.route('**/api/organizations', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://resolve.example/problems/organization-limit',
          status: 409,
          title: 'Límite',
        }),
      }),
    )
    const dialog = await openFromSelector(page)
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Otro')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(dialog.getByText('Ya creaste 3 espacios, el máximo por persona.')).toBeVisible()
    await expect(dialog.getByRole('textbox')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Ver tus espacios' }).click()
    await expect(page).toHaveURL(/\/configuracion\/espacios$/)
    await expect(dialog).toBeHidden()
  })

  test('el tercer espacio agota el límite: ya no se ofrece «Crear espacio» y el pie dice «3 de 3»', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/configuracion/espacios')
    await expect(page.getByText('Has creado 2 de 3 espacios.')).toBeVisible()
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    const dialog = dialogOf(page)
    await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Tercero')
    await dialog.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/configuracion/espacios')
    await expect(page.getByText('Has creado 3 de 3 espacios.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)
    await card(page).click()
    await expect(selector(page).getByRole('menuitem', { name: 'Crear espacio' })).toHaveCount(0)
  })
})

test.describe('Crear espacio · teclado', () => {
  test('con teclado: abre desde el selector, el foco queda atrapado, Escape lo cierra y vuelve a la tarjeta', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await card(page).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(selector(page).getByRole('menuitem', { name: 'Crear espacio' })).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = dialogOf(page)
    await expect(dialog).toBeVisible()
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab')
      expect(
        await dialog.evaluate(
          (node) => node.contains(document.activeElement) || document.activeElement === document.body,
        ),
      ).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(card(page)).toBeFocused()
  })
})

test.describe('Crear espacio · quién lo ve', () => {
  test('el agente con un solo espacio no ve «Crear espacio» ni el pie de «Tus espacios»', async ({ page }) => {
    await mockApi(page, 'agent')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await card(page).click()
    await expect(selector(page).getByRole('menuitem')).toHaveText(['Tus espacios'])
    await page.keyboard.press('Escape')
    await page.goto('/configuracion/espacios')
    await expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)
    await expect(page.getByText(/Has creado/)).toHaveCount(0)
  })

  test('el cliente no ve «Crear espacio» en ningún sitio, ni aunque administre otro espacio', async ({ page }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await card(page).click()
    await selector(page)
      .getByRole('menuitemradio', { name: /^Norte Viajes/ })
      .click()
    await expect(card(page)).toContainText('Soporte')
    await card(page).click()
    await expect(selector(page).getByRole('menuitem')).toHaveCount(0)
    await expect(page.getByText('Crear espacio')).toHaveCount(0)
  })
})

test.describe('Crear espacio · móvil', () => {
  test('«Crear» junto al título de «Tus espacios» abre una hoja inferior con controles de 44 px', async ({ page }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/configuracion/espacios')
    const create = page.getByRole('button', { name: 'Crear espacio' })
    await expect(create).toHaveText('Crear')
    await expectTouchTarget(create, 390)
    await expect(page.getByText('Has creado 2 de 3 espacios.')).toBeVisible()
    await create.click()
    const sheet = dialogOf(page)
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!
        return [box.x, box.width, Math.round(box.y + box.height)]
      })
      .toEqual([0, 390, 844])
    for (const control of await sheet.getByRole('button').all()) await expectTouchTarget(control, 390)
    await expectTouchTarget(sheet.getByRole('textbox', { name: 'Nombre del espacio' }), 390)
    await expectTouchTarget(sheet.getByRole('combobox', { name: 'Zona horaria' }), 390)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(create).toBeFocused()
  })

  test('en el drawer, «Crear espacio» abre la hoja sobre el menú y, al crear, cierra el drawer y entra en el espacio', async ({
    page,
  }) => {
    await mockApi(page, 'admin', demoAdmin)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const drawer = page.getByRole('dialog', { name: 'Menú principal' })
    await drawer.getByRole('button', { name: /^Espacio: .*\. Cambiar de espacio$/ }).click()
    await drawer.getByRole('button', { name: 'Crear espacio' }).click()
    const sheet = dialogOf(page)
    await expect(sheet).toBeVisible()
    // Escape cierra solo la hoja: el drawer sigue abierto debajo.
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Crear espacio' }).click()
    await sheet.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Taller')
    await sheet.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(drawer).toBeHidden()
    await expect(toasts(page)).toContainText('Ya estás en Lumen Taller')
    await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })
})

for (const theme of themes) {
  for (const width of widths) {
    test.describe(`Crear espacio · barrido · ${theme} · ${width}px`, () => {
      test('el diálogo, el límite y «Primeros pasos» con un nombre de 120 caracteres caben sin scroll horizontal ni recortes', async ({
        page,
      }) => {
        await mockApi(page, 'admin', demoAdmin)
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/configuracion/espacios')
        const open = page.getByRole('button', { name: 'Crear espacio' })
        await open.click()
        const dialog = dialogOf(page)
        // Con el error visible, que es el estado más alto del formulario.
        await dialog.getByRole('button', { name: 'Crear espacio' }).click()
        await expect(dialog.getByRole('alert')).toBeVisible()
        for (const element of [dialog, ...(await dialog.getByRole('button').all())]) {
          const box = (await element.boundingBox())!
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          expect(box.y + box.height).toBeLessThanOrEqual(900)
        }
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        if (width < 768)
          for (const control of await dialog.getByRole('button').all()) await expectTouchTarget(control, width)

        await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill(longName)
        await dialog.getByRole('button', { name: 'Crear espacio' }).click()
        const panel = page.getByRole('region', { name: 'Primeros pasos' })
        await expect(panel).toBeVisible()
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        const box = (await panel.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        for (const control of await panel.getByRole('button').all()) {
          const controlBox = (await control.boundingBox())!
          expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(width)
          if (width < 768) expect(controlBox.height).toBeGreaterThanOrEqual(44)
        }
        for (const link of await panel.getByRole('link').all()) {
          const linkBox = (await link.boundingBox())!
          expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(width)
          if (width < 768) expect(linkBox.height).toBeGreaterThanOrEqual(44)
        }
      })

      test('el estado del límite cabe', async ({ page }) => {
        await mockApi(page, 'admin', demoAdmin)
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/configuracion/espacios')
        await page.route('**/api/organizations', (route) =>
          route.fulfill({
            status: 409,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'https://resolve.example/problems/organization-limit',
              status: 409,
              title: 'Límite',
            }),
          }),
        )
        await page.getByRole('button', { name: 'Crear espacio' }).click()
        const dialog = dialogOf(page)
        await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill(longName)
        await dialog.getByRole('button', { name: 'Crear espacio' }).click()
        await expect(dialog.getByText('Ya creaste 3 espacios, el máximo por persona.')).toBeVisible()
        for (const element of [dialog, ...(await dialog.getByRole('button').all())]) {
          const box = (await element.boundingBox())!
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          expect(box.y + box.height).toBeLessThanOrEqual(900)
        }
        if (width < 768)
          for (const control of await dialog.getByRole('button').all()) await expectTouchTarget(control, width)
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      })
    })
  }
}
