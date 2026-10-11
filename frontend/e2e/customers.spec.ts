import { expect, test } from './fixtures'

test.describe('clientes', () => {
  test('el directorio agrupa por empresa, filtra, busca y muestra los archivados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes')
    // Con los tickets de la demostración: Carlos (en progreso), Ana (en espera) y María (abierto) tienen uno abierto.
    await expect(page.getByText('3 clientes de 3 empresas · 3 con tickets abiertos · 1 nuevo este mes')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Lumen Diseño', 'Northstar', 'Orbit Labs'])
    const northstar = page.getByRole('region', { name: 'Northstar' })
    await expect(northstar).toContainText('1 cliente · 1 ticket abierto')
    await expect(northstar.getByRole('link', { name: /#1047 Error al procesar el pago/ })).toHaveAttribute(
      'href',
      '/tickets/1047',
    )
    await expect(northstar.getByText('1 abierto')).toBeVisible()
    // Regla de #131: el recuento se ve una sola vez (el de `Pagination`); no hay leyenda de tabla que lo repita.
    await expect(page.getByText(/^\d+–\d+ de \d+ (empresas?|resultados?)$/)).toHaveCount(1)
    await expect(page.getByText(/^Mostrando \d+ resultados?$/)).toHaveCount(0)

    await page.getByRole('combobox', { name: 'Empresa del cliente' }).selectOption('Northstar')
    await expect(page).toHaveURL(/company=Northstar/)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Northstar'])
    await expect(page.getByRole('link', { name: 'Carlos Ruiz' })).toHaveAttribute('href', '/clientes/c-carlos')
    await expect(page.getByRole('button', { name: 'Quitar el filtro Empresa del cliente: Northstar' })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill('zzz')
    await expect(page.getByRole('heading', { name: 'No encontramos clientes' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)
    await expect(page).toHaveURL(/\/clientes$/)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Archivados' }).click()
    await expect(page).toHaveURL(/archived=true/)
    await expect(page.getByRole('heading', { level: 2, name: 'Sin empresa' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Luis Gómez' })).toBeVisible()
    await expect(page.getByText('Sin conversaciones todavía')).toBeVisible()
  })

  test('«Sin agrupar» muestra una lista plana con la empresa de cada cliente y se recupera de la URL', async ({
    page,
  }) => {
    await page.goto('/clientes?group=none')
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
    const list = page.getByRole('group', { name: 'Clientes' })
    await expect(list.getByRole('link', { name: 'María Pérez' })).toBeVisible()
    await expect(list).toContainText('Orbit Labs')
    await page.getByLabel('Agrupar').selectOption('company')
    await expect(page).toHaveURL(/\/clientes$/)
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)
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
    await page.getByRole('link', { name: 'María Pérez' }).click()
    await expect(page).toHaveURL(/\/clientes\/c-maria$/)
    await expect(page.getByRole('heading', { level: 1, name: 'María Pérez' })).toBeVisible()
    await expect(page.getByText('1 ticket · 1 abierto · 0 resueltos')).toBeVisible()
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
    await expect(page.getByRole('link', { name: 'María Pérez Ruiz' })).toBeVisible()
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

  for (const theme of ['light', 'dark']) {
    test(`el contorno de foco del panel de pestañas se ve entero y la tabla sigue de borde a borde · ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/clientes/c-maria')
      const table = page.getByRole('table', { name: 'Tickets de María Pérez' })
      await expect(table.getByRole('columnheader', { name: 'Responsable' })).toBeVisible()
      await page.getByRole('tab', { name: 'Tickets' }).focus()
      await page.keyboard.press('Tab')
      const panel = page.getByRole('tabpanel')
      await expect(panel).toBeFocused()
      const measures = await panel.evaluate((node) => {
        const style = getComputedStyle(node)
        // Contenedor que recorta (overflow distinto de visible): el contorno debe quedar dentro de él.
        let clip: HTMLElement | null = node.parentElement
        while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement
        const inner = node.getBoundingClientRect()
        const outer = clip!.getBoundingClientRect()
        const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
        return {
          outlineWidth: parseFloat(style.outlineWidth),
          // Cuánto sobresale el contorno por fuera de la caja del panel (≤ 0: nada).
          outset: reach,
          left: inner.left - outer.left,
          right: outer.right - inner.right,
          top: inner.top - outer.top,
          bottom: outer.bottom - inner.bottom,
        }
      })
      expect(measures.outlineWidth).toBeGreaterThan(0)
      expect(measures.outset).toBeLessThanOrEqual(0)
      // El panel no deja margen lateral (la tabla va de borde a borde), pero el contorno queda dentro de su caja.
      expect(measures.left).toBeLessThanOrEqual(1)
      expect(measures.right).toBeLessThanOrEqual(1)
      const box = (await table.boundingBox())!
      const panelBox = (await panel.boundingBox())!
      expect(Math.abs(box.x - panelBox.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(box.x + box.width - (panelBox.x + panelBox.width))).toBeLessThanOrEqual(1)
    })
  }

  for (const width of [1200, 1218]) {
    test(`a ${width} px la tabla de tickets del detalle no está en tarjetas y conserva sus columnas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/clientes/c-maria')
      const table = page.getByRole('table', { name: 'Tickets de María Pérez' })
      for (const name of ['Estado', 'Prioridad', 'Responsable', 'Actualizado']) {
        await expect(table.getByRole('columnheader', { name })).toBeVisible()
      }
      expect((await table.getByRole('row').first().boundingBox())!.width).toBeGreaterThan(300)
    })
  }

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

  // Volumen: muchas empresas, nombres larguísimos y una empresa con más clientes de los que se ven.
  const longCompany = `Asociación Colombiana de Distribuidores de Repuestos Agrícolas del Valle del Cauca ${'y su federación '.repeat(3)}`
  const longName = `Ana García Fernández de la Fuente y Rodríguez de Santa Cruz ${'de los Ríos '.repeat(5)}`
  const longEmail = `${'ana.garcia.fernandez.de.la.fuente.'.repeat(3)}@orbit-labs.example`
  const longSubject = `No puedo acceder a mi cuenta desde que cambié el correo de facturación ${'y el teléfono '.repeat(6)}`

  /** Responde la lista agrupada con clientes y empresas de nombres larguísimos; el resto de la API es la simulada. */
  async function mockVolume(page: import('@playwright/test').Page) {
    const customer = (index: number) => ({
      id: `c-${index}`,
      name: index === 0 ? longName : `Cliente ${index}`,
      email: index === 0 ? longEmail : `cliente${index}@orbit-labs.example`,
      company: longCompany,
      openTickets: index % 3,
      totalTickets: 4,
      createdAt: '2026-09-01T10:00:00Z',
      archived: false,
      lastTicket: {
        number: 1000 + index,
        subject: index === 0 ? longSubject : 'Factura duplicada',
        status: 'open',
        updatedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
      },
    })
    await page.route('**/api/customers/by-company**', (route) =>
      route.fulfill({
        json: {
          items: [
            { company: longCompany, customerCount: 14, openTickets: 9, customers: [0, 1, 2].map(customer) },
            { company: 'Orbit Labs', customerCount: 1, openTickets: 0, customers: [customer(5)] },
          ],
          page: 0,
          size: 8,
          totalItems: 38,
          totalPages: 5,
        },
      }),
    )
  }

  for (const width of [320, 390, 767, 768, 1024, 1199, 1200, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`con empresas, nombres y correos larguísimos no hay scroll horizontal ni textos recortados · ${width}px · ${theme}`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await mockVolume(page)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/clientes')
        await expect(page.getByRole('heading', { level: 2, name: longCompany })).toBeVisible()
        await expect(page.getByRole('link', { name: `Ver los 14 clientes de ${longCompany}` })).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        // Nada se recorta: ningún texto del directorio es más ancho que su caja ni sale de la tarjeta.
        const clipped = await page.getByRole('group', { name: 'Clientes por empresa' }).evaluate((root) => {
          const bad: string[] = []
          const card = root.getBoundingClientRect()
          for (const node of root.querySelectorAll<HTMLElement>('a, h2, p, span, time')) {
            const rect = node.getBoundingClientRect()
            if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).display !== 'inline') {
              bad.push(`${node.tagName} ${node.textContent?.slice(0, 40)} desborda`)
            }
            if (rect.width > 0 && (rect.right > card.right + 1 || rect.left < card.left - 1)) {
              bad.push(`${node.tagName} ${node.textContent?.slice(0, 40)} sale de la lista`)
            }
          }
          return bad
        })
        expect(clipped).toEqual([])
      })
    }
  }

  for (const width of [390, 767]) {
    test(`los enlaces del directorio miden 44 px de alto · ${width}px`, async ({ page }) => {
      await mockVolume(page)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/clientes')
      await expect(page.getByRole('link', { name: 'Cliente 1' })).toBeVisible()
      const links = page.getByRole('group', { name: 'Clientes por empresa' }).getByRole('link')
      const count = await links.count()
      expect(count).toBeGreaterThan(5)
      for (let index = 0; index < count; index++) {
        const box = (await links.nth(index).boundingBox())!
        expect(box.height, `enlace ${index}`).toBeGreaterThanOrEqual(43.5)
      }
    })
  }

  test('desde 1200 px cada cliente cabe en una línea y por debajo se apila sin salirse', async ({ page }) => {
    await mockVolume(page)
    const rowOf = (name: string) => page.getByRole('link', { name, exact: true }).locator('xpath=ancestor::li[1]')
    for (const [width, sameLine] of [
      [1440, true],
      [1200, true],
      [1199, false],
      [1024, false],
      [390, false],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/clientes')
      const row = rowOf('Cliente 1')
      await expect(row).toBeVisible()
      const name = (await row.getByRole('link', { name: 'Cliente 1' }).boundingBox())!
      const last = (await row.getByText('Última conversación').boundingBox())!
      if (sameLine) expect(last.y).toBeLessThan(name.y + name.height)
      else expect(last.y).toBeGreaterThanOrEqual(name.y + name.height - 1)
    }
  })

  test('«Ver los N clientes» abre la empresa entera en la misma página, con chip, volver y paginación por empresas', async ({
    page,
  }) => {
    await mockVolume(page)
    await page.route('**/api/customers?**', (route) =>
      route.fulfill({
        json: {
          items: Array.from({ length: 14 }, (_, index) => ({
            id: `c-${index}`,
            name: `Cliente ${index}`,
            email: `cliente${index}@orbit-labs.example`,
            company: longCompany,
            openTickets: 0,
            totalTickets: 0,
            createdAt: '2026-09-01T10:00:00Z',
            archived: false,
            lastTicket: null,
          })),
          page: 0,
          size: 20,
          totalItems: 14,
          totalPages: 1,
        },
      }),
    )
    await page.goto('/clientes')
    await expect(page.getByText('1–8 de 38 empresas')).toBeVisible()
    await page.getByRole('link', { name: `Ver los 14 clientes de ${longCompany}` }).click()
    await expect(page).toHaveURL(/\/clientes\?company=/)
    await expect(page.getByRole('link', { name: 'Cliente 13' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Quitar el filtro Empresa del cliente: Asociación/ })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Clientes' })).toContainText('14 clientes')
    // Es la misma página: se vuelve con el enlace o quitando el chip (el foco, con teclado, se prueba abajo).
    await page.getByRole('link', { name: '← Volver a todas las empresas' }).click()
    await expect(page).toHaveURL(/\/clientes$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Orbit Labs' })).toBeVisible()
  })

  test('con teclado, quitar el chip, volver a todas las empresas y abrir una empresa dejan el foco en la lista', async ({
    page,
  }) => {
    const list = page.getByRole('region', { name: 'Lista de clientes' })

    await page.goto('/clientes?company=Northstar')
    const chip = page.getByRole('button', { name: 'Quitar el filtro Empresa del cliente: Northstar' })
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/clientes$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Orbit Labs' })).toBeVisible()
    await expect(list).toBeFocused()

    await page.goto('/clientes?company=Northstar')
    await page.getByRole('link', { name: '← Volver a todas las empresas' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/clientes$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Orbit Labs' })).toBeVisible()
    await expect(list).toBeFocused()

    await mockVolume(page)
    await page.goto('/clientes')
    await page.getByRole('link', { name: `Ver los 14 clientes de ${longCompany}` }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/clientes\?company=/)
    await expect(list).toBeFocused()
  })

  test('el esqueleto reserva el sitio del resumen y de la lista: nada se mueve al llegar los datos', async ({
    page,
  }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/customers/by-company**', async (route) => {
      await gate
      await route.fallback()
    })
    await page.route('**/api/customers/metrics', async (route) => {
      await gate
      await route.fallback()
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes')
    await expect(page.getByText('Cargando clientes…')).toBeAttached()
    const marks = () =>
      page.evaluate(() => {
        const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? -1
        return {
          filters: top('section[aria-label="Buscar y filtrar clientes"]'),
          list: top('[aria-label="Lista de clientes"]'),
          header: Math.round(document.querySelector('header h1')!.parentElement!.getBoundingClientRect().height),
          cards: Array.from(document.querySelectorAll('[aria-label="Lista de clientes"] section')).map((card) =>
            Math.round(card.getBoundingClientRect().height),
          ),
        }
      })
    const before = await marks()
    release()
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await expect(page.getByText('3 clientes de 3 empresas')).toBeVisible()
    const after = await marks()
    // El resumen ocupa su línea desde el principio y los filtros y la lista no bajan ni suben al llegar los datos.
    expect(after.header).toBe(before.header)
    expect(after.filters).toBe(before.filters)
    expect(after.list).toBe(before.list)
    // Las tarjetas del esqueleto miden lo que una real con un cliente de una línea; la de Northstar tiene un asunto largo
    // que envuelve (el contenido manda) y solo puede ser más alta.
    expect(after.cards[0]).toBe(before.cards[0])
    expect(after.cards[2]).toBe(before.cards[2])
    expect(after.cards[1]).toBeGreaterThanOrEqual(before.cards[1]!)
  })

  test('un error en el directorio ofrece reintentar y un 403 dice que no hay acceso', async ({ page }) => {
    let failing = true
    await page.route('**/api/customers/by-company**', (route) =>
      failing
        ? route.fulfill({
            status: 500,
            contentType: 'application/problem+json',
            body: '{"status":500,"title":"Error"}',
          })
        : route.fallback(),
    )
    await page.goto('/clientes')
    await expect(page.getByRole('heading', { name: 'No pudimos cargar los clientes' })).toBeVisible()
    await expect(page.getByText(/\d+ clientes de/)).toBeVisible()
    failing = false
    await page.getByRole('button', { name: 'Reintentar cargar los clientes' }).click()
    await expect(page.getByRole('link', { name: 'María Pérez' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Lista de clientes' })).toBeFocused()

    await page.route('**/api/customers/by-company**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: '{"status":403,"title":"Prohibido"}',
      }),
    )
    await page.reload()
    await expect(page.getByRole('heading', { name: 'No tienes acceso a los clientes' })).toBeVisible()
  })
})
