import { expect, me, test } from './fixtures'

test.describe('equipo', () => {
  test('la lista muestra el equipo actual, sus métricas y oculta a los retirados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByRole('row')).toHaveCount(6) // encabezado + 5 actuales
    await expect(page.getByText('Carga promedio')).toBeVisible()
    await expect(table.getByText('Invitación pendiente')).toBeVisible()
    await expect(table.getByText('Pablo Viejo')).toHaveCount(0)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Retirados' }).click()
    await expect(page).toHaveURL(/estado=retirados/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByText('Pablo Viejo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Acciones de/ })).toHaveCount(0)
  })

  test('invita a una persona y aparece como invitación pendiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    await expect(dialog.getByText('todavía no enviamos correos de invitación')).toBeVisible()

    await dialog.getByRole('textbox', { name: 'Correo' }).fill('laura@acme.example')
    await dialog.getByRole('button', { name: 'Invitar' }).click()
    await expect(dialog.getByText('Ya forma parte del equipo.')).toBeVisible()

    await dialog.getByRole('textbox', { name: 'Correo' }).fill('ana@acme.example')
    await dialog.getByRole('button', { name: 'Invitar' }).click()
    await expect(page.getByText('Invitación creada')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('table', { name: 'Equipo' }).getByText('ana', { exact: true })).toBeVisible()
  })

  test('cambia el rol y el último administrador no se puede degradar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Laura Méndez' }).click()
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cambiar rol' })
    await dialog.getByRole('combobox', { name: 'Rol' }).selectOption('admin')
    await dialog.getByRole('button', { name: 'Guardar rol' }).click()
    await expect(page.getByText('Rol actualizado')).toBeVisible()
    await expect(page.getByRole('row', { name: /Laura Méndez/ })).toContainText('Administrador')

    // Con dos administradores se puede degradar a uno; el que queda ya no.
    await page.getByRole('button', { name: 'Acciones de Laura Méndez' }).click()
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    await dialog.getByRole('combobox', { name: 'Rol' }).selectOption('agent')
    await dialog.getByRole('button', { name: 'Guardar rol' }).click()
    await expect(page.getByRole('row', { name: /Laura Méndez/ })).toContainText('Agente')

    await page.getByRole('button', { name: `Acciones de ${me.user.name}` }).click()
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    await dialog.getByRole('combobox', { name: 'Rol' }).selectOption('agent')
    await dialog.getByRole('button', { name: 'Guardar rol' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Debe quedar al menos un administrador activo.')
  })

  test('retira a un miembro tras confirmar y pasa al filtro de retirados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Daniel Santos' }).click()
    await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
    await expect(dialog).toContainText('Daniel Santos dejará de poder entrar')
    await dialog.getByRole('button', { name: 'Retirar del equipo' }).click()
    await expect(page.getByText('Miembro retirado')).toBeVisible()
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByText('Daniel Santos')).toHaveCount(0)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Retirados' }).click()
    await expect(table.getByText('Daniel Santos')).toBeVisible()
  })

  test('un agente ve el equipo en lectura, sin invitar ni menú de acciones', async ({ page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...me, role: 'agent' }) }),
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await expect(page.getByRole('table', { name: 'Equipo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invitar agente' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Acciones de/ })).toHaveCount(0)
  })

  test('en móvil el equipo son tarjetas y el diálogo de invitación cabe en 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table).toBeVisible()
    // Las tarjetas muestran el encabezado de columnas solo a lectores de pantalla.
    const header = table.getByRole('row').first()
    expect((await header.boundingBox())?.width).toBeLessThanOrEqual(1)
    const card = table.getByRole('row').nth(1)
    expect((await card.boundingBox())!.width).toBeGreaterThan(250)

    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('un administrador da acceso al portal a un cliente y la insignia cambia', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes/c-carlos')
    await expect(page.getByText('Sin acceso')).toBeVisible()
    await page.getByRole('button', { name: 'Dar acceso al portal' }).click()
    const dialog = page.getByRole('dialog', { name: 'Dar acceso al portal' })
    await dialog.getByRole('button', { name: 'Dar acceso' }).click()
    await expect(page.getByText('Invitación creada')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Invitación pendiente')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dar acceso al portal' })).toHaveCount(0)
  })

  test('en el rango intermedio cada fila tiene tantas cabeceras como celdas', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table).toBeVisible()
    const headers = await table.getByRole('columnheader').count()
    expect(headers).toBe(5)
    for (const row of (await table.getByRole('row').all()).slice(1)) {
      expect(await row.getByRole('cell').count()).toBe(headers)
    }
    // Una sola fila de cabecera: los títulos visibles comparten la misma línea.
    const tops = await Promise.all(
      ['Agente', 'Estado', 'Carga'].map(
        async (name) => (await table.getByRole('columnheader', { name }).boundingBox())!.y,
      ),
    )
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
  })

  for (const width of [320, 1440]) {
    test(`un nombre de 120 caracteres no se recorta en los diálogos · ${width}px`, async ({ page }) => {
      const name = 'A'.repeat(120)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/equipo')
      await page.getByRole('button', { name: 'Invitar agente' }).click()
      const invite = page.getByRole('dialog', { name: 'Invitar agente' })
      await invite.getByRole('textbox', { name: 'Correo' }).fill('largo@acme.example')
      await invite.getByRole('textbox', { name: 'Nombre' }).fill(name)
      await invite.getByRole('button', { name: 'Invitar' }).click()
      await expect(invite).toBeHidden()

      const fits = async (dialog: ReturnType<typeof page.getByRole>) => {
        const box = (await dialog.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        const clipped = await dialog.evaluate((element) => {
          const all = [element, ...element.querySelectorAll<HTMLElement>('*')]
          return all.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.tagName)
        })
        expect(clipped, 'ningún elemento del diálogo desborda').toEqual([])
      }

      await page.getByRole('button', { name: `Acciones de ${name}` }).click()
      await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
      const remove = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
      await expect(remove).toContainText(name)
      await fits(remove)
      await remove.getByRole('button', { name: 'Cancelar' }).click()

      await page.getByRole('button', { name: `Acciones de ${name}` }).click()
      await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
      await fits(page.getByRole('dialog', { name: 'Cambiar rol' }))
    })
  }
})
