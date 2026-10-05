import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * §2.1: desde 1200 px, con el sidebar expandido, las tres tablas aparecen completas. El contenedor mide ~894 px
 * a 1200 y ~898 px a 1024 (sidebar de 76 px), así que ningún umbral de contenedor distingue los dos: la tabla
 * completa se decide con el breakpoint de 1200 px del viewport además del ancho del contenedor.
 */
const tables = [
  {
    route: '/clientes',
    name: 'Clientes',
    full: ['Cliente', 'Empresa', 'Correo', 'Tickets', 'Estado'],
    priority: ['Correo'],
  },
  { route: '/equipo', name: 'Equipo', full: ['Agente', 'Rol', 'Estado', 'Carga'], priority: ['Rol'] },
  { route: '/tickets', name: 'Tickets', full: ['Estado', 'Prioridad', 'Responsable', 'Actualizado'], priority: [] },
]

/** Ancho visible de una cabecera; 0 si no se pinta o queda reducida a 1 px solo para lectores de pantalla. */
async function headerWidth(table: Locator, name: string) {
  const header = table.getByRole('columnheader', { name, exact: true })
  // `display: none` lo saca del árbol de accesibilidad: no hay nada que medir.
  if ((await header.count()) === 0) return 0
  const box = await header.boundingBox()
  return box && box.width > 1 ? box.width : 0
}

for (const { route, name, full, priority } of tables) {
  test(`${name}: a 1200 px con el sidebar expandido la tabla está completa`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto(route)
    const sidebar = page.getByRole('navigation', { name: 'Principal' }).locator('..')
    expect((await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(239)
    const table = page.getByRole('table', { name })
    for (const header of full) expect(await headerWidth(table, header), header).toBeGreaterThan(8)
    expect((await table.getByRole('row').first().boundingBox())!.width).toBeGreaterThan(300)
  })

  test(`${name}: a 1024 px la tabla conserva las columnas prioritarias`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(route)
    const table = page.getByRole('table', { name })
    await expect(table.getByRole('columnheader').first()).toBeVisible()
    for (const header of priority) expect(await headerWidth(table, header), header).toBe(0)
  })
}
