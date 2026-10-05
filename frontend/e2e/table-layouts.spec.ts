import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * §2.1: columnas prioritarias de 768 a 1199 px y tabla completa desde 1200 px, con el sidebar expandido o colapsado.
 * El contenedor mide ~894 px a 1200 px (sidebar de 240 px) y ~898 px a 1024 px (sidebar de 76 px), así que ningún
 * umbral de contenedor distingue los dos: la tabla completa se decide con el breakpoint de 1200 px del viewport y un
 * suelo de contenedor de 860 px. `TicketTable` usa los mismos umbrales con sus propias reglas de contenedor.
 */
const tables = [
  {
    route: '/clientes',
    name: 'Clientes',
    full: ['Cliente', 'Empresa', 'Correo', 'Tickets', 'Estado'],
    priority: ['Correo'],
  },
  { route: '/equipo', name: 'Equipo', full: ['Agente', 'Rol', 'Estado', 'Carga'], priority: ['Rol'] },
  {
    route: '/tickets',
    name: 'Tickets',
    full: ['Estado', 'Prioridad', 'Responsable', 'Actualizado'],
    priority: ['Responsable', 'Actualizado'],
  },
]

/** Cabecera medida: ancho y posición; `null` si no se pinta o queda reducida a 1 px solo para lectores de pantalla. */
async function headerBox(table: Locator, name: string) {
  const header = table.getByRole('columnheader', { name }).first()
  // `display: none` lo saca del árbol de accesibilidad: no hay nada que medir.
  if ((await header.count()) === 0) return null
  const box = await header.boundingBox()
  return box && box.width > 1 ? box : null
}

/** Las cabeceras visibles comparten línea y se suceden de izquierda a derecha, sin solaparse: la rejilla no está rota. */
async function expectOneRowInOrder(table: Locator, names: string[]) {
  await expect(table.getByRole('columnheader').first()).toBeVisible()
  const boxes = []
  for (const name of names) {
    const box = await headerBox(table, name)
    expect(box, `${name} debe verse`).not.toBeNull()
    boxes.push(box!)
  }
  for (const box of boxes) expect(Math.abs(box.y - boxes[0]!.y), 'misma línea').toBeLessThanOrEqual(1)
  for (let index = 1; index < boxes.length; index++) {
    const previous = boxes[index - 1]!
    expect(boxes[index]!.x, 'en orden').toBeGreaterThanOrEqual(previous.x + previous.width - 1)
  }
}

for (const { route, name, full, priority } of tables) {
  for (const sidebar of ['expandido', 'colapsado'] as const) {
    test(`${name}: a 1200 px con el sidebar ${sidebar} la tabla está completa y en una sola fila`, async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 900 })
      await page.goto(route)
      if (sidebar === 'colapsado') await page.getByRole('button', { name: 'Colapsar menú' }).click()
      const navigation = page.getByRole('navigation', { name: 'Principal' }).locator('..')
      const width = (await navigation.boundingBox())!.width
      if (sidebar === 'expandido') expect(width).toBeGreaterThanOrEqual(239)
      else expect(width).toBeLessThan(100)
      const table = page.getByRole('table', { name })
      await expectOneRowInOrder(table, full)
      expect((await table.getByRole('row').first().boundingBox())!.width).toBeGreaterThan(300)
    })
  }

  for (const width of [1024, 1199, 1200]) {
    test(`${name}: a ${width} px la página no desborda en horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      await expect(page.getByRole('table', { name }).getByRole('columnheader').first()).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }

  for (const width of [1024, 1100, 1199]) {
    test(`${name}: a ${width} px (sidebar de 76 px) la tabla conserva las columnas prioritarias`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      const table = page.getByRole('table', { name })
      await expect(table.getByRole('columnheader').first()).toBeVisible()
      for (const header of priority) expect(await headerBox(table, header), header).toBeNull()
    })
  }
}
