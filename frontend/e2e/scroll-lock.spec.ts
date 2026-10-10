import { acme, northwind } from './mocks/session'
import { expect, mockApi, test } from './fixtures'

/**
 * Un solo bloqueo de scroll (ADR 0002): el drawer móvil y los diálogos del paquete comparten el contador de
 * `useScrollLock`. Con barras de scroll clásicas (Chromium headless las oculta por defecto), el bloqueo compensa el ancho
 * de la barra con `padding-right` en `<html>`; cerrar un diálogo abierto sobre el drawer no debe soltar esa compensación
 * mientras el drawer sigue abierto, o el contenido de detrás se ensancha.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test('cerrar un diálogo abierto sobre el drawer mantiene el bloqueo y la compensación de la barra hasta cerrar el drawer', async ({
  page,
}) => {
  await mockApi(page, 'admin', { organizations: [acme, northwind] })
  await page.setViewportSize({ width: 600, height: 500 })
  await page.goto('/tickets')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

  const html = () =>
    page.evaluate(() => {
      const root = document.documentElement
      return {
        paddingRight: root.style.paddingRight,
        // El efecto del bloqueo (la página no se desplaza), no el nombre de la clase que lo aplica.
        locked: getComputedStyle(root).overflow === 'hidden',
        // El contenido de detrás no se mueve: la derecha del título es la misma con el drawer abierto.
        titleRight: Math.round(document.querySelector('main h1')!.getBoundingClientRect().right),
      }
    })

  const scrollbar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)
  expect(scrollbar, 'el navegador de la prueba tiene barras de scroll clásicas').toBeGreaterThan(0)
  const before = await html()

  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('dialog', { name: 'Menú principal' }).waitFor()
  expect(await html()).toMatchObject({ paddingRight: `${scrollbar}px`, locked: true, titleRight: before.titleRight })

  await page.getByRole('button', { name: /^Cuenta:/ }).click()
  await page.getByRole('menuitem', { name: /Cambiar de organización/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar de organización' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()

  // El drawer sigue abierto: el bloqueo y la compensación siguen donde estaban.
  await expect(page.getByRole('dialog', { name: 'Menú principal' })).toBeVisible()
  expect(await html()).toMatchObject({ paddingRight: `${scrollbar}px`, locked: true, titleRight: before.titleRight })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await html()).toMatchObject({ paddingRight: '', locked: false, titleRight: before.titleRight })
})
