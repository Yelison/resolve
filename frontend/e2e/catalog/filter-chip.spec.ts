import { expect, test } from '../fixtures'

test('el FilterChip de /catalogo es el disparador de su menú: chevron y sin aria-pressed', async ({ page }) => {
  await page.goto('/catalogo')
  const chip = page.getByRole('button', { name: 'Estado: Todos' })
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu')
  await expect(chip).not.toHaveAttribute('aria-pressed')
  await expect(chip.locator('svg[aria-hidden="true"]')).toHaveCount(1)
})
