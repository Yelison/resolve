import { expect, test } from './fixtures'

const widths = [320, 390, 767, 768, 1024, 1199, 1200, 1440]
const themes = ['light', 'dark'] as const

const LOCK_MESSAGE = 'Otra persona está guardando este recurso; vuelve a intentarlo.'

/** Responde la primera escritura con el 503 de bloqueo del backend; las siguientes las sirve la API simulada. */
async function lockOnce(page: import('@playwright/test').Page, url: string) {
  let sent = 0
  let current: Record<string, unknown> = {}
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/tickets/1048') && response.request().method() === 'GET') {
      current = (await response.json()) as Record<string, unknown>
    }
  })
  await page.route(url, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    if (sent++ > 0) {
      // La API simulada no atiende escrituras de tickets: el reintento responde con el ticket ya cambiado.
      return route.fulfill({ json: { ...current, priority: 'low', version: Number(current.version) + 1 } })
    }
    await route.fulfill({
      status: 503,
      headers: { 'Retry-After': '1' },
      contentType: 'application/problem+json',
      body: JSON.stringify({
        status: 503,
        title: 'Recurso ocupado',
        detail: 'Otra operación está modificando este recurso. Inténtalo de nuevo en unos segundos.',
      }),
    })
  })
}

test.describe('503 de bloqueo · «Reintentar»', () => {
  for (const theme of themes) {
    for (const width of widths) {
      test(`el aviso cabe, conserva el foco y se puede repetir · ${theme} · ${width}px`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await lockOnce(page, '**/api/tickets/1048')
        await page.goto('/tickets/1048')

        const priority = page.getByRole('combobox', { name: 'Prioridad' })
        await priority.selectOption('low')
        const notice = page.getByRole('status').filter({ hasText: LOCK_MESSAGE })
        await expect(notice).toBeVisible()
        // Sin reintento automático y sin foco perdido: el campo se desactiva mientras se envía, así que el aviso lleva el
        // foco a «Reintentar» en lugar de dejarlo en `body`.
        const retry = page.getByRole('button', { name: 'Reintentar guardar el cambio del ticket' })
        await expect(retry).toBeFocused()
        await expect(retry).toHaveAttribute('aria-disabled', 'true')

        // Sin scroll horizontal ni aviso fuera del viewport; táctil de 44 px por debajo de 768 px.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const box = (await notice.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        const retryBox = (await retry.boundingBox())!
        if (width < 768) expect(retryBox.height).toBeGreaterThanOrEqual(44)

        // Pasado `Retry-After` el botón se activa con el teclado y la misma petición sale bien.
        await expect(retry).not.toHaveAttribute('aria-disabled', 'true', { timeout: 3000 })
        await page.keyboard.press('Enter')
        await expect(notice).toBeHidden()
        await expect(page.getByRole('combobox', { name: 'Prioridad' })).toHaveValue('low')
        // El foco no queda en `body`.
        expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
      })
    }
  }
})
