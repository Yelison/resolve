import { expect, test } from './fixtures'

test.describe('resumen', () => {
  test('muestra las métricas, el gráfico, la actividad y los tickets que necesitan atención', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()
    await expect(page.getByText('Tickets abiertos')).toBeVisible()
    await expect(page.getByText('Mediana de 7 días · Objetivo: 30 min')).toBeVisible()
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

test.describe('resumen · sin saltos de layout', () => {
  for (const width of [320, 768, 1440]) {
    test(`el panel siguiente a las métricas empieza a la misma altura cargando y con datos · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets/metrics', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/')
      const panel = page.getByRole('region', { name: /Solicitudes/ })
      await expect(page.getByText('Cargando métricas…')).toBeAttached()
      const loading = (await panel.boundingBox())!.y
      release()
      await expect(page.getByText('Tickets abiertos')).toBeVisible()
      const loaded = (await panel.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(4)
    })
  }
})
