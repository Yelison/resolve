import { expect, test } from './fixtures'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const
const routes = ['/catalogo', '/tickets', '/tickets/1047', '/tickets/nuevo'] as const

for (const route of routes) {
  for (const theme of themes) {
    for (const width of widths) {
      test(`${route} sin desbordamiento horizontal · ${theme} · ${width}px`, async ({ page }, testInfo) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)

        // Capturas para la revisión visual local; en CI solo se conserva la traza de los fallos.
        if (!process.env.CI) {
          await testInfo.attach(`${route.slice(1)}-${theme}-${width}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
        }
      })
    }
  }
}
