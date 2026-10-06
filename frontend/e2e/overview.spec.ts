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
    // El nombre cambia entre «Ver como tabla» y «Ocultar tabla»: el localizador no depende de él.
    const toggle = page.getByRole('button', { name: /tabla$/ })
    await expect(toggle).toBeVisible()
    // Solo con Tab: enfocar el botón por programa no demostraría que está en el orden de tabulación.
    let presses = 0
    while (!(await toggle.evaluate((element) => element === document.activeElement))) {
      expect(++presses, 'el botón no recibe el foco con Tab').toBeLessThanOrEqual(40)
      await page.keyboard.press('Tab')
    }
    // La tabla siempre está en el DOM (los lectores de pantalla la leen); «Ver como tabla» la muestra a todos.
    const table = page.getByRole('table', { name: 'Solicitudes por día' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // El contenedor que lo oculta es el que enlaza `aria-controls`: cerrado mide 1 px, abierto toda la tabla.
    const wrap = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
    expect((await wrap.boundingBox())!.height).toBeLessThanOrEqual(1)
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveText('Ocultar tabla')
    await expect(toggle).toBeFocused()
    expect((await wrap.boundingBox())!.height).toBeGreaterThan(100)
    await expect(table.getByRole('row')).toHaveCount(8) // encabezado + 7 días
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect((await wrap.boundingBox())!.height).toBeLessThanOrEqual(1)
  })

  test('en móvil la tabla usa tarjetas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const firstRow = page.getByRole('table', { name: 'Tickets que necesitan atención' }).getByRole('row').nth(1)
    await expect(firstRow).toContainText('Laura Méndez')
    // En modo tarjeta la fila apila sus datos: la prioridad queda debajo del asunto, no a su lado.
    const [subject, priority] = await Promise.all([
      firstRow.getByRole('link').boundingBox(),
      firstRow.getByText('Urgente').boundingBox(),
    ])
    expect(priority!.y).toBeGreaterThan(subject!.y + subject!.height - 1)
  })

  for (const [width, columns] of [
    [390, 2],
    [768, 2],
    [1199, 2],
    [1200, 4],
  ] as const) {
    test(`las métricas van en ${columns} columnas · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByText('Tickets abiertos')).toBeVisible()
      const tops = await Promise.all(
        ['Tickets abiertos', 'Resueltos hoy', 'Primera respuesta', 'Sin responsable'].map(async (label) =>
          Math.round((await page.getByText(label).boundingBox())!.y),
        ),
      )
      expect(tops.filter((top) => top === tops[0])).toHaveLength(columns)
    })
  }
})

test.describe('resumen · sin saltos de layout', () => {
  // 1200 y 1280 px con el menú expandido: las tarjetas son estrechas y el detalle puede ocupar dos líneas.
  for (const width of [320, 390, 768, 1200, 1280, 1440]) {
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
      // Las tarjetas ocultas que fijan la altura no se leen ni se pueden enfocar.
      await expect(page.getByRole('link', { name: 'Ver sin asignar' })).toHaveCount(0)
      const loading = (await panel.boundingBox())!.y
      release()
      await expect(page.getByText('Tickets abiertos')).toBeVisible()
      const loaded = (await panel.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(4)
    })
  }
})

test.describe('resumen · gráfico de solicitudes por día', () => {
  // Medidas de las barras (px de pantalla) y de la separación entre barras vecinas.
  async function measureBars(page: import('@playwright/test').Page) {
    const chart = page.getByRole('img', { name: 'Solicitudes por día' })
    await expect(chart).toBeVisible()
    return chart.locator('svg').evaluateAll((svgs) => {
      const rects = svgs.map((svg) => svg.getBoundingClientRect())
      return {
        widths: rects.map((rect) => rect.width),
        gaps: rects.slice(1).map((rect, index) => rect.left - rects[index]!.right),
      }
    })
  }

  for (const width of [1440, 2560]) {
    test(`las barras ganan grosor y la separación queda acotada · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const { widths, gaps } = await measureBars(page)
      expect(Math.min(...widths), 'barras demasiado finas').toBeGreaterThanOrEqual(40)
      expect(Math.max(...gaps), 'barras demasiado separadas').toBeLessThanOrEqual(56)
    })
  }

  test('las etiquetas del eje son los días en tres letras y caben a 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/')
    const chart = page.getByRole('img', { name: 'Solicitudes por día' })
    await expect(chart).toBeVisible()
    const labels = chart.locator('[class*="axis"]:not([class*="axisRow"])')
    await expect(labels).toHaveCount(7)
    const texts = await labels.allTextContents()
    expect(
      texts.every((text) => /^[a-zñáéíóú]{3}$/.test(text)),
      texts.join(','),
    ).toBe(true)
    expect(texts).not.toContain('X')
    const clipped = await labels.evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
    expect(Math.max(...clipped)).toBeLessThanOrEqual(0)
  })
})
