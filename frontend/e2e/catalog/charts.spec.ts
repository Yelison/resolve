import { expect, test } from '../fixtures'

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
      // Se mide el texto (Range), no la caja del span: la caja ocupa la columna aunque la cifra se salga.
      const valueBoxes = await figure.locator('[class*="value"]').evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const { left, right } = range.getBoundingClientRect()
          return { left, right }
        }),
      )
      valueBoxes.sort((a, b) => a.left - b.left)
      valueBoxes.slice(1).forEach((box, index) => {
        expect(box.left, 'las cifras vecinas no deben cruzarse').toBeGreaterThanOrEqual(valueBoxes[index]!.right - 0.5)
      })
      // Las etiquetas dispersas se centran bajo su barra y pueden sobresalir de su celda: se mide el texto (Range),
      // que debe quedar dentro del viewport y sin cruzarse con la etiqueta vecina.
      const labelBoxes = await figure.locator('[class*="axis"]:not([class*="axisRow"])').evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const { left, right } = range.getBoundingClientRect()
          return { left, right }
        }),
      )
      labelBoxes.sort((a, b) => a.left - b.left)
      expect(labelBoxes[0]!.left, 'ninguna etiqueta del eje sale del viewport').toBeGreaterThanOrEqual(0)
      expect(labelBoxes.at(-1)!.right, 'ninguna etiqueta del eje sale del viewport').toBeLessThanOrEqual(width)
      labelBoxes.slice(1).forEach((box, index) => {
        expect(box.left, 'las etiquetas vecinas no deben cruzarse').toBeGreaterThanOrEqual(
          labelBoxes[index]!.right - 0.5,
        )
      })
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
