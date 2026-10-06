import type { Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'
import { acme, CSRF_TOKEN, northwind } from './mocks/session'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const

const account = (page: Page) => page.getByRole('button', { name: /^Cuenta:/ })
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('sin sesión', () => {
  test('una ruta protegida lleva a /entrar y «Entrar con tu cuenta» completa el inicio de sesión', async ({ page }) => {
    await mockApi(page, 'admin', { signedIn: false })
    await page.goto('/tickets/1048')
    await expect(page).toHaveURL(/\/entrar$/)
    const heading = page.getByRole('heading', { level: 1, name: 'Entra a Resolve' })
    await expect(heading).toBeFocused()

    await page.getByRole('button', { name: 'Entrar con tu cuenta' }).click()
    // El proveedor simulado devuelve a la aplicación con sesión y /entrar nunca queda como destino.
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
    await expect(account(page)).toBeVisible()
  })

  test('el build de producción no ofrece el usuario de demostración', async ({ page }) => {
    await mockApi(page, 'admin', { signedIn: false })
    await page.goto('/entrar')
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByText('Demostración')).toHaveCount(0)
  })

  test('con ?error=oidc anuncia el fallo del proveedor', async ({ page }) => {
    await mockApi(page, 'admin', { signedIn: false })
    await page.goto('/entrar?error=oidc')
    await expect(page.getByRole('alert')).toContainText('No pudimos iniciar sesión')
  })

  for (const theme of themes) {
    for (const width of widths) {
      test(`/entrar sin desbordamiento ni controles pequeños · ${theme} · ${width}px`, async ({ page }) => {
        await mockApi(page, 'admin', { signedIn: false })
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 700 })
        await page.goto('/entrar')
        const button = page.getByRole('button', { name: 'Entrar con tu cuenta' })
        await expect(button).toBeVisible()
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        const box = await button.boundingBox()
        const card = await page.getByRole('heading', { level: 1 }).boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 40)
        expect(card!.x).toBeGreaterThanOrEqual(0)
        expect(card!.x + card!.width).toBeLessThanOrEqual(width)
      })
    }
  }
})

/** Retiene GET /me hasta que se llama a `release`: lo que se mide antes es el estado de carga. */
async function holdMe(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/me', async (route) => {
    await gate
    await route.fallback()
  })
  return release
}

