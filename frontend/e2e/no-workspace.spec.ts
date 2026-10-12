import type { Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'
import { NUEVA_PERSONA, type SessionOptions } from './mocks/session'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const

/** Quien entra sin espacio con la instalación abierta («Crea tu espacio») y con ella cerrada («Aún no estás en ningún espacio»). */
const open: SessionOptions = { refused: 'no-membership', creation: 'open' }
const closed: SessionOptions = { refused: 'no-membership', creation: 'admins' }

const longName = `Nombre de una persona ${'muy largo '.repeat(12)}`.slice(0, 119).trimEnd() + 'x'
const longEmail = `${'persona.con.un.correo.larguisimo'.repeat(4)}@${'dominio'.repeat(3)}.example`.slice(0, 119)
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const toasts = (page: Page) => page.getByRole('region', { name: 'Notificaciones' })
const createHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Crea tu espacio' })
const closedHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Aún no estás en ningún espacio' })

/** El nombre del elemento con el foco: para que un fallo diga dónde estaba. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement
    return active ? `${active.tagName.toLowerCase()}:${active.getAttribute('name') ?? active.textContent}` : 'null'
  })

// La zona del navegador es el valor por defecto del formulario: se fija para que no dependa de la máquina.
test.use({ timezoneId: 'Europe/Madrid' })

test.describe('«Crea tu espacio» · instalación abierta', () => {
  test('recorrido con teclado: de una ruta protegida a Inicio del espacio nuevo, con «Primeros pasos», el aviso y el foco en el contenido', async ({
    page,
  }) => {
    await mockApi(page, 'admin', open)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(createHeading(page)).toBeFocused()
    await expect(page).toHaveTitle('Crea tu espacio · Resolve')
    await expect(page.getByText(/^Hola, Nueva Persona\. Aún no estás en ningún espacio\./)).toBeVisible()
    // Fuera de la shell: sin barra lateral ni cuenta.
    await expect(page.getByRole('navigation')).toHaveCount(0)

    // Tab llega al nombre, a la zona horaria (la del navegador), al botón y, al final, a cambiar de cuenta.
    await page.keyboard.press('Tab')
    const name = page.getByRole('textbox', { name: 'Nombre del espacio' })
    await expect(name, await focused(page)).toBeFocused()
    await page.keyboard.type('Lumen Diseño')
    await page.keyboard.press('Tab')
    const zone = page.getByRole('combobox', { name: 'Zona horaria' })
    await expect(zone).toBeFocused()
    await expect(zone).toHaveValue('Europe/Madrid')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Entrar con otra cuenta' })).toBeFocused()

    // Enter desde el nombre envía el formulario.
    await name.focus()
    const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/organizations'))
    await page.keyboard.press('Enter')
    expect((await request).postDataJSON()).toEqual({ name: 'Lumen Diseño', timeZone: 'Europe/Madrid' })

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible()
    await expect(toasts(page)).toContainText('Ya estás en Lumen Diseño')
    await expect(page.getByRole('button', { name: /^Espacio: Lumen Diseño\./ })).toContainText('Administrador')
    // El formulario desapareció con el foco: va al contenido de Inicio, no a `body`.
    await expect(page.locator('#contenido')).toBeFocused()
  })

  test('sin nombre muestra el error bajo el campo, anunciado, con el foco en él, y no envía nada', async ({ page }) => {
    await mockApi(page, 'admin', open)
    await page.setViewportSize({ width: 1024, height: 800 })
    let posts = 0
    page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/organizations') && posts++)
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    const field = page.getByRole('textbox', { name: 'Nombre del espacio' })
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toBeFocused()
    await expect(page.getByRole('alert')).toHaveText('Escribe un nombre para el espacio.')
    await expect(field).toHaveAccessibleDescription(/Escribe un nombre para el espacio\./)
    expect(posts).toBe(0)
  })

  test('un 400 del servidor va bajo su campo y se puede corregir sin salir de la pantalla', async ({ page }) => {
    await mockApi(page, 'admin', open)
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/entrar')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Taller')
    await page.getByRole('combobox', { name: 'Zona horaria' }).selectOption('Pacific/Honolulu')
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    const zone = page.getByRole('combobox', { name: 'Zona horaria' })
    await expect(zone).toHaveAttribute('aria-invalid', 'true')
    await expect(zone).toBeFocused()
    await expect(page.getByRole('alert')).toHaveText('Zona horaria no reconocida por el servidor.')
    await expect(createHeading(page)).toBeVisible()
    // Corregida la zona, entra.
    await zone.selectOption('Europe/Madrid')
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(toasts(page)).toContainText('Ya estás en Lumen Taller')
  })

  test('un 409 de límite (no debería darse) se avisa sin salir de la pantalla', async ({ page }) => {
    await mockApi(page, 'admin', open)
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
    await page.goto('/entrar')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Otro')
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(page.getByRole('status')).toContainText('Ya creaste el máximo de espacios por persona.')
    await expect(page.getByRole('button', { name: 'Ver tus espacios' })).toHaveCount(0)
    await expect(createHeading(page)).toBeVisible()
    // La relectura de la sesión que sigue al límite no desmonta la pantalla ni borra lo escrito.
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveValue('Otro')
    await expect(page.getByRole('status')).toContainText('Ya creaste el máximo de espacios por persona.')
  })

  test('si la instalación se cierra mientras tanto, la pantalla pasa sola a «Aún no estás en ningún espacio» con el foco en su título', async ({
    page,
  }) => {
    await mockApi(page, 'admin', open)
    await page.goto('/entrar')
    await expect(createHeading(page)).toBeVisible()
    // El servidor cambió de modo: la creación y la relectura de la sesión ya dicen que no se puede crear.
    const refusal = {
      status: 401,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'https://resolve.example/problems/no-membership',
        status: 401,
        title: 'No autenticado',
        canCreateOrganization: false,
        email: NUEVA_PERSONA.email,
        name: NUEVA_PERSONA.name,
      }),
    }
    await page.route('**/api/organizations', (route) => route.fulfill(refusal))
    await page.route('**/api/me', (route) => route.fulfill(refusal))
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Lumen Diseño')
    await page.getByRole('button', { name: 'Crear espacio' }).click()
    await expect(closedHeading(page)).toBeFocused()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByText(NUEVA_PERSONA.email)).toBeVisible()
  })

  test('«Entrar con otra cuenta» cierra la sesión con el token de CSRF y deja la pantalla de entrada', async ({
    page,
  }) => {
    await mockApi(page, 'admin', open)
    await page.goto('/entrar')
    const logout = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/logout'))
    await page.getByRole('button', { name: 'Entrar con otra cuenta' }).click()
    expect((await logout).headers()['x-xsrf-token']).toBe('e2e-csrf-token')
    await expect(page.getByRole('heading', { level: 1, name: 'Entra a Resolve' })).toBeFocused()
  })
})

