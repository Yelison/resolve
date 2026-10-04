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
})
