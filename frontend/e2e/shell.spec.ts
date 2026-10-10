import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.describe('shell', () => {
  test('móvil: el drawer se abre, atrapa el foco, se cierra con Escape y devuelve el foco', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    const menuButton = page.getByRole('button', { name: 'Abrir menú' })
    await menuButton.click()
    const drawer = page.getByRole('dialog', { name: 'Menú principal' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Resolve, ir al resumen' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(menuButton).toBeFocused()
  })

  test('móvil: el fondo cierra el drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.mouse.click(370, 400)
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  // 390 px solo protege frente a regresiones en la barra móvil (la campana ya estaba oculta ahí); 1024 y 1440 px son
  // los anchos donde la barra no es compacta y la campana se vería.
  for (const width of [390, 1024, 1440]) {
    test(`${width} px: el encabezado no tiene campana de notificaciones`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/tickets')
      await expect(page.getByRole('button', { name: /^Cambiar a tema/ })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Notificaciones' })).toHaveCount(0)
    })
  }

  test('intermedio: menú de iconos con tooltip visible al enfocar', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    const link = page.getByRole('link', { name: 'Clientes' })
    await link.focus()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveText('Clientes')
    const [tip, anchor] = await Promise.all([tooltip.boundingBox(), link.boundingBox()])
    expect(tip!.x).toBeGreaterThan(anchor!.x + anchor!.width)
  })

  test('escritorio: el colapsado se recuerda tras recargar y no afecta al móvil', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Colapsar menú' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expandir menú' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(page.getByRole('dialog').getByText('Acme Studio')).toBeVisible()
  })

  test('el perfil queda dentro del sidebar aunque falte altura', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 480 })
    await page.goto('/tickets')
    const sidebar = page.getByRole('navigation', { name: 'Principal' }).locator('..')
    const profile = sidebar.getByText('Yelisson Ortiz')
    await profile.scrollIntoViewIfNeeded()
    const [box, sidebarBox] = await Promise.all([profile.boundingBox(), sidebar.boundingBox()])
    expect(box!.y + box!.height).toBeLessThanOrEqual(sidebarBox!.y + sidebarBox!.height)
  })

  test('escritorio: el botón de colapsar está junto a la marca y no en el pie', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const brand = page.getByRole('link', { name: 'Resolve, ir al resumen' })
    const toggle = page.getByRole('button', { name: 'Colapsar menú' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const [brandBox, toggleBox, navBox] = await Promise.all([
      brand.boundingBox(),
      toggle.boundingBox(),
      page.getByRole('navigation', { name: 'Principal' }).boundingBox(),
    ])
    expect(toggleBox!.x).toBeGreaterThan(brandBox!.x)
    expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(navBox!.y)
    await toggle.click()
    const expand = page.getByRole('button', { name: 'Expandir menú' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    const [collapsedBrand, collapsedToggle, sidebarWidth] = await Promise.all([
      brand.boundingBox(),
      expand.boundingBox(),
      page.getByRole('navigation', { name: 'Principal' }).evaluate((nav) => nav.parentElement!.clientWidth),
    ])
    // A 76 px solo cabe una columna: el botón queda debajo de la marca, dentro del sidebar.
    expect(collapsedToggle!.y).toBeGreaterThanOrEqual(collapsedBrand!.y + collapsedBrand!.height - 1)
    expect(collapsedToggle!.x + collapsedToggle!.width).toBeLessThanOrEqual(sidebarWidth)
  })

  test('escritorio: el botón de colapsar es el IconButton del paquete con los colores y el foco del sidebar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    const toggle = page.getByRole('button', { name: 'Colapsar menú' })
    const arrows = toggle.locator('svg')
    await expect(arrows).toHaveCount(2)
    const read = () =>
      toggle.evaluate((button) => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--color-nav-text)'
        document.body.append(probe)
        const expected = getComputedStyle(probe).color
        probe.remove()
        const icons = button.firstElementChild!
        return {
          color: getComputedStyle(button).color,
          expected,
          transform: getComputedStyle(icons).transform,
          overlap: getComputedStyle(icons.children[1]!).marginInlineStart,
          size: [button.clientWidth, button.clientHeight],
        }
      })
    // Los colores y el solape son de Resolve y del paquete a la vez: gana la clase de Resolve porque `styles.css` va antes.
    expect(await read()).toEqual({
      color: expect.any(String),
      expected: expect.any(String),
      transform: 'none',
      overlap: '-14px',
      size: [44, 44],
    })
    const { color, expected } = await read()
    expect(color).toBe(expected)
    await page.keyboard.press('Shift')
    await toggle.focus()
    await expect(toggle).toHaveCSS('outline-offset', '-2px')
    await toggle.click()
    const expand = page.getByRole('button', { name: 'Expandir menú' })
    await expect(expand.locator(':scope > span')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)')
  })

  test('escritorio colapsado: al pasar el puntero por varios iconos solo hay una etiqueta visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/tickets')
    for (const name of ['Resumen', 'Tickets', 'Clientes']) {
      await page.getByRole('link', { name, exact: true }).hover()
      // Lectura inmediata, sin reintentos: el cierre retardado de la etiqueta anterior no puede enmascarar la acumulación.
      expect(await page.getByRole('tooltip').count()).toBe(1)
    }
    await expect(page.getByRole('tooltip')).toHaveText('Clientes')
    await page.mouse.move(700, 400)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test.describe('perfil y menú de la cuenta', () => {
    const account = (page: Page) => page.getByRole('button', { name: /^Cuenta:/ })

    test('escritorio: un solo avatar, abajo a la izquierda, y el menú se abre hacia arriba dentro del viewport', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/tickets')
      await expect(account(page)).toHaveCount(1)
      await expect(page.getByRole('banner').getByRole('img', { name: 'Yelisson Ortiz' })).toHaveCount(0)
      await expect(account(page)).toContainText('Yelisson Ortiz')
      await expect(account(page)).toContainText('Administrador')
      await account(page).click()
      const menu = page.getByRole('menu', { name: 'Cuenta' })
      await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeFocused()
      const [trigger, box] = await Promise.all([account(page).boundingBox(), menu.boundingBox()])
      expect(box!.y + box!.height).toBeLessThanOrEqual(trigger!.y)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(account(page)).toBeFocused()
    })

    test('el menú sigue dentro del viewport con poca altura y el sidebar con scroll', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 420 })
      await page.goto('/tickets')
      await account(page).scrollIntoViewIfNeeded()
      await account(page).click()
      const box = (await page.getByRole('menu', { name: 'Cuenta' }).boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(420)
      expect(box.x + box.width).toBeLessThanOrEqual(1440)
    })

    test('colapsado: solo el avatar, con nombre accesible y tooltip, y el tooltip no tapa al menú ni frena Escape', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 800 })
      await page.goto('/tickets')
      await expect(account(page)).not.toContainText('Administrador')
      await account(page).hover()
      await expect(page.getByRole('tooltip')).toHaveText('Yelisson Ortiz')
      await account(page).click()
      await expect(page.getByRole('menu', { name: 'Cuenta' })).toBeVisible()
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('menu', { name: 'Cuenta' })).toBeHidden()
      await expect(account(page)).toBeFocused()
    })

    test('móvil: el perfil está al pie del drawer y Escape cierra el menú sin cerrar el drawer', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/tickets')
      await expect(account(page)).toHaveCount(0)
      await page.getByRole('button', { name: 'Abrir menú' }).click()
      const drawer = page.getByRole('dialog', { name: 'Menú principal' })
      await expect(account(page)).toBeVisible()
      const [nav, trigger] = await Promise.all([
        drawer.getByRole('navigation', { name: 'Principal' }).boundingBox(),
        account(page).boundingBox(),
      ])
      expect(trigger!.y).toBeGreaterThan(nav!.y + nav!.height - 1)
      expect(trigger!.height).toBeGreaterThanOrEqual(44)
      await account(page).click()
      const menu = page.getByRole('menu', { name: 'Cuenta' })
      const box = (await menu.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
      expect(box.y).toBeGreaterThanOrEqual(0)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(drawer).toBeVisible()
      await expect(account(page)).toBeFocused()
    })

    test('sin /me aún, el perfil ocupa su sitio sin acciones y no se mueve al llegar los datos', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/me', async (route) => {
        await gate
        await route.fallback()
      })
      await page.goto('/tickets')
      await expect(account(page)).toHaveCount(0)
      const placeholder = page
        .getByRole('navigation', { name: 'Principal' })
        .locator('xpath=following-sibling::div[last()]')
      const before = (await placeholder.boundingBox())!
      release()
      const after = (await account(page).boundingBox())!
      expect(after.y).toBeCloseTo(before.y, 0)
      expect(after.height).toBeCloseTo(before.height, 0)
    })
  })
})
