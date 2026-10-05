import { expect, test } from './fixtures'

/**
 * CLAUDE.md: controles táctiles de 44 px por debajo de 768 px de viewport. Entre 700 y 767 px no hay sidebar y el
 * contenedor de la tabla supera los 560 px, así que ya se dibujan las columnas prioritarias; los enlaces y botones de
 * cada fila deben seguir midiendo 44 px (el reset de la zona táctil solo desde 768 px, como `TicketRow`, #35).
 */
const tables = [
  { route: '/clientes', name: 'Clientes' },
  { route: '/equipo', name: 'Equipo' },
  { route: '/conocimiento', name: 'Artículos' },
  { route: '/reportes', name: 'Rendimiento por agente' },
]

for (const { route, name } of tables) {
  for (const width of [390, 700, 767]) {
    test(`${name}: los enlaces y botones de las filas miden 44 px a ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      const table = page.getByRole('table', { name })
      await expect(table.getByRole('row').nth(1)).toBeVisible()
      const controls = table.getByRole('row').locator('a, button')
      // «Rendimiento por agente» no tiene enlaces ni botones: la prueba sigue fijando que no se añadan sin zona táctil.
      const count = await controls.count()
      for (let index = 0; index < count; index++) {
        const box = await controls.nth(index).boundingBox()
        if (!box) continue
        expect(box.height, `control ${index} de ${name}`).toBeGreaterThanOrEqual(43.5)
      }
      if (name !== 'Rendimiento por agente') expect(count).toBeGreaterThan(0)
    })
  }
}
