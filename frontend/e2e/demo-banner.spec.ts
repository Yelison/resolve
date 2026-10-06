import type { Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'
import { sweepRoutes } from './routes'

/** Anchos de revisión y fronteras de breakpoint definidos en la guía de diseño. */
const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const
const NAME = 'Demostración pública'

async function openDemo(page: Page, route: string, theme: (typeof themes)[number], width: number, demo = true) {
  await mockApi(page, 'admin', { demo })
  await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
  await page.setViewportSize({ width, height: 900 })
  await page.goto(route)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

for (const theme of themes) {
  for (const width of widths) {
    test(`el aviso de la demostración cabe sin recortes ni scroll horizontal · ${theme} · ${width}px`, async ({
      page,
    }) => {
      await openDemo(page, '/', theme, width)
      const banner = page.getByRole('region', { name: NAME })
      await expect(banner).toBeVisible()
      await expect(banner).toHaveText('Demostración pública · los datos se reinician cada noche')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
      const clipped = await banner.evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(clipped, 'el texto del aviso no debe recortarse').toBeLessThanOrEqual(0)
      const box = (await banner.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      // Pegado al borde inferior de la ventana, sin salirse de ella.
      expect(box.y + box.height).toBeCloseTo(900, 0)
    })
  }
}

test('sin demo no hay aviso', async ({ page }) => {
  await openDemo(page, '/', 'light', 1440, false)
  await expect(page.getByRole('region', { name: NAME })).toHaveCount(0)
})

test('el aviso es una región, no un alert, y no se puede cerrar', async ({ page }) => {
  await openDemo(page, '/', 'light', 390)
  const banner = page.getByRole('region', { name: NAME })
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

// El catálogo de componentes vive fuera del shell (no tiene sesión ni aviso).
for (const { path: route, ready } of sweepRoutes.filter((item) => item.path !== '/catalogo')) {
  for (const width of [320, 1440]) {
    test(`${route} · el aviso no tapa el final del contenido · ${width}px`, async ({ page }) => {
      await openDemo(page, route, 'light', width)
      await ready?.(page)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const banner = page.getByRole('region', { name: NAME })
      await expect(banner).toBeVisible()
      const bannerTop = (await banner.boundingBox())!.y
      const contentBottom = await page.locator('main').evaluate((main) => main.getBoundingClientRect().bottom)
      expect(contentBottom, 'el contenido termina por encima del aviso').toBeLessThanOrEqual(bannerTop + 1)
    })
  }
}

test('al llegar /me el aviso aparece sin mover el contenido', async ({ page }) => {
  await mockApi(page, 'admin', { demo: true })
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/me', async (route) => {
    await held
    await route.fallback()
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  const main = page.locator('main')
  await expect(main).toBeVisible()
  await expect(page.getByRole('region', { name: NAME })).toHaveCount(0)
  const before = (await main.boundingBox())!.y
  const topbarBefore = (await page.locator('header').first().boundingBox())!.y
  release()
  await expect(page.getByRole('region', { name: NAME })).toBeVisible()
  expect((await main.boundingBox())!.y).toBe(before)
  expect((await page.locator('header').first().boundingBox())!.y).toBe(topbarBefore)
})

for (const width of [320, 1440]) {
  test(`al tabular, el control enfocado no queda bajo el aviso · ${width}px`, async ({ page }) => {
    await openDemo(page, '/tickets', 'light', width)
    await expect(page.getByRole('link', { name: /Ticket|#/ }).first()).toBeVisible()
    const bannerTop = (await page.getByRole('region', { name: NAME }).boundingBox())!.y
    const obscured: string[] = []
    for (let step = 0; step < 60; step++) {
      await page.keyboard.press('Tab')
      const rect = await page.evaluate(() => {
        const active = document.activeElement
        if (!active || active === document.body) return null
        const { top, bottom } = active.getBoundingClientRect()
        return { top, bottom, label: active.getAttribute('aria-label') ?? active.textContent?.slice(0, 40) ?? '' }
      })
      if (rect && rect.bottom > bannerTop && rect.top < 900) obscured.push(`${step}: ${rect.label}`)
    }
    expect(obscured, 'los controles enfocados quedan por encima del aviso').toEqual([])
  })
}
