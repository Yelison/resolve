import { createHash } from 'node:crypto'
import type { Page, Route } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * El tema en el build de producción: el script de primer pintado de `index.html` (la salida de `themeScript` del
 * paquete) aplica la preferencia guardada antes de que cargue React, y `useTheme` (`createThemeStore`) la conserva y
 * sigue al sistema en vivo.
 */

/** El fondo de `<html>` en el tema claro y en el oscuro, medido en la propia página sin tocar lo que hay guardado. */
const backgrounds = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-theme')
    const painted = () => getComputedStyle(root).backgroundColor
    const current = painted()
    root.setAttribute('data-theme', 'light')
    const light = painted()
    root.setAttribute('data-theme', 'dark')
    const dark = painted()
    if (previous === null) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', previous)
    return { current, light, dark }
  })

/** Retiene el chunk de entrada: hasta soltarlo, React no ha montado y lo único que pudo aplicar el tema es el script de `<head>`. */
async function holdEntryChunk(page: Page) {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/assets/index-*.js', async (route) => {
    await released
    await route.continue()
  })
  return release
}

test.describe('tema · primer pintado y preferencia', () => {
  test('con «light» guardado y el sistema en oscuro, el primer pintado es claro, antes de que monte React', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => localStorage.setItem('resolve-theme', 'light'))
    const release = await holdEntryChunk(page)
    await page.goto('/tickets', { waitUntil: 'commit' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'))

    expect(await page.locator('#root > *').count(), 'React todavía no ha montado').toBe(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const { current, light, dark } = await backgrounds(page)
    expect(light).not.toBe(dark)
    expect(current, 'fondo del primer frame').toBe(light)

    release()
    await expect(page.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect((await backgrounds(page)).current).toBe(light)
  })

  test('con «dark» guardado y el sistema en claro, el primer pintado es oscuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.addInitScript(() => localStorage.setItem('resolve-theme', 'dark'))
    const release = await holdEntryChunk(page)
    await page.goto('/tickets', { waitUntil: 'commit' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'))
    const { current, dark } = await backgrounds(page)
    expect(current, 'fondo del primer frame').toBe(dark)
    release()
    await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible()
  })

  test('«system» sigue al sistema en vivo y no deja ningún atributo ni valor guardado', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/tickets')
    await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    const dark = (await backgrounds(page)).dark
    expect((await backgrounds(page)).current).toBe(dark)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    expect((await backgrounds(page)).current).toBe((await backgrounds(page)).light)
    expect(await page.evaluate(() => localStorage.getItem('resolve-theme'))).toBeNull()
  })

  test('la preferencia elegida se guarda con la clave de siempre y sobrevive a una recarga', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => localStorage.getItem('resolve-theme'))).toBe('dark')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

/**
 * La política de contenido de la aplicación solo admite el script en línea por su hash SHA-256
 * (`ContentSecurityPolicy.java`, que lo calcula al arrancar a partir del `index.html` que sirve). Aquí se calcula igual
 * sobre el documento construido y se sirve con la misma política: si el script dejara de poder admitirse por hash (más
 * de uno, o con contenido que cambia), el tema no se aplicaría en el primer pintado.
 */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc\s*=)[^>]*>(.*?)<\/script>/gis

function policyFor(html: string) {
  const hashes = [...html.matchAll(INLINE_SCRIPT)]
    .map(([, body = '']) => body)
    .filter((body) => body.trim())
    .map((body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

test('el script de primer pintado se admite en la CSP por su hash y aplica el tema', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
  })
  await page.route(
    (url) => url.pathname === '/tickets',
    async (route: Route) => {
      const response = await route.fetch()
      const html = await response.text()
      await route.fulfill({
        response,
        body: html,
        headers: { ...response.headers(), 'content-security-policy': policyFor(html) },
      })
    },
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => localStorage.setItem('resolve-theme', 'light'))
  const release = await holdEntryChunk(page)
  await page.goto('/tickets', { waitUntil: 'commit' })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  release()
  await expect(page.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeVisible()
  expect(violations).toEqual([])
})
