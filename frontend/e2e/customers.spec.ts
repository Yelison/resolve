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

  test('«Nuevo cliente» abre el diálogo sobre la lista y Escape devuelve el foco con los filtros', async ({ page }) => {
    await page.goto('/clientes?company=Northstar')
    const link = page.getByRole('link', { name: 'Nuevo cliente' })
    await link.click()
    await expect(page).toHaveURL(/\/clientes\/nuevo\?company=Northstar$/)
    const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/clientes\?company=Northstar$/)
    await expect(link).toBeFocused()
  })

  test('la lista abre el detalle, se edita el nombre y se ve en la lista y en la bandeja', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes')
    await page.getByRole('table', { name: 'Clientes' }).getByRole('link', { name: 'María Pérez' }).click()
    await expect(page).toHaveURL(/\/clientes\/c-maria$/)
    await expect(page.getByRole('heading', { level: 1, name: 'María Pérez' })).toBeVisible()
    await expect(page.getByText('9 tickets · 2 abiertos · 7 resueltos')).toBeVisible()
    // La pestaña de tickets lista solo los de este cliente y enlaza a su detalle.
    const tickets = page.getByRole('table', { name: 'Tickets de María Pérez' })
    await expect(tickets.getByRole('link', { name: /No puedo acceder a mi cuenta/ })).toHaveAttribute(
      'href',
      '/tickets/1048',
    )

    await page.getByRole('button', { name: 'Editar cliente' }).click()
    const name = page.getByRole('textbox', { name: 'Nombre' })
    await name.fill('María Pérez Ruiz')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'María Pérez Ruiz' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notificaciones' }).getByText('Cambios guardados')).toBeVisible()

    await page.getByRole('link', { name: 'Clientes', exact: true }).first().click()
    await expect(
      page.getByRole('table', { name: 'Clientes' }).getByRole('link', { name: 'María Pérez Ruiz' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Tickets', exact: true }).first().click()
    await expect(page.getByText('María Pérez Ruiz').first()).toBeVisible()
  })

  test('crear un cliente lleva a su ficha y un correo duplicado se asocia al campo', async ({ page }) => {
    await page.goto('/clientes')
    await page.getByRole('link', { name: 'Nuevo cliente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' })
    await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Duplicado')
    await dialog.getByRole('textbox', { name: 'Correo' }).fill('maria@cliente.example')
    await dialog.getByRole('button', { name: 'Crear cliente' }).click()
    const email = dialog.getByRole('textbox', { name: 'Correo' })
    await expect(email).toHaveAccessibleDescription(/Ya existe un cliente con ese correo/)
    await expect(email).toBeFocused()

    await email.fill('nuevo@cliente.example')
    await dialog.getByRole('button', { name: 'Crear cliente' }).click()
    await expect(page).toHaveURL(/\/clientes\/c-nuevo-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Duplicado' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notificaciones' }).getByText('Cliente creado')).toBeVisible()
  })

  test('archivar y restaurar desde la ficha', async ({ page }) => {
    await page.goto('/clientes/c-carlos')
    await page.getByRole('button', { name: 'Archivar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archivar cliente' }).click()
    await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar cliente' })).toBeDisabled()
    await page.getByRole('button', { name: 'Restaurar' }).click()
    await expect(page.getByRole('button', { name: 'Archivar' })).toBeVisible()
  })

  test('un cliente inexistente dice que no existe', async ({ page }) => {
    await page.goto('/clientes/no-existe')
    await expect(page.getByText('No existe el cliente')).toBeVisible()
  })

  test('los tickets simulados solo llevan las claves de Customer en su cliente', async ({ page }) => {
    await page.goto('/clientes')
    const customers = await page.evaluate(async () => {
      const response = await fetch('/api/tickets')
      const body = (await response.json()) as { items: { customer: object }[] }
      return body.items.map((ticket) => Object.keys(ticket.customer).sort())
    })
    expect(customers.length).toBeGreaterThan(0)
    for (const keys of customers) expect(keys).toEqual(['company', 'email', 'id', 'name'])
  })

  test('a 1024 px la fila de la tabla llega al borde del panel', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/clientes')
    const table = page.getByRole('table', { name: 'Clientes' })
    await expect(table.getByRole('link', { name: 'María Pérez' })).toBeVisible()
    const panel = (await page.getByRole('region', { name: 'Lista de clientes' }).boundingBox())!
    const box = (await table.boundingBox())!
    const row = (await table.getByRole('row').nth(1).boundingBox())!
    // La fila ocupa todo el ancho de la tabla y esta, todo el panel salvo su borde de 1 px.
    expect(Math.abs(row.x + row.width - (box.x + box.width))).toBeLessThanOrEqual(1)
    expect(Math.abs(panel.x + panel.width - 1 - (box.x + box.width))).toBeLessThanOrEqual(1)
    expect(Math.abs(box.x - (panel.x + 1))).toBeLessThanOrEqual(1)
  })

  test('en móvil el perfil, el contexto y las pestañas van apilados', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/clientes/c-maria')
    const profile = page.getByRole('complementary', { name: 'Perfil' })
    const context = page.getByRole('region', { name: 'Contexto de atención' })
    const tabs = page.getByRole('tablist', { name: 'Información del cliente' })
    await expect(profile).toBeVisible()
    const boxes = {
      profile: (await profile.boundingBox())!,
      context: (await context.boundingBox())!,
      tabs: (await tabs.boundingBox())!,
    }
    expect(boxes.context.y).toBeGreaterThanOrEqual(boxes.profile.y + boxes.profile.height - 1)
    expect(boxes.tabs.y).toBeGreaterThanOrEqual(boxes.context.y + boxes.context.height - 1)
  })

  test('a 1440 px el perfil (1/3) y el contexto (2/3) van en paralelo y la tabla, debajo con todas sus columnas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes/c-maria')
    const profile = (await page.getByRole('complementary', { name: 'Perfil' }).boundingBox())!
    const context = (await page.getByRole('region', { name: 'Contexto de atención' }).boundingBox())!
    expect(context.x).toBeGreaterThanOrEqual(profile.x + profile.width - 1)
    expect(Math.abs(context.y - profile.y)).toBeLessThanOrEqual(1)
    expect(Math.round(context.width / profile.width)).toBe(2)
    const table = page.getByRole('table', { name: 'Tickets de María Pérez' })
    for (const name of ['Asunto / cliente', 'Estado', 'Prioridad', 'Responsable', 'Actualizado']) {
      await expect(table.getByRole('columnheader', { name })).toBeVisible()
    }
    const box = (await table.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(profile.y + profile.height - 1)
    expect(box.width).toBeGreaterThan(profile.width + context.width - 80)
  })

  test('a 1200 px la tabla de tickets del detalle no está en tarjetas', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto('/clientes/c-maria')
    const table = page.getByRole('table', { name: 'Tickets de María Pérez' })
    await expect(table.getByRole('columnheader', { name: 'Estado' })).toBeVisible()
    expect((await table.getByRole('row').first().boundingBox())!.width).toBeGreaterThan(300)
  })

  for (const width of [320, 390]) {
    test(`el diálogo de alta cabe en el viewport y no desborda · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 })
      await page.goto('/clientes/nuevo')
      const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' })
      await expect(dialog).toBeVisible()
      const box = (await dialog.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeLessThanOrEqual(640)
      for (const name of ['Cancelar', 'Crear cliente']) {
        const target = dialog.getByRole('button', { name })
        // offsetHeight ignora la transformación de la animación de entrada del diálogo.
        expect(await target.evaluate((node) => (node as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44)
        const button = (await target.boundingBox())!
        expect(button.x + button.width).toBeLessThanOrEqual(width)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

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

  for (const width of [390, 767]) {
    test(`el «Reintentar» de empresas es una zona táctil de 44 px · ${width}px`, async ({ page }) => {
      // La ruta registrada después prevalece sobre la del mock.
      await page.route('**/api/customers/companies', (route) =>
        route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{"status":500,"title":"Error"}' }),
      )
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/clientes')
      const retry = page.getByRole('button', { name: 'Reintentar cargar las empresas' })
      await expect(retry).toBeVisible()
      const box = (await retry.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    })
  }

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