test.describe('sin saltos de layout al llegar /me', () => {
  for (const width of [320, 390, 768, 1440]) {
    test(`la barra superior no se mueve · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      const release = await holdMe(page)
      await page.goto('/tickets')
      const theme = page.getByRole('button', { name: /^Cambiar a tema/ })
      await expect(theme).toBeVisible()
      const [before, headerBefore] = await Promise.all([theme.boundingBox(), page.getByRole('banner').boundingBox()])
      release()
      await expect(account(page)).toBeVisible()
      const [after, headerAfter] = await Promise.all([theme.boundingBox(), page.getByRole('banner').boundingBox()])
      expect(after).toEqual(before)
      expect(headerAfter).toEqual(headerBefore)
    })

    test(`/entrar no mueve la tarjeta al terminar la comprobación · ${width}px`, async ({ page }) => {
      await mockApi(page, 'admin', { signedIn: false })
      await page.setViewportSize({ width, height: 800 })
      const release = await holdMe(page)
      await page.goto('/entrar')
      const card = page.locator('main > div')
      await expect(page.getByText('Comprobando tu sesión…')).toBeAttached()
      const before = await card.boundingBox()
      release()
      await expect(page.getByRole('button', { name: 'Entrar con tu cuenta' })).toBeVisible()
      expect(await card.boundingBox()).toEqual(before)
    })
  }
})

test.describe('cuenta sin membresía', () => {
  test('/entrar la explica por el tipo del problema y deja cerrar sesión', async ({ page }) => {
    await mockApi(page, 'admin', { refused: 'no-membership' })
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('alert')).toContainText('no pertenece a ninguna organización')
    await expect(page.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' })).toBeVisible()
  })
})

test.describe('cuenta desactivada', () => {
  test('/entrar explica el motivo y deja cerrar sesión para entrar con otra cuenta', async ({ page }) => {
    await mockApi(page, 'admin', { refused: 'access-deactivated' })
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('alert')).toContainText('Tu acceso a esta organización fue desactivado')

    const logout = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/logout'),
    )
    await page.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' }).click()
    expect((await logout).headers()['x-xsrf-token']).toBe(CSRF_TOKEN)
    // El proveedor devuelve a /entrar ya sin sesión: sin motivo y sin botón de cerrar sesión.
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeFocused()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Cerrar sesión/ })).toHaveCount(0)
  })

  for (const refused of ['access-deactivated', 'no-membership'] as const) {
    for (const theme of themes) {
      for (const width of widths) {
        test(`el motivo y el botón caben · ${refused} · ${theme} · ${width}px`, async ({ page }) => {
          await mockApi(page, 'admin', { refused })
          await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
          await page.setViewportSize({ width, height: 700 })
          await page.goto('/entrar')
          const alert = page.getByRole('alert')
          const signOut = page.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' })
          await expect(signOut).toBeVisible()
          const [alertBox, buttonBox] = await Promise.all([alert.boundingBox(), signOut.boundingBox()])
          expect(buttonBox!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 40)
          for (const rect of [alertBox!, buttonBox!]) {
            expect(rect.x).toBeGreaterThanOrEqual(0)
            expect(rect.x + rect.width).toBeLessThanOrEqual(width)
          }
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
          await signOut.focus()
          await expect(signOut).toBeFocused()
        })
      }
    }
  }
})

test.describe('cerrar sesión', () => {
  test('envía el token CSRF, navega a la URL del proveedor y deja la pantalla de entrada', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const logout = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/logout'),
    )
    await account(page).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    expect((await logout).headers()['x-xsrf-token']).toBe(CSRF_TOKEN)
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  })

  test('si la cookie de CSRF falta, relee /me y reintenta la escritura una sola vez', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(account(page)).toBeVisible()
    await context.clearCookies()
    const logouts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/logout')) logouts.push(request.url())
    })
    await account(page).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    expect(logouts).toHaveLength(2)
  })
})

test.describe('sesión caducada durante una escritura', () => {
  test('un 401 al enviar una respuesta conserva el borrador, avisa y permite volver a entrar sin recargar', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.route('**/api/tickets/1048/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 401,
            contentType: 'application/problem+json',
            body: JSON.stringify({ status: 401, title: 'No autenticado' }),
          })
        : route.fallback(),
    )
    await page.goto('/tickets/1048')
    const reply = page.getByRole('textbox', { name: 'Respuesta al cliente' })
    await reply.fill('Respuesta que no debe perderse')
    const before = await reply.boundingBox()
    await page.getByRole('button', { name: 'Enviar respuesta' }).click()

    const notice = page.getByRole('region', { name: 'Notificaciones' })
    await expect(notice.getByText('Tu sesión caducó')).toBeVisible()
    await expect(reply).toHaveValue('Respuesta que no debe perderse')
    expect(await reply.boundingBox()).toEqual(before)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    // «Volver a entrar» abre el proveedor en otra pestaña; esta conserva la pantalla y el borrador.
    const popup = context.waitForEvent('page')
    await notice.getByRole('button', { name: 'Volver a entrar' }).click()
    const login = await popup
    await login.waitForURL(/\/$/)
    await login.close()
    await expect(page).toHaveURL(/\/tickets\/1048$/)
    await expect(reply).toHaveValue('Respuesta que no debe perderse')

    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(notice.getByText('Tu sesión caducó')).toHaveCount(0)
  })

  for (const theme of themes) {
    for (const width of [320, 390, 768, 1440]) {
      test(`el aviso cabe y «Volver a entrar» es pulsable · ${theme} · ${width}px`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 700 })
        await page.route('**/api/tickets/1048/messages', (route) =>
          route.request().method() === 'POST'
            ? route.fulfill({
                status: 401,
                contentType: 'application/problem+json',
                body: '{"status":401,"title":"x"}',
              })
            : route.fallback(),
        )
        await page.goto('/tickets/1048')
        await page.getByRole('textbox', { name: 'Respuesta al cliente' }).fill('Hola')
        await page.getByRole('button', { name: 'Enviar respuesta' }).click()
        const notice = page.getByRole('region', { name: 'Notificaciones' })
        const action = notice.getByRole('button', { name: 'Volver a entrar' })
        await expect(action).toBeVisible()
        const [box, region] = await Promise.all([
          action.boundingBox(),
          notice.getByText('Tu sesión caducó').boundingBox(),
        ])
        expect(box!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 40)
        for (const rect of [box!, region!]) {
          expect(rect.x).toBeGreaterThanOrEqual(0)
          expect(rect.x + rect.width).toBeLessThanOrEqual(width)
          expect(rect.y + rect.height).toBeLessThanOrEqual(700)
        }
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        // Con teclado se llega al botón.
        await action.focus()
        await expect(action).toBeFocused()
      })
    }
  }

  test('el aviso persiste más allá de la duración de un toast normal', async ({ page }) => {
    await page.clock.install()
    await page.route('**/api/tickets/1048/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"status":401,"title":"x"}' })
        : route.fallback(),
    )
    await page.goto('/tickets/1048')
    await page.getByRole('textbox', { name: 'Respuesta al cliente' }).fill('Hola')
    await page.getByRole('button', { name: 'Enviar respuesta' }).click()
    const notice = page.getByRole('region', { name: 'Notificaciones' })
    await expect(notice.getByText('Tu sesión caducó')).toBeVisible()
    await page.clock.fastForward(10 * 60 * 1000)
    await expect(notice.getByText('Tu sesión caducó')).toBeVisible()
  })
})

test.describe('varias pestañas', () => {
  /** Cambia de organización desde el menú de la pestaña `tab`. */
  async function switchToNorthwind(tab: Page) {
    await account(tab).click()
    await tab.getByRole('menuitem', { name: /Cambiar de organización/ }).click()
    const dialog = tab.getByRole('dialog', { name: 'Cambiar de organización' })
    await dialog.getByRole('radio', { name: 'Northwind' }).check()
    await dialog.getByRole('button', { name: 'Cambiar de organización' }).click()
    await expect(tab.getByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeVisible()
  }

  test('cambiar de organización en una pestaña actualiza la otra, sin recargar, antes de que se pueda escribir', async ({
    page,
    context,
  }) => {
    await mockApi(page, 'admin', { organizations: [acme, northwind] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1048')
    const reply = page.getByRole('textbox', { name: 'Respuesta al cliente' })
    await reply.fill('Borrador de Acme')
    await expect(account(page)).toHaveAccessibleName('Cuenta: Yelisson Ortiz, Acme Studio')

    const other = await context.newPage()
    await other.setViewportSize({ width: 1440, height: 900 })
    await other.goto('/')
    await switchToNorthwind(other)

    // La pestaña original no se recargó: se entera por el canal, descarta lo suyo y avisa.
    await expect(page.getByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText(
      'Cambiaste a Northwind en otra pestaña',
    )
    expect(await page.evaluate(() => sessionStorage.getItem('resolve-draft-1048'))).toBeNull()
  })

  test('sin BroadcastChannel, la otra pestaña se entera al recuperar el foco', async ({ page, context }) => {
    await context.addInitScript(() => Object.assign(window, { BroadcastChannel: undefined }))
    await mockApi(page, 'admin', { organizations: [acme, northwind] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1048')
    await expect(account(page)).toHaveAccessibleName('Cuenta: Yelisson Ortiz, Acme Studio')

    const other = await context.newPage()
    await other.goto('/')
    await switchToNorthwind(other)
    // Sin canal no hay aviso: la pestaña original sigue con la etiqueta anterior hasta que recupera el foco.
    await expect(account(page)).toHaveAccessibleName('Cuenta: Yelisson Ortiz, Acme Studio')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('sin canal, una escritura que sale con la comprobación en vuelo no llega a la organización nueva', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => Object.assign(window, { BroadcastChannel: undefined }))
    await mockApi(page, 'admin', { organizations: [acme, northwind] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1048')
    const reply = page.getByRole('textbox', { name: 'Respuesta al cliente' })
    await reply.fill('Respuesta para Acme')

    const other = await context.newPage()
    await other.goto('/')
    await switchToNorthwind(other)

    // La pestaña original recupera el foco y el clic en «Enviar» llega con la lectura de /me aún en vuelo.
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/messages')) posts.push(request.url())
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/me', async (route) => {
      await gate
      await route.fallback()
    })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('button', { name: 'Enviar respuesta' }).click()
    await page.waitForTimeout(300)
    expect(posts).toEqual([])
    release()

    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText(
      'Cambiaste a Northwind en otra pestaña',
    )
    expect(posts).toEqual([])
  })

  test('sin canal ni foco, la escritura con la organización vieja recibe el 409 del servidor y la pestaña se pone al día', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => Object.assign(window, { BroadcastChannel: undefined }))
    await mockApi(page, 'admin', { organizations: [acme, northwind] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1048')
    const reply = page.getByRole('textbox', { name: 'Respuesta al cliente' })
    await reply.fill('Respuesta para Acme')

    const other = await context.newPage()
    await other.goto('/')
    await switchToNorthwind(other)
    // Sin canal y sin foco, esta pestaña no sabe nada: sigue mostrando Acme y deja enviar.
    await expect(account(page)).toHaveAccessibleName('Cuenta: Yelisson Ortiz, Acme Studio')

    const post = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/messages'))
    await page.getByRole('button', { name: 'Enviar respuesta' }).click()
    expect((await post).headers()['x-organization-id']).toBe(acme.id)

    // El servidor la rechazó sin escribir nada y la pestaña se puso al día como en cualquier otro cambio de sesión.
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText(
      'Cambiaste a Northwind en otra pestaña',
    )
    await expect(account(page)).toHaveAccessibleName('Cuenta: Yelisson Ortiz, Northwind')
    await expect(page).toHaveURL(/\/$/)
    expect(await page.evaluate(() => sessionStorage.getItem('resolve-draft-1048'))).toBeNull()
  })

  test('cerrar sesión en una pestaña lleva la otra a /entrar', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(account(page)).toBeVisible()
    const other = await context.newPage()
    await other.goto('/tickets')
    await account(other).click()
    await other.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(other).toHaveURL(/\/entrar$/)
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  })

  test('entrar en otra pestaña saca de /entrar a la que esperaba', async ({ page, context }) => {
    await mockApi(page, 'admin', { signedIn: false })
    await page.goto('/entrar')
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
    const other = await context.newPage()
    await other.goto('/api/oauth2/authorization/resolve')
    await expect(other).toHaveURL(/\/$/)
    await expect(page).toHaveURL(/\/$/)
    await expect(account(page)).toBeVisible()
  })
})

test.describe('menú de la cuenta', () => {
  test('con teclado: Enter abre el menú, Escape lo cierra y el foco vuelve al botón', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const button = account(page)
    await button.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Cuenta' })
    await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(button).toBeFocused()
  })

  for (const theme of themes) {
    for (const width of widths) {
      test(`botón, menú y diálogo caben con nombres de 120 caracteres · ${theme} · ${width}px`, async ({ page }) => {
        await mockApi(page, 'admin', { organizations: [acme, northwind], longNames: true })
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        const button = account(page)
        await expect(button).toBeVisible()
        const box = await button.boundingBox()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

        await button.click()
        const menu = page.getByRole('menu', { name: 'Cuenta' })
        await expect(menu).toBeVisible()
        const menuBox = await menu.boundingBox()
        expect(menuBox!.x).toBeGreaterThanOrEqual(0)
        expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width)
        for (const item of await menu.getByRole('menuitem').all()) {
          const itemBox = await item.boundingBox()
          expect(itemBox!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 32)
          expect(await item.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        }

        await menu.getByRole('menuitem', { name: /Cambiar de organización/ }).click()
        const dialog = page.getByRole('dialog', { name: 'Cambiar de organización' })
        await expect(dialog).toBeVisible()
        const dialogBox = await dialog.boundingBox()
        expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
        expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width)
        expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(800)
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
        for (const radio of await dialog.getByRole('radio').all()) {
          const label = radio.locator('xpath=ancestor::label')
          expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 20)
          expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        }
      })
    }
  }

  test('cambiar de organización vuelve al resumen, muestra la nueva y deja el foco en un sitio con sentido', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { organizations: [acme, northwind] })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets/1048')
    await account(page).click()
    await page.getByRole('menuitem', { name: /Cambiar de organización/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Cambiar de organización' })
    await expect(dialog.getByRole('radio', { name: 'Acme Studio (actual)' })).toBeChecked()
    await dialog.getByRole('radio', { name: 'Northwind' }).check()
    await dialog.getByRole('button', { name: 'Cambiar de organización' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Ahora trabajas en Northwind')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })

  test('con una sola organización el menú solo ofrece cerrar sesión', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await account(page).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Cerrar sesión'])
  })
})
