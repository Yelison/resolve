import { expect, test } from './fixtures'

/** Anchos de contenedor reales: 320 (móvil), 768 (intermedio) y 1440 (escritorio). */
const widths = [320, 768, 1440]

for (const width of widths) {
  test(`los gráficos densos del catálogo mantienen barras visibles y no desbordan · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/catalogo')
    const charts = page.getByTestId('dense-charts').locator('figure')
    await expect(charts).toHaveCount(3)

    for (const figure of await charts.all()) {
      const box = await figure.boundingBox()
      const parent = await figure.evaluate((el) => el.parentElement?.getBoundingClientRect().right ?? 0)
      expect(box && box.x + box.width, 'el gráfico no debe salirse de su contenedor').toBeLessThanOrEqual(parent + 0.5)
      const widthsOfBars = await figure
        .locator('svg')
        .evaluateAll((svgs) => svgs.map((svg) => svg.getBoundingClientRect().width))
      expect(Math.min(...widthsOfBars), 'cada barra debe ser visible').toBeGreaterThanOrEqual(1)
      const labels = await figure
        .locator('[class*="axis"]')
        .evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
      expect(Math.max(...labels), 'ninguna etiqueta del eje queda recortada').toBeLessThanOrEqual(0)
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
