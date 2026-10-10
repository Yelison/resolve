import { expect, test } from './fixtures'

/**
 * El anillo de foco de los campos (ADR 0002): `Input` es del paquete y `Select`, `Textarea` y `Combobox` de Resolve, y
 * los cuatro lo dibujan con `--focus-ring` (2 px, el de los botones). Se mide en el build, en los dos temas.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`los campos de «Crear ticket» enfocan con el anillo de 2 px del token · ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/nuevo')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const fields = [
      page.getByRole('combobox', { name: 'Cliente' }),
      page.getByRole('textbox', { name: 'Asunto' }),
      page.getByRole('textbox', { name: 'Descripción' }),
      page.getByRole('combobox', { name: 'Prioridad' }),
    ]
    const ring = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.outline = 'var(--focus-ring)'
      document.body.append(probe)
      const { outlineWidth, outlineStyle } = getComputedStyle(probe)
      probe.remove()
      return { outlineWidth, outlineStyle }
    })
    expect(ring.outlineWidth).toBe('2px')

    for (const field of fields) {
      await field.focus()
      await expect(field).toBeFocused()
      const { outlineWidth, outlineStyle } = await field.evaluate((el) => {
        const { outlineWidth, outlineStyle } = getComputedStyle(el)
        return { outlineWidth, outlineStyle }
      })
      expect({ outlineWidth, outlineStyle }, (await field.getAttribute('aria-label')) ?? '').toEqual(ring)
    }
  })
}
