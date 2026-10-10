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

/** El buscador comparte barra con selectores: los dos enfocan con el mismo anillo (ADR 0002: ya no queda ningún campo de 1 px). */
for (const scheme of ['light', 'dark'] as const) {
  test(`el buscador y los selectores de la barra de filtros de /tickets enfocan con el mismo anillo · ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

    const search = page.getByRole('searchbox')
    const select = page.getByRole('combobox').first()
    const ringOf = (selector: 'search' | 'select') => async () => {
      const target = selector === 'search' ? search : select
      await target.focus()
      await expect(target).toBeFocused()
      // El anillo del buscador lo dibuja su contenedor (`label`), no el `input`.
      return target.evaluate((el, own) => {
        const { outlineWidth, outlineStyle } = getComputedStyle(own === 'search' ? (el.closest('label') ?? el) : el)
        return { outlineWidth, outlineStyle }
      }, selector)
    }
    const searchRing = await ringOf('search')()
    const selectRing = await ringOf('select')()
    expect(selectRing).toEqual({ outlineWidth: '2px', outlineStyle: 'solid' })
    expect(searchRing).toEqual(selectRing)
  })
}