test.describe('«Aún no estás en ningún espacio» · instalación cerrada', () => {
  test('pide una invitación con el correo, que se puede seleccionar, y deja entrar con otra cuenta', async ({
    page,
  }) => {
    await mockApi(page, 'admin', closed)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(closedHeading(page)).toBeFocused()
    await expect(page).toHaveTitle('Aún no estás en ningún espacio · Resolve')
    await expect(page.getByText('Pide a alguien de tu equipo que te invite con este correo:')).toBeVisible()
    const email = page.getByText(NUEVA_PERSONA.email, { exact: true })
    await expect(email).toBeVisible()
    // Texto, no un control: se puede seleccionar con un triple clic.
    await email.click({ clickCount: 3 })
    expect(await page.evaluate(() => getSelection()?.toString().trim())).toBe(NUEVA_PERSONA.email)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)

    const logout = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/logout'))
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Entrar con otra cuenta' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await logout).headers()['x-xsrf-token']).toBe('e2e-csrf-token')
    await expect(page.getByRole('heading', { level: 1, name: 'Entra a Resolve' })).toBeFocused()
  })
})

test.describe('las dos pantallas caben en todos los anchos y temas', () => {
  const cases = [
    { name: 'abierta', options: open, heading: createHeading },
    { name: 'cerrada', options: closed, heading: closedHeading },
  ]
  for (const { name, options, heading } of cases) {
    for (const theme of themes) {
      for (const width of widths) {
        test(`${name} · ${theme} · ${width}px, con un nombre y un correo de 120 caracteres`, async ({ page }) => {
          await mockApi(page, 'admin', { ...options, identity: { email: longEmail, name: longName } })
          await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
          await page.setViewportSize({ width, height: 700 })
          await page.goto('/entrar')
          await expect(heading(page)).toBeVisible()
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

          // Nada se recorta: ningún elemento de la tarjeta tiene contenido que sobresalga de su caja.
          const clipped = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('main *')]
              .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline')
              .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
          )
          expect(clipped).toEqual([])

          // Todo lo que se pulsa cae dentro del viewport y mide 44 px por debajo de 768.
          const controls = page.locator('main').getByRole('button')
          const fields = page.locator('main').locator('input, select')
          for (const locator of [controls, fields]) {
            for (const control of await locator.all()) {
              const box = (await control.boundingBox())!
              expect(box.x).toBeGreaterThanOrEqual(0)
              expect(box.x + box.width).toBeLessThanOrEqual(width)
              if (width < 768) expect(box.height).toBeGreaterThanOrEqual(44)
            }
          }
          const card = (await page.locator('main > div').boundingBox())!
          expect(card.x).toBeGreaterThanOrEqual(0)
          expect(card.x + card.width).toBeLessThanOrEqual(width)
          // El correo, entero y en pantalla.
          await expect(page.getByText(longEmail, { exact: true })).toBeVisible()
          if (name === 'abierta') await expect(page.getByText(`Hola, ${longName}.`)).toBeVisible()
        })
      }
    }
  }
})

test.describe('sin saltos de layout mientras la pantalla de entrada relee /me', () => {
  for (const { name, options, heading } of [
    { name: 'abierta', options: open, heading: createHeading },
    { name: 'cerrada', options: closed, heading: closedHeading },
  ]) {
    for (const width of [320, 390, 768, 1440]) {
      test(`la tarjeta ${name} no se mueve ni se desmonta durante la relectura · ${width}px`, async ({ page }) => {
        await mockApi(page, 'admin', options)
        await page.setViewportSize({ width, height: 800 })
        // La shell lee /me y, con el 401, lleva a /entrar; la pantalla de entrada lo relee: esa segunda lectura se retiene.
        let reads = 0
        let release!: () => void
        const gate = new Promise<void>((resolve) => (release = resolve))
        await page.route('**/api/me', async (route) => {
          if (++reads > 1) await gate
          await route.fallback()
        })
        await page.goto('/tickets')
        await expect(heading(page)).toBeVisible()
        await expect.poll(() => reads).toBe(2)
        // Con la relectura en vuelo la pantalla sigue ahí, sin el esqueleto de la comprobación.
        await expect(page.getByText('Comprobando tu sesión…')).toHaveCount(0)
        const card = page.locator('main > div')
        const before = await card.boundingBox()
        const reread = page.waitForResponse('**/api/me')
        release()
        await reread
        await expect(heading(page)).toBeVisible()
        expect(await card.boundingBox()).toEqual(before)
      })
    }
  }
})
