import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * `FilterChip` es de @yelison/forma-ui y deduce su modo de `aria-haspopup`: con él es el disparador de un menú (chevron,
 * sin `aria-pressed`); sin él, un conmutador (`aria-pressed`, sin chevron). Los filtros de Resolve son disparadores de
 * `Menu`: `{...trigger}` lleva `aria-haspopup="menu"`. Aquí se fija en las pantallas reales que ninguno cae al modo
 * conmutador, con el filtro sin aplicar y aplicado (`selected` solo cambia el aspecto).
 */
async function expectTrigger(chip: Locator) {
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu')
  await expect(chip).not.toHaveAttribute('aria-pressed')
  const chevron = chip.locator('svg[aria-hidden="true"]')
  await expect(chevron).toHaveCount(1)
  const box = await chevron.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(0)
}

const filtersOf = (page: Page, names: string[]) => names.map((name) => page.getByRole('button', { name, exact: true }))

test('Tickets: Estado y Prioridad son disparadores, con y sin filtro aplicado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tickets')
  const [status, priority] = filtersOf(page, ['Estado', 'Prioridad'])
  for (const chip of [status!, priority!]) await expectTrigger(chip)

  await status!.click()
  await page.getByRole('menuitem').nth(1).click()
  const applied = page.getByRole('button', { name: /^Estado: / })
  await expectTrigger(applied)
})

test('Clientes: Estado es un disparador, con y sin «Archivados»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await expectTrigger(page.getByRole('button', { name: 'Estado', exact: true }))

  await page.getByRole('button', { name: 'Estado', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Archivados' }).click()
  await expect(page).toHaveURL(/archived=true/)
  const chips = page.locator('button[aria-haspopup="menu"]:has(svg[aria-hidden="true"])', {
    hasText: /Estado|Archivados/,
  })
  await expect(chips).toHaveCount(1)
  await expectTrigger(chips.first())
})

test('Equipo: Rol y Estado son disparadores', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/equipo')
  for (const chip of filtersOf(page, ['Rol', 'Estado'])) await expectTrigger(chip)
})

test('en móvil los filtros siguen siendo disparadores y miden 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tickets')
  for (const chip of filtersOf(page, ['Estado', 'Prioridad'])) {
    await expectTrigger(chip)
    expect((await chip.boundingBox())?.height).toBe(44)
  }
})
