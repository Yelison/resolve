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
})
