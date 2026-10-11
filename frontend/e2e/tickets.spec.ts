import type { Page, Route } from '@playwright/test'
import type { Ticket, TicketSummary } from '../src/api/schema'
import { expect, mockApi, test, tickets } from './fixtures'

const row = (page: Page) => page.locator('a[data-inbox-item]')
/** Las cabeceras de grupo por día de la lista (no el título del panel de la derecha). */
const listHeadings = (page: Page) =>
  page.getByRole('region', { name: 'Bandeja de tickets' }).getByRole('heading', { level: 2 })
const preview = (page: Page) => page.getByRole('region', { name: 'Vista previa del ticket' })
const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Una página de la lista según `page` y `size` de la petición, con el sobre del contrato. */
function listPage(route: Route, items: TicketSummary[]) {
  const url = new URL(route.request().url())
  const size = Number(url.searchParams.get('size')) || 20
  const index = Number(url.searchParams.get('page')) || 0
  return route.fulfill({
    json: {
      items: items.slice(index * size, (index + 1) * size),
      page: index,
      size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  })
}

/** `total` tickets, uno cada 20 minutos hacia atrás, y el detalle y los mensajes de cualquiera de ellos. */
async function serveMany(page: Page, total: number) {
  const base = tickets[0]!
  const items: TicketSummary[] = Array.from({ length: total }, (_, index) => {
    const number = 1148 - index
    const updatedAt = new Date(Date.now() - index * 20 * 60_000).toISOString()
    return {
      ...base,
      id: `t-${number}`,
      number,
      subject: `Ticket ${number} de la tanda larga`,
      updatedAt,
      lastMessage: {
        excerpt: `Último mensaje de ${number}`,
        authorName: 'Laura Méndez',
        internal: false,
        createdAt: updatedAt,
      },
    }
  })
  await page.route('**/api/tickets?*', (route) => listPage(route, items))
  await page.route(/\/api\/tickets\/\d+$/, (route) => {
    const number = Number(new URL(route.request().url()).pathname.split('/').pop())
    const summary = items.find((item) => item.number === number)
    if (!summary) return route.fulfill({ status: 404, json: { status: 404, title: 'No encontrado' } })
    const { lastMessage: _lastMessage, ...rest } = summary
    const detail: Ticket = { ...rest, description: `Descripción de ${number}`, version: 1 }
    return route.fulfill({ json: detail, headers: { ETag: '"1"' } })
  })
  await page.route(/\/api\/tickets\/\d+\/messages$/, (route) => route.fulfill({ json: [] }))
  return items
}

test.describe('tickets · bandeja con vista previa', () => {
  test('desde 1200 px, elegir una fila abre su vista previa y «Abrir completo» lleva al detalle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(3)
    await expect(preview(page).getByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeVisible()

    await page.getByRole('link', { name: /#1047/ }).click()
    await expect(page).toHaveURL(/\?ticket=1047$/)
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText(/Error al procesar el pago/)
    await expect(preview(page).getByRole('combobox', { name: 'Estado' })).toHaveValue('in_progress')
    await expect(page.getByRole('link', { name: /#1047/ })).toHaveAttribute('aria-current', 'true')

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'En progreso' }).click()
    await expect(page).toHaveURL(/status=in_progress/)
    await expect(page).toHaveURL(/ticket=1047/)
    await expect(row(page)).toHaveCount(1)

    await preview(page).getByRole('link', { name: 'Abrir completo' }).click()
    await expect(page).toHaveURL(/\/tickets\/1047$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Error al procesar el pago/)
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText('#1047')
  })

  test('un enlace con ?ticket= abre la vista previa y recargar la conserva', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1048')
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    await page.reload()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    // El compositor que ya existe, con la respuesta al cliente y la nota interna, y la conversación entera.
    await expect(preview(page).getByRole('radio', { name: 'Nota interna' })).toBeAttached()
    await expect(preview(page).getByText('Verificación completada. No hay bloqueos activos.')).toBeVisible()
  })

  for (const [width, panes] of [
    [1199, false],
    [1200, true],
  ] as const) {
    test(`frontera de 1200 px: a ${width} px ${panes ? 'hay' : 'no hay'} vista previa`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/tickets?ticket=1048')
      await expect(row(page)).toHaveCount(3)
      await expect(preview(page)).toHaveCount(panes ? 1 : 0)
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
    })
  }

  test('por debajo de 1200 px solo hay lista y tocar un ticket abre el detalle', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/tickets')
    await expect(preview(page)).toHaveCount(0)
    await page.getByRole('link', { name: /#1048/ }).click()
    await expect(page).toHaveURL(/\/tickets\/1048$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No puedo acceder a mi cuenta')
  })

  test('en móvil la lista usa tarjetas y el detalle apila la información', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await expect(row(page).first()).toContainText('Laura Méndez')
    await page.getByRole('link', { name: /#1048/ }).click()
    const conversation = page.getByRole('article', { name: /Laura Méndez · Agente/ })
    const info = page.getByRole('complementary', { name: 'Información del ticket' })
    const [conversationBox, infoBox] = await Promise.all([conversation.boundingBox(), info.boundingBox()])
    expect(infoBox!.y).toBeGreaterThan(conversationBox!.y)
  })

  test('el atajo de búsqueda abre la búsqueda global sin salir del ticket', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets/1048')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: 'Buscar en Resolve' })).toBeFocused()
    await expect(page).toHaveURL(/\/tickets\/1048$/)
  })

  test('el formulario de nuevo ticket valida antes de enviar', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/tickets/nuevo')
    await page.getByRole('button', { name: 'Crear ticket' }).click()
    await expect(page.getByRole('combobox', { name: 'Cliente' })).toBeFocused()
    await expect(page.getByText('Describe el problema en una frase.')).toBeVisible()
  })
})

test.describe('tickets · búsqueda y orden', () => {
  test('«Ver todos los resultados de tickets» de la búsqueda global encuentra también los resueltos', async ({
    page,
  }) => {
    const resolved: TicketSummary = {
      ...tickets[2]!,
      id: 't-1040',
      number: 1040,
      subject: 'Factura resuelta de septiembre',
      status: 'resolved',
      lastMessage: null,
    }
    const requested: string[][] = []
    await page.route('**/api/tickets?*', (route) => {
      const url = new URL(route.request().url())
      const statuses = url.searchParams.getAll('status')
      const q = url.searchParams.get('q')?.toLowerCase() ?? ''
      requested.push(statuses)
      // Como el servidor: sin filtro de estado, todos; con él, solo los pedidos.
      const items = [...tickets, resolved].filter(
        (ticket) =>
          (statuses.length === 0 || statuses.includes(ticket.status)) && ticket.subject.toLowerCase().includes(q),
      )
      return listPage(route, items)
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(3)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Buscar en Resolve' }).fill('factura')
    await page.getByRole('option', { name: 'Ver todos los resultados de tickets' }).click()

    await expect(page).toHaveURL(/\/tickets\?q=factura$/)
    const found = row(page).filter({ hasText: '#1040' })
    await expect(found).toBeVisible()
    await expect(found).toContainText('Resuelto')
    // La petición de la bandeja con búsqueda no lleva filtro de estado.
    expect(requested.at(-1)).toEqual([])
  })

  test('«Ordenar por» cambia a lista plana, con el pie de su orden, y los enlaces con sort funcionan', async ({
    page,
  }) => {
    await serveMany(page, 60)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(25)
    await expect(listHeadings(page).first()).toBeVisible()
    await expect(page.getByText('Mostrando 25 de 60 · ordenados por actualización')).toBeVisible()

    await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption({ label: 'Prioridad: urgente primero' })
    await expect(page).toHaveURL(/sort=priority%2Cdesc/)
    await expect(page.getByText('Mostrando 25 de 60 · ordenados por prioridad, los urgentes primero')).toBeVisible()
    await expect(listHeadings(page)).toHaveCount(0)

    await page.goto('/tickets?sort=number,asc')
    await expect(page.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('number,asc')
    await expect(page.getByText(/ordenados por número, de menor a mayor/)).toBeVisible()
    await expect(listHeadings(page)).toHaveCount(0)

    // Con la actualización, en cualquier sentido, vuelven los grupos por día.
    await page.goto('/tickets?sort=updatedAt,asc')
    await expect(listHeadings(page).first()).toBeVisible()
    await expect(page.getByText(/ordenados por actualización, los más antiguos primero/)).toBeVisible()
  })
})

test.describe('tickets · foco al guardar y al cambiar de ticket', () => {
  test('guardar el estado con el teclado deja el foco en el selector, también con un conflicto', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let conflict = false
    await page.route('**/api/tickets/1048', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      await held
      return conflict
        ? route.fulfill({ status: 412, json: { status: 412, title: 'El recurso cambió' } })
        : route.fallback()
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1048')
    const status = preview(page).getByRole('combobox', { name: 'Estado' })
    await expect(status).toBeVisible()
    await status.focus()
    await page.keyboard.press('ArrowDown')
    await expect(status).toHaveAttribute('aria-disabled', 'true')
    await expect(status).toBeFocused()
    release()
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Estado:')
    await expect(status).not.toHaveAttribute('aria-disabled')
    await expect(status).toBeFocused()
    // El siguiente Tab sigue donde estaba, no desde el principio de la página.
    await page.keyboard.press('Tab')
    await expect(preview(page).getByRole('combobox', { name: 'Responsable' })).toBeFocused()

    conflict = true
    const responsible = preview(page).getByRole('combobox', { name: 'Responsable' })
    // Laura es la última opción de la lista: ↑ elige a la anterior.
    await page.keyboard.press('ArrowUp')
    await expect(preview(page).getByText('El ticket cambió mientras lo editabas')).toBeVisible()
    await expect(responsible).toBeFocused()
  })

  test('«Reintentar» con éxito deja el foco en el panel, no en body', async ({ page }) => {
    let fail = true
    await page.route('**/api/tickets/1048', (route) =>
      fail && route.request().method() === 'GET'
        ? route.fulfill({ status: 500, json: { status: 500, title: 'Error' } })
        : route.fallback(),
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1048')
    const retry = preview(page).getByRole('button', { name: 'Reintentar cargar el ticket #1048' })
    await expect(retry).toBeVisible()
    await retry.focus()
    fail = false
    await page.keyboard.press('Enter')
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    await expect(preview(page)).toBeFocused()
  })

  test('«Quitar la selección» y volver atrás con el foco en la vista previa no lo dejan en body', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=999')
    await preview(page).getByRole('button', { name: 'Quitar la selección' }).focus()
    await page.keyboard.press('Enter')
    await expect(preview(page).getByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeVisible()
    await expect(preview(page)).toBeFocused()
    // Con el teclado, el panel enfocado se ve: anillo del tema, no `outline: none`.
    const ring = await preview(page).evaluate((node) => {
      const style = getComputedStyle(node)
      return { visible: node.matches(':focus-visible'), style: style.outlineStyle, width: style.outlineWidth }
    })
    expect(ring).toEqual({ visible: true, style: 'solid', width: '2px' })

    await page.goto('/tickets?ticket=1048')
    await page.getByRole('link', { name: /#1047/ }).click()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText(/Error al procesar el pago/)
    await preview(page).getByRole('combobox', { name: 'Estado' }).focus()
    await page.goBack()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    await expect(preview(page)).toBeFocused()
  })
})

test.describe('tickets · teclado', () => {
  test('la lista es una sola parada de Tab; flechas para moverse, Enter para abrir y el foco se queda', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(3)
    const rows = await row(page).all()
    await expect(rows[0]).toHaveAttribute('tabindex', '0')
    await expect(rows[1]).toHaveAttribute('tabindex', '-1')

    // Desde el buscador, el Tab llega a la lista en la primera fila y la salta entera.
    await page.getByRole('searchbox', { name: 'Buscar tickets' }).focus()
    for (let presses = 0; presses < 12; presses++) {
      await page.keyboard.press('Tab')
      if (await rows[0]!.evaluate((node) => node === document.activeElement)) break
    }
    await expect(rows[0]).toBeFocused()
    await page.keyboard.press('Tab')
    for (const item of rows) await expect(item).not.toBeFocused()

    await rows[0]!.focus()
    await page.keyboard.press('ArrowDown')
    await expect(rows[1]).toBeFocused()
    await page.keyboard.press('End')
    await expect(rows[2]).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(rows[1]).toBeFocused()
    await page.keyboard.press('Home')
    await expect(rows[0]).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\?ticket=1048$/)
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    await expect(rows[0]).toBeFocused()
    // La fila enfocada es ahora la parada de Tab, y desde ahí se sigue con las flechas.
    await expect(rows[0]).toHaveAttribute('tabindex', '0')
    await page.keyboard.press('ArrowDown')
    await expect(rows[1]).toBeFocused()
  })
})

test.describe('tickets · volumen (132 tickets)', () => {
  test('la lista se desplaza sola, la vista previa queda fija y las cabeceras de grupo se pegan arriba', async ({
    page,
  }) => {
    await serveMany(page, 132)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1148')
    await expect(row(page)).toHaveCount(25)
    await expect(page.getByText('Mostrando 25 de 132 · ordenados por actualización')).toBeVisible()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('Ticket 1148 de la tanda larga')

    // La página no se desplaza: lo hacen la lista y la conversación.
    const pageScrolls = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(pageScrolls).toBeLessThanOrEqual(1)

    const scroller = row(page).first().locator('xpath=ancestor::div[contains(@class, "scroller")][1]')
    const previewHeader = preview(page).locator('header').first()
    const headerBefore = (await previewHeader.boundingBox())!
    const firstBefore = (await row(page).first().boundingBox())!
    await scroller.evaluate((node) => (node.scrollTop = 900))
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
    const headerAfter = (await previewHeader.boundingBox())!
    expect(headerAfter.y).toBe(headerBefore.y)
    expect(headerAfter.height).toBe(headerBefore.height)
    expect((await row(page).first().boundingBox())!.y).toBeLessThan(firstBefore.y)

    // La cabecera del grupo visible queda pegada al borde superior de la lista.
    const top = (await scroller.boundingBox())!.y
    const stuck = await page
      .getByRole('heading', { level: 2 })
      .evaluateAll(
        (headings, listTop) =>
          headings
            .map((heading) => Math.abs(heading.getBoundingClientRect().top - listTop))
            .some((distance) => distance <= 1),
        top,
      )
    expect(stuck).toBe(true)
  })

  test('«Cargar 25 más» añade filas sin mover las que ya están y deja el foco en la primera nueva', async ({
    page,
  }) => {
    await serveMany(page, 132)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(25)

    await page.getByRole('button', { name: 'Cargar 25 más' }).click()
    await expect(row(page)).toHaveCount(50)
    // El foco pasa a la primera fila nueva y la lista se desplaza lo justo para que se vea.
    await expect(row(page).nth(25)).toBeFocused()
    await expect(row(page).nth(25)).toBeInViewport()
    await expect(row(page).first().getByText('Ticket 1148 de la tanda larga')).toBeAttached()
    await expect(page.getByText('Mostrando 50 de 132 · ordenados por actualización')).toBeVisible()

    for (const count of [75, 100, 125]) {
      await page.getByRole('button', { name: 'Cargar 25 más' }).click()
      await expect(row(page)).toHaveCount(count)
    }
    await page.getByRole('button', { name: 'Cargar 7 más' }).click()
    await expect(row(page)).toHaveCount(132)
    await expect(row(page).nth(125)).toBeFocused()
    await expect(page.getByRole('button', { name: /Cargar/ })).toHaveCount(0)
    await expect(page.getByText('Mostrando 132 de 132 · ordenados por actualización')).toBeVisible()
  })

  test('por debajo de 1200 px la lista larga desplaza la página y carga de 25 en 25', async ({ page }) => {
    await serveMany(page, 60)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    await expect(row(page)).toHaveCount(25)
    await page.getByRole('button', { name: 'Cargar 25 más' }).click()
    await expect(row(page)).toHaveCount(50)
    await page.getByRole('button', { name: 'Cargar 10 más' }).click()
    await expect(row(page)).toHaveCount(60)
    expect(await overflowX(page)).toBeLessThanOrEqual(0)
  })

  test('con el aviso de la demostración visible, el pie de la lista no queda debajo del aviso', async ({ page }) => {
    await mockApi(page, 'admin', { demo: true })
    await page.setViewportSize({ width: 1440, height: 700 })
    await page.goto('/tickets')
    const footer = page.getByText(/^Mostrando \d+ de \d+/)
    const banner = page.getByRole('region', { name: 'Demostración pública' })
    await expect(footer).toBeVisible()
    await expect(banner).toBeVisible()
    await expect
      .poll(
        async () =>
          (await banner.boundingBox())!.y - ((await footer.boundingBox())!.y + (await footer.boundingBox())!.height),
      )
      .toBeGreaterThanOrEqual(0)
  })
})

test.describe('tickets · textos largos', () => {
  const longName = `Cliente${'x'.repeat(113)}`
  const longSubject = `Asunto${'X'.repeat(114)}`
  const longExcerpt = 'Mensaje '.repeat(40).trim()

  async function serveLong(page: Page) {
    const first = { ...tickets[0]!, subject: longSubject }
    first.customer = { ...first.customer, name: longName, company: `Empresa${'y'.repeat(113)}` }
    first.lastMessage = {
      excerpt: longExcerpt.slice(0, 140),
      authorName: 'Laura',
      internal: false,
      createdAt: first.updatedAt,
    }
    await page.route('**/api/tickets?*', (route) => listPage(route, [first]))
    const { lastMessage: _lastMessage, ...rest } = first
    await page.route(/\/api\/tickets\/1048$/, (route) =>
      route.fulfill({ json: { ...rest, description: 'Texto', version: 1 }, headers: { ETag: '"1"' } }),
    )
  }

  for (const width of [320, 390, 767]) {
    test(`a ${width} px la tarjeta envuelve nombres y asuntos de 120 caracteres sin recortar ni desbordar`, async ({
      page,
    }) => {
      await serveLong(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/tickets')
      const link = row(page).first()
      await expect(link).toBeVisible()
      const clipped = await link
        .locator('span')
        .evaluateAll((nodes) => nodes.some((node) => node.scrollWidth > node.clientWidth + 1))
      expect(clipped).toBe(false)
      for (const cls of ['who', 'subject', 'assignee']) {
        const style = await link
          .locator(`[class*="${cls}"]`)
          .first()
          .evaluate((node) => getComputedStyle(node))
        expect(style.textOverflow, cls).not.toBe('ellipsis')
        expect(style.whiteSpace, cls).not.toBe('nowrap')
      }
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
    })
  }

  for (const width of [768, 1024, 1200, 1440]) {
    test(`a ${width} px la fila corta con «…» y no desborda; el texto entero está en el título`, async ({ page }) => {
      await serveLong(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto(width >= 1200 ? '/tickets?ticket=1048' : '/tickets')
      const link = row(page).first()
      await expect(link).toBeVisible()
      const subject = link.locator('[class*="subject"]')
      expect(await subject.evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis')
      await expect(subject).toHaveAttribute('title', `#1048 · ${longSubject}`)
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
      if (width >= 1200) {
        // La vista previa muestra el asunto entero, envuelto y sin recortar.
        const heading = preview(page).getByRole('heading', { level: 2 })
        await expect(heading).toHaveText(longSubject)
        expect(await heading.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
      }
    })
  }
})

test.describe('tickets · sin saltos de layout', () => {
  for (const [width, sort] of [
    [390, 'updatedAt,desc'],
    [1440, 'updatedAt,desc'],
    [390, 'priority,desc'],
    [1440, 'priority,desc'],
  ] as const) {
    test(`la lista y la vista previa empiezan en el mismo sitio cargando y con datos · ${width}px · ${sort}`, async ({
      page,
    }) => {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets?*', async (route) => {
        await held
        await route.fallback()
      })
      await page.route('**/api/tickets/metrics', async (route) => {
        await held
        await route.fallback()
      })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/tickets?sort=${encodeURIComponent(sort)}${width >= 1200 ? '&ticket=1048' : ''}`)
      await expect(page.getByText('Cargando tickets…')).toBeAttached()
      const measure = async () => ({
        search: (await page.getByRole('searchbox', { name: 'Buscar tickets' }).boundingBox())!.y,
        views: (await page.getByRole('navigation', { name: 'Vistas de la bandeja' }).boundingBox())!,
        firstRow: (await page.locator('li:has(> [data-inbox-item], > span[class*="link"])').first().boundingBox())!.y,
      })
      const loading = await measure()
      release()
      await expect(row(page)).toHaveCount(3)
      await expect(page.getByRole('link', { name: 'Abiertos 3' })).toBeVisible()
      const loaded = await measure()
      expect(loaded.search).toBe(loading.search)
      expect(loaded.views.y).toBe(loading.views.y)
      expect(loaded.views.height, 'las vistas no cambian de alto al llegar los números').toBe(loading.views.height)
      expect(loaded.firstRow, 'la primera fila queda donde estaba su esqueleto').toBe(loading.firstRow)
    })
  }

  test('la vista previa no mueve la conversación al llegar el ticket · 1440px', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(/\/api\/tickets\/1048$/, async (route) => {
      await held
      await route.fallback()
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1048')
    await expect(preview(page).getByText('Cargando ticket…')).toBeAttached()
    const header = preview(page).locator('header').first()
    const loading = (await header.boundingBox())!
    release()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    const loaded = (await header.boundingBox())!
    expect(loaded.y).toBe(loading.y)
    expect(loaded.height, 'la cabecera mide lo mismo cargando y con datos').toBe(loading.height)
  })

  test('cambiar de vista conserva la altura de las píldoras y no mueve la lista · 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/tickets')
    await expect(page.getByRole('link', { name: 'Abiertos 3' })).toBeVisible()
    const views = page.getByRole('navigation', { name: 'Vistas de la bandeja' })
    const before = (await views.boundingBox())!
    await page.getByRole('link', { name: /^Resueltos/ }).click()
    await expect(page.getByRole('heading', { name: 'Todavía no hay tickets resueltos' })).toBeVisible()
    const after = (await views.boundingBox())!
    expect(after.y).toBe(before.y)
    expect(after.height).toBe(before.height)
  })
})

test.describe('tickets · estados', () => {
  test('bandeja vacía, vista vacía y búsqueda sin resultados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route('**/api/tickets?*', (route) => listPage(route, []))
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: 'No hay tickets abiertos' })).toBeVisible()
    await page.getByRole('link', { name: /^Míos/ }).click()
    await expect(page.getByRole('heading', { name: 'No tienes tickets asignados' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar tickets' }).fill('zzz')
    await expect(page.getByRole('heading', { name: 'No encontramos tickets' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page.getByRole('searchbox', { name: 'Buscar tickets' })).toHaveValue('')
    await expect(page).not.toHaveURL(/q=/)
  })

  test('un error de la lista se reintenta sin tocar la vista previa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    let fail = true
    await page.route('**/api/tickets?*', (route) =>
      fail ? route.fulfill({ status: 500, json: { status: 500, title: 'Error' } }) : route.fallback(),
    )
    await page.goto('/tickets?ticket=1048')
    await expect(page.getByRole('heading', { name: 'No pudimos cargar los tickets' })).toBeVisible()
    await expect(preview(page).getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    fail = false
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(row(page)).toHaveCount(3)
  })

  test('sin permisos para la lista no ofrece reintentar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route('**/api/tickets?*', (route) =>
      route.fulfill({ status: 403, json: { status: 403, title: 'Prohibido' } }),
    )
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: 'No tienes permiso para ver los tickets' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  })

  test('un ticket seleccionado que no existe se explica en el panel y se puede quitar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=999')
    await expect(preview(page).getByRole('heading', { name: 'No existe el ticket #999' })).toBeVisible()
    await preview(page).getByRole('button', { name: 'Quitar la selección' }).click()
    await expect(page).not.toHaveURL(/ticket=/)
    await expect(preview(page).getByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeVisible()
  })
})

test.describe('tickets · cliente', () => {
  test('«Mis solicitudes»: píldoras, «Te atiende…» y la conversación en solo lectura, sin notas internas', async ({
    page,
  }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets?ticket=1048')
    await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Abiertas/ })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('link', { name: /^Resueltas/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Nuevo ticket|Nueva solicitud/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^(Míos|Sin asignar)/ })).toHaveCount(0)

    const first = row(page).filter({ hasText: '#1048' })
    await expect(first).toContainText('Te atiende Laura')
    // El último mensaje que ve un cliente es la respuesta pública, no la nota interna posterior.
    await expect(first).toContainText('Laura: Hola María. Ya revisé tu cuenta')
    await expect(first).not.toContainText('Verificación completada')

    const panel = preview(page)
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('No puedo acceder a mi cuenta')
    await expect(panel.getByText('Hola María. Ya revisé tu cuenta')).toBeVisible()
    await expect(panel.getByText('Verificación completada')).toHaveCount(0)
    await expect(panel.getByRole('combobox')).toHaveCount(0)
    await expect(panel.getByRole('textbox')).toHaveCount(0)
  })
})

test.describe('tickets · zonas táctiles', () => {
  for (const width of [390, 700, 767]) {
    test(`a ${width} px las filas, las vistas y los controles de la cabecera miden al menos 44 px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/tickets')
      await expect(row(page)).toHaveCount(3)
      const targets = [
        ...(await row(page).all()),
        ...(await page.getByRole('navigation', { name: 'Vistas de la bandeja' }).getByRole('link').all()),
        page.getByRole('link', { name: /Nuevo ticket/ }),
        page.getByRole('button', { name: 'Estado' }),
        page.getByRole('button', { name: 'Prioridad' }),
        page.getByRole('button', { name: 'Responsable' }),
        page.getByRole('button', { name: 'Acciones del ticket #1048' }),
      ]
      for (const target of targets) {
        const box = (await target.boundingBox())!
        expect(box.height, (await target.innerText().catch(() => '')) || 'control').toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
    })
  }
})

test.describe('tickets · temas y anchos', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 767, 768, 1024, 1199, 1200, 1440]) {
      test(`sin desbordamiento horizontal y con el contraste del tema · ${theme} · ${width}px`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto(width >= 1200 ? '/tickets?ticket=1048' : '/tickets')
        await expect(row(page)).toHaveCount(3)
        expect(await overflowX(page)).toBeLessThanOrEqual(0)
        // La fila abierta y el panel usan los colores del tema, no un fondo claro fijo.
        const surface = await page
          .getByRole('region', { name: 'Bandeja de tickets' })
          .evaluate((node) => getComputedStyle(node.parentElement!).backgroundColor)
        const lightness = surface.match(/\d+/g)!.slice(0, 3).map(Number)
        const bright = lightness.reduce((sum, value) => sum + value, 0) / 3 > 128
        expect(bright).toBe(theme === 'light')
      })
    }
  }
})
