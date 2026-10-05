import { expect, test } from './fixtures'

test.describe('clientes', () => {
  test('la lista filtra por empresa, busca y muestra los archivados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes')
    const table = page.getByRole('table', { name: 'Clientes' })
    await expect(table.getByRole('row')).toHaveCount(4) // encabezado + 3 activos
    await expect(page.getByText('Clientes activos')).toBeVisible()

    await page.getByRole('combobox', { name: 'Empresa' }).selectOption('Northstar')
    await expect(page).toHaveURL(/company=Northstar/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('link', { name: 'Carlos Ruiz' })).toHaveAttribute('href', '/clientes/c-carlos')

    await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill('zzz')
    await expect(page.getByRole('heading', { name: 'No encontramos clientes' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(table.getByRole('row')).toHaveCount(4)
    await expect(page).toHaveURL(/\/clientes$/)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Archivados' }).click()
    await expect(page).toHaveURL(/archived=true/)
    await expect(table.getByText('Archivado')).toBeVisible()
  })

  test('«Nuevo cliente» enlaza a /clientes/nuevo', async ({ page }) => {
    await page.goto('/clientes')
    await page.getByRole('link', { name: 'Nuevo cliente' }).click()
    await expect(page).toHaveURL(/\/clientes\/nuevo$/)
  })

  const layouts = [
    { width: 390, columns: [] as string[], hidden: [] as string[] },
    { width: 1024, columns: ['Cliente', 'Empresa', 'Tickets', 'Estado'], hidden: ['Correo'] },
    { width: 1440, columns: ['Cliente', 'Empresa', 'Correo', 'Tickets', 'Estado'], hidden: [] as string[] },
  ]
  for (const { width, columns, hidden } of layouts) {
    test(`la tabla elige su disposición por el ancho del contenedor · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/clientes')
      const table = page.getByRole('table', { name: 'Clientes' })
      await expect(table.getByRole('link', { name: 'María Pérez' })).toBeVisible()
      for (const name of columns) await expect(table.getByRole('columnheader', { name })).toBeVisible()
      for (const name of hidden) await expect(table.getByRole('columnheader', { name })).toBeHidden()
      // En tarjetas el encabezado sigue en el árbol de accesibilidad pero sin ocupar espacio.
      const header = await table.getByRole('row').first().boundingBox()
      if (width === 390) expect(header!.width).toBeLessThanOrEqual(1)
      else expect(header!.width).toBeGreaterThan(300)
      // Los datos largos se recortan con elipsis dentro de la fila, sin abrir scroll horizontal.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  const metricColumns = [
    { width: 390, columns: 2 },
    { width: 767, columns: 2 },
    { width: 1024, columns: 2 },
    { width: 1199, columns: 2 },
    { width: 1440, columns: 4 },
  ]
  for (const { width, columns } of metricColumns) {
    for (const route of ['/clientes', '/tickets']) {
      test(`${route}: ${columns} columnas de métricas · ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        const first = page.locator('dl').first()
        await expect(first).toBeVisible()
        const tops = await page
          .locator('dl')
          .evaluateAll((items) =>
            items.slice(0, 4).map((item) => Math.round(item.closest('div')!.getBoundingClientRect().top)),
          )
        expect(tops.filter((top) => top === tops[0])).toHaveLength(columns)
      })
    }
  }

  test('en móvil el enlace de cada tarjeta es una zona táctil de al menos 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/clientes')
    const link = page.getByRole('table', { name: 'Clientes' }).getByRole('link', { name: 'María Pérez' })
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('en móvil el nombre y el correo largos envuelven sin recortarse', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/clientes')
    const table = page.getByRole('table', { name: 'Clientes' })
    for (const locator of [
      table.getByRole('link', { name: /Ana García Fernández/ }),
      table.getByText('ana.garcia.fernandez.de.la.fuente@orbit-labs.example'),
    ]) {
      const clipped = await locator.evaluate((node) => node.scrollWidth > node.clientWidth)
      expect(clipped).toBe(false)
    }
  })
})
