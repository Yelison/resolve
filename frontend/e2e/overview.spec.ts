import { expect, test } from './fixtures'

test.describe('resumen', () => {
  test('muestra las métricas, el gráfico, la actividad y los tickets que necesitan atención', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
    await expect(page.getByText('Tickets abiertos')).toBeVisible()
    await expect(page.getByText('Objetivo: 30 min')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Solicitudes por día' })).toBeVisible()

    const table = page.getByRole('table', { name: 'Tickets que necesitan atención' })
    await expect(table.getByRole('row')).toHaveCount(3) // encabezado + 2 abiertos o en progreso
    await expect(table.getByText('Cambiar correo de facturación')).toHaveCount(0)

    await page.getByRole('link', { name: /creó el ticket · #1048/ }).click()
    await expect(page).toHaveURL(/\/tickets\/1048$/)
  })

  test('la tabla alternativa del gráfico se alcanza con el teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /Ver como tabla/ })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('table', { name: 'Solicitudes por día' })).toBeVisible()
  })

  test('en móvil las métricas van en dos columnas y la tabla usa tarjetas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/')
    const open = page.getByText('Tickets abiertos')
    const resolved = page.getByText('Resueltos hoy')
    const [a, b] = [await open.boundingBox(), await resolved.boundingBox()]
    expect(a!.y, 'dos métricas por fila si caben').toBeCloseTo(b!.y, 0)
    await expect(page.getByRole('table', { name: 'Tickets que necesitan atención' })).toBeVisible()
  })
})
