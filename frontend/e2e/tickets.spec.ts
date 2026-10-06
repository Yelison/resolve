import { expect, test, tickets } from './fixtures'

test.describe('tickets', () => {
  test('la bandeja filtra por estado y abre el detalle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tickets')
    await expect(page.getByRole('table', { name: 'Tickets' }).getByRole('row')).toHaveCount(4)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'En progreso' }).click()
    await expect(page).toHaveURL(/status=in_progress/)
    await expect(page.getByRole('table', { name: 'Tickets' }).getByRole('row')).toHaveCount(2)

    const sorted = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/api/tickets' && url.searchParams.get('sort') === 'priority,desc'
    })
    await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption({ label: 'Prioridad: urgente primero' })
    await sorted
    await expect(page).toHaveURL(/status=in_progress/)
    await expect(page).toHaveURL(/sort=priority%2Cdesc/)

    await page.getByRole('link', { name: /#1047/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Error al procesar el pago/)
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText('#1047')
  })

  test('en móvil la bandeja usa tarjetas y el detalle apila la información', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tickets')
    const firstRow = page.getByRole('table', { name: 'Tickets' }).getByRole('row').nth(1)
    await expect(firstRow).toContainText('Laura Méndez')
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

test.describe('tickets · métricas sin saltos de layout', () => {
  for (const width of [320, 390, 768, 1200, 1440]) {
    test(`la bandeja empieza a la misma altura cargando, con error y con datos · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      let fail = true
      await page.route('**/api/tickets/metrics', async (route) => {
        await held
        if (fail) await route.fulfill({ status: 500, json: { status: 500, title: 'Error' } })
        else await route.fallback()
      })
      await page.goto('/tickets')
      const inbox = page.getByRole('region', { name: 'Bandeja de tickets' })
      await expect(page.getByText('Cargando métricas…')).toBeAttached()
      const loading = (await inbox.boundingBox())!.y
      release()
      await expect(page.getByText('No pudimos cargar las métricas de la bandeja')).toBeVisible()
      const failed = (await inbox.boundingBox())!.y
      expect(Math.abs(failed - loading), `cargando ${loading}, con error ${failed}`).toBeLessThanOrEqual(4)
      fail = false
      await page.getByRole('button', { name: 'Reintentar cargar las métricas de la bandeja' }).click()
      await expect(page.getByText('Tickets abiertos')).toBeVisible()
      const loaded = (await inbox.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(4)
    })
  }
})

test.describe('tickets · tarjetas', () => {
  for (const width of [390, 700, 767]) {
    test(`a ${width} px el enlace del asunto de cada fila mide al menos 44 px de alto`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/tickets')
      const links = page.getByRole('table', { name: 'Tickets' }).getByRole('link')
      await expect(links).toHaveCount(3)
      for (const link of await links.all()) {
        const box = (await link.boundingBox())!
        expect(box.height, await link.innerText()).toBeGreaterThanOrEqual(44)
      }
    })
  }

  for (const long of ['', 'X'.repeat(120)]) {
    test(`a 320 px un asunto largo${long ? ' sin espacios' : ''} envuelve sin elipsis ni desbordar`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 })
      if (long) {
        const items = tickets.map((ticket, index) => (index === 0 ? { ...ticket, subject: long } : ticket))
        await page.route('**/api/tickets?*', (route) =>
          route.fulfill({
            json: { items, page: 0, size: 20, totalItems: items.length, totalPages: 1 },
          }),
        )
      }
      await page.goto('/tickets')
      const table = page.getByRole('table', { name: 'Tickets' })
      const link = table.getByRole('link', { name: long ? new RegExp(long) : /Error al procesar el pago/ })
      await expect(link).toBeVisible()
      const clipped = await link.evaluate(
        (node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight,
      )
      expect(clipped).toBe(false)
      const style = await link.evaluate((node) => getComputedStyle(node))
      expect(style.textOverflow).not.toBe('ellipsis')
      expect(style.whiteSpace).not.toBe('nowrap')
      // El asunto ocupa varias líneas y la página no se desborda.
      expect((await link.boundingBox())!.height).toBeGreaterThan(44)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
