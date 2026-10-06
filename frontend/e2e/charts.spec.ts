import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Centro horizontal del texto de cada etiqueta del eje y de la barra de su columna. */
async function centerOffsets(page: Page, chartName: string) {
  const chart = page.getByRole('img', { name: chartName })
  await expect(chart).toBeVisible()
  return chart.evaluate((plot) => {
    const bars = [...plot.querySelectorAll('svg')].map((svg) => svg.getBoundingClientRect())
    const labels = [...plot.querySelectorAll<HTMLElement>('[class*="axis"]:not([class*="axisRow"])')]
    return labels.map((label) => {
      const range = document.createRange()
      range.selectNodeContents(label)
      const text = range.getBoundingClientRect()
      const bar = bars[Number.parseInt(label.style.gridColumn, 10) - 1]!
      return text.left + text.width / 2 - (bar.left + bar.width / 2)
    })
  })
}

for (const [route, name] of [
  ['/', 'Solicitudes por día'],
  ['/reportes', 'Solicitudes y resueltos por día'],
  ['/reportes?period=30d', 'Solicitudes y resueltos por día'],
  ['/reportes?period=90d', 'Solicitudes y resueltos por semana'],
] as const) {
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 768, 1440, 1920, 2560]) {
      test(`cada etiqueta del eje queda centrada bajo su barra · ${route} · ${theme} · ${width}px`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        const offsets = await centerOffsets(page, name)
        expect(offsets.length, 'hay etiquetas en el eje').toBeGreaterThan(0)
        offsets.forEach((offset, index) =>
          expect(Math.abs(offset), `etiqueta ${index}: ${offset.toFixed(2)} px`).toBeLessThanOrEqual(1),
        )
      })
    }
  }
}
