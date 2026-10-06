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
})
