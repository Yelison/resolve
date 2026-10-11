import { expect, mockApi, test, tickets } from './fixtures'

const greeting = /^Buen(os días|as tardes|as noches), Yelisson$/

test.describe('inicio', () => {
  test('muestra el saludo, el pulso del día, lo que necesita atención y la columna derecha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: greeting })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: 'Ver reportes' })).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Nuevo ticket' })).toBeVisible()

    const pulse = page.getByRole('group', { name: 'Así va el soporte hoy' })
    for (const label of ['Tickets abiertos', 'Sin responsable', 'Primera respuesta', 'Resueltos hoy']) {
      await expect(pulse.getByText(label)).toBeVisible()
    }
    // El aviso de lo que va mal está escrito: el ticket #1046 lleva más de 4 h sin responsable.
    await expect(pulse.getByText('1 lleva más de 4 h')).toBeVisible()

    // Nadie tiene tickets asignados: empieza por todo el equipo y lo explica.
    await expect(page.getByRole('button', { name: /^Todo el equipo/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.getByText('No tienes tickets asignados. Te mostramos lo que el equipo tiene pendiente.'),
    ).toBeVisible()
    const list = page.getByRole('list', { name: 'Tickets que necesitan atención' })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await expect(list.getByText('Urgente', { exact: true })).toBeVisible()
    await expect(list.getByText('Sin asignar', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Solicitudes por día' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Borradores sin publicar' })).toBeVisible()

    await page.getByRole('link', { name: /creó el ticket · #1048/ }).click()
    await expect(page).toHaveURL(/\/tickets\/1048$/)
  })

  test.describe('con el navegador en otra zona', () => {
    // Tokio va 14 h por delante de Bogotá: si el saludo usara la zona del navegador sería «Buenas noches» del domingo.
    test.use({ timezoneId: 'Asia/Tokyo' })

    test('el saludo y el día son los de la zona de la organización', async ({ page }) => {
      // 17:00 UTC: mediodía del sábado en Bogotá, la zona de la organización simulada.
      await page.clock.setFixedTime(new Date('2026-10-10T17:00:00Z'))
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Buenas tardes, Yelisson' })).toBeVisible()
      await expect(page.getByText('Sábado, 10 de octubre')).toBeVisible()
    })
  })

  test('cada dato del pulso lleva a su vista de la bandeja', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const pulse = page.getByRole('group', { name: 'Así va el soporte hoy' })
    await pulse.getByRole('link', { name: /Sin responsable/ }).click()
    await expect(page).toHaveURL(/\/tickets\?view=unassigned$/)
    await page.goBack()
    await pulse.getByRole('link', { name: /Resueltos hoy/ }).click()
    await expect(page).toHaveURL(/\/tickets\?view=resolved$/)
  })

  test('la tabla alternativa del gráfico se alcanza con el teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    // El nombre cambia entre «Ver como tabla» y «Ocultar tabla»: el localizador no depende de él.
    const toggle = page.getByRole('button', { name: /^(Ver como|Ocultar) tabla/ })
    await expect(toggle).toBeVisible()
    // Solo con Tab: enfocar el botón por programa no demostraría que está en el orden de tabulación.
    let presses = 0
    while (!(await toggle.evaluate((element) => element === document.activeElement))) {
      expect(++presses, 'el botón no recibe el foco con Tab').toBeLessThanOrEqual(60)
      await page.keyboard.press('Tab')
    }
    // La tabla siempre está en el DOM (los lectores de pantalla la leen); «Ver como tabla» la muestra a todos.
    const table = page.getByRole('table', { name: 'Solicitudes por día' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // El contenedor que lo oculta es el que enlaza `aria-controls`: cerrado mide 1 px, abierto toda la tabla.
    const wrap = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
    expect((await wrap.boundingBox())!.height).toBeLessThanOrEqual(1)
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveText(/^Ocultar tabla/)
    await expect(toggle).toBeFocused()
    expect((await wrap.boundingBox())!.height).toBeGreaterThan(100)
    await expect(table.getByRole('row')).toHaveCount(8) // encabezado + 7 días
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect((await wrap.boundingBox())!.height).toBeLessThanOrEqual(1)
  })

  test('el selector de alcance se maneja con el teclado y cambia la lista que se pide', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const mine = page.getByRole('button', { name: /^Para mí/ })
    await expect(mine).toHaveAttribute('aria-pressed', 'false')
    const request = page.waitForRequest((req) => req.url().includes('/api/tickets?') && req.url().includes('view=mine'))
    await mine.focus()
    await page.keyboard.press('Enter')
    await request
    await expect(mine).toHaveAttribute('aria-pressed', 'true')
    await expect(mine).toBeFocused()
    await expect(page.getByText('Cuando te asignen uno, aparecerá aquí.')).toBeVisible()
  })

  test('«Asignármelo» asigna el ticket, lo anuncia y no pierde el foco', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const assigned = {
      ...tickets.find((ticket) => ticket.number === 1046)!,
      assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    }
    let body: unknown
    await page.route('**/api/tickets/1046', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      body = route.request().postDataJSON()
      const { lastMessage: _lastMessage, ...detail } = assigned
      await route.fulfill({ json: { ...detail, description: 'Detalle', version: 3 } })
    })
    await page.goto('/')
    const row = page.getByRole('listitem').filter({ hasText: 'Cambiar correo de facturación' })
    await row.getByRole('button', { name: /Asignármelo/ }).click()
    await expect(page.getByText('Te asignaste el ticket #1046')).toBeVisible()
    expect(body).toEqual({ assigneeId: expect.any(String) })
    await expect(row.getByRole('button', { name: /Asignármelo/ })).toHaveCount(0)
    await expect(row.getByRole('link', { name: /^#1046 / })).toBeFocused()
  })

  for (const [width, columns] of [
    [320, 1],
    [390, 2],
    [767, 2],
    [768, 2],
    [1199, 2],
    [1200, 4],
  ] as const) {
    test(`el pulso va en ${columns} ${columns === 1 ? 'columna' : 'columnas'} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const pulse = page.getByRole('group', { name: 'Así va el soporte hoy' })
      await expect(pulse.getByText('Tickets abiertos')).toBeVisible()
      const tops = await Promise.all(
        ['Tickets abiertos', 'Sin responsable', 'Primera respuesta', 'Resueltos hoy'].map(async (label) =>
          Math.round((await pulse.getByText(label).boundingBox())!.y),
        ),
      )
      expect(tops.filter((top) => top === tops[0])).toHaveLength(columns)
    })
  }

  test('en móvil cada fila de «Necesitan atención» cabe y sus controles miden 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const row = page.getByRole('listitem').filter({ hasText: 'Cambiar correo de facturación' })
    await expect(row).toBeVisible()
    for (const control of [
      page.getByRole('button', { name: /^Para mí/ }),
      page.getByRole('button', { name: /^Todo el equipo/ }),
      row.getByRole('button', { name: /Asignármelo/ }),
      page.getByRole('link', { name: 'Ver reportes' }),
      page.getByRole('link', { name: '+ Nuevo ticket' }),
    ]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('inicio · sin saltos de layout', () => {
  // 1200 y 1280 px con el menú expandido: las celdas son estrechas y el detalle puede ocupar dos líneas.
  for (const width of [320, 390, 768, 1200, 1280, 1440]) {
    test(`el panel siguiente al pulso empieza a la misma altura cargando y con datos · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets/metrics', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/')
      const panel = page.getByRole('region', { name: 'Necesitan atención' })
      await expect(page.getByText('Cargando las métricas…')).toBeAttached()
      // Las celdas ocultas que fijan la altura no se leen ni se pueden enfocar.
      await expect(page.getByRole('link', { name: /Sin responsable/ })).toHaveCount(0)
      const loading = (await panel.boundingBox())!.y
      release()
      await expect(page.getByText('Tickets abiertos', { exact: true })).toBeVisible()
      const loaded = (await panel.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(4)
    })
  }

  for (const width of [1024, 1199]) {
    test(`«Solicitudes esta semana» no se mueve al llegar la lista de «Necesitan atención» · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets?*', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/')
      const below = page.getByRole('region', { name: 'Solicitudes esta semana' })
      await expect(page.getByText('Cargando los tickets que necesitan atención…')).toBeAttached()
      const loading = (await below.boundingBox())!.y
      release()
      await expect(page.getByRole('list', { name: 'Tickets que necesitan atención' })).toBeVisible()
      const loaded = (await below.boundingBox())!.y
      // Las filas de muestra son representativas, no exactas: la altura real depende del texto de cada una.
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(24)
    })
  }

  for (const width of [390, 1024, 1440]) {
    test(`«Actividad reciente» no se mueve al llegar las solicitudes de la semana · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/reports/summary?*', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/')
      const below = page.getByRole('region', { name: 'Actividad reciente' })
      await expect(page.getByText('Cargando las solicitudes de la semana…')).toBeAttached()
      const loading = (await below.boundingBox())!.y
      release()
      await expect(page.getByRole('img', { name: 'Solicitudes por día' })).toBeVisible()
      const loaded = (await below.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(4)
    })

    test(`«Borradores sin publicar» no se mueve al llegar 5 eventos de actividad · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      // Cinco eventos con títulos de dos líneas, lo que reserva el esqueleto.
      const events = Array.from({ length: 5 }, (_, index) => ({
        ticketNumber: 1001 + index,
        subject: 'Pago rechazado',
        activity: {
          id: `a-${index}`,
          type: 'status_changed',
          actor: { id: 'u-laura', name: 'Laura Méndez' },
          createdAt: new Date(Date.now() - index * 60_000).toISOString(),
          from: 'open',
          to: 'in_progress',
        },
      }))
      await page.route('**/api/tickets/activity?*', async (route) => {
        await held
        await route.fulfill({ json: events })
      })
      await page.goto('/')
      const below = page.getByRole('region', { name: /Borradores sin publicar/ })
      await expect(page.getByText('Cargando la actividad reciente…')).toBeAttached()
      const loading = (await below.boundingBox())!.y
      release()
      await expect(page.getByRole('link', { name: /#1005 Pago rechazado/ })).toBeVisible()
      const loaded = (await below.boundingBox())!.y
      expect(Math.abs(loaded - loading), `cargando ${loading}, con datos ${loaded}`).toBeLessThanOrEqual(24)
    })
  }

  for (const width of [390, 1024]) {
    test(`al cambiar de alcance la lista anterior se queda hasta que llega la nueva · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const list = page.getByRole('list', { name: 'Tickets que necesitan atención' })
      await expect(list.getByRole('listitem')).toHaveCount(3)
      const below = page.getByRole('region', { name: 'Solicitudes esta semana' })
      const before = (await below.boundingBox())!.y
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/tickets?*view=mine*', async (route) => {
        await held
        await route.fallback()
      })
      await page.getByRole('button', { name: /^Para mí/ }).click()
      await expect(list).toHaveAttribute('aria-busy', 'true')
      expect(Math.abs((await below.boundingBox())!.y - before)).toBeLessThanOrEqual(1)
      release()
    })
  }
})

test.describe('inicio · textos largos', () => {
  const longSubject = 'Asunto larguísimo '.repeat(6).trim().slice(0, 120)
  const longToken = 'x'.repeat(120)
  const longTitle = 'Borrador con un título larguísimo que no se debe recortar '.repeat(3).slice(0, 120)

  for (const width of [320, 1440]) {
    test(`asuntos, clientes y borradores de 120 caracteres no desbordan ni se recortan · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const base = tickets[0]!
      await page.route('**/api/tickets?*', async (route) => {
        await route.fulfill({
          json: {
            items: [
              { ...base, subject: longSubject, customer: { ...base.customer, name: longToken } },
              { ...base, id: 't-x2', number: 2001, subject: longToken, priority: 'urgent' },
            ],
            page: 0,
            size: 100,
            totalItems: 2,
            totalPages: 1,
          },
        })
      })
      await page.route('**/api/knowledge/articles?*', async (route) => {
        const items = [
          {
            id: 'd-1',
            slug: 'largo',
            title: longTitle,
            category: { id: 'c', name: 'Primeros pasos', slug: 'primeros-pasos' },
            status: 'draft',
            visibility: 'public',
            excerpt: '',
            updatedAt: new Date().toISOString(),
            publishedAt: null,
          },
        ]
        await route.fulfill({ json: { items, page: 0, size: 3, totalItems: 1, totalPages: 1 } })
      })
      await page.goto('/')
      await expect(page.getByRole('link', { name: new RegExp(`^#${base.number} `) })).toBeVisible()
      await expect(page.getByRole('link', { name: longTitle })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'scroll horizontal de la página').toBeLessThanOrEqual(0)
      const clipped = await page
        .locator('main a, main span, main p')
        .evaluateAll((els) =>
          els
            .filter(
              (el) =>
                el.scrollWidth - el.clientWidth > 1 &&
                getComputedStyle(el).display !== 'inline' &&
                !el.classList.contains('visually-hidden'),
            )
            .map((el) => `${el.tagName}: ${el.textContent?.slice(0, 40)}`),
        )
      expect(clipped, 'textos recortados').toEqual([])
    })
  }
})

test.describe('inicio · rol cliente y nombres del menú', () => {
  test('un cliente aterriza en su bandeja y ve «Mis solicitudes» y «Ayuda»', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible()
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'Mis solicitudes' })).toHaveAttribute('href', '/tickets')
    await expect(nav.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/conocimiento')
    await expect(nav.getByRole('link', { name: 'Inicio' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Tickets', exact: true })).toHaveCount(0)
  })

  test('el personal ve «Inicio», «Tickets» y «Conocimiento»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const nav = page.getByRole('navigation')
    for (const name of ['Inicio', 'Tickets', 'Conocimiento']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: 'Resumen' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: /Ruta|Migas/ })).toContainText('Inicio')
  })
})

test.describe('inicio · gráfico de solicitudes por día', () => {
  // Medidas de las barras (px de pantalla) y de la separación entre barras vecinas.
  async function measureBars(page: import('@playwright/test').Page) {
    const chart = page.getByRole('img', { name: 'Solicitudes por día' })
    await expect(chart).toBeVisible()
    return chart.locator('svg').evaluateAll((svgs) => {
      const rects = svgs.map((svg) => svg.getBoundingClientRect())
      return {
        widths: rects.map((rect) => rect.width),
        gaps: rects.slice(1).map((rect, index) => rect.left - rects[index]!.right),
      }
    })
  }

  for (const width of [1440, 1920, 2560]) {
    test(`las barras ganan grosor y la separación queda acotada · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const { widths, gaps } = await measureBars(page)
      // La columna derecha mide como mucho 360 px: 7 columnas de ~45 px, con la barra casi a todo su ancho.
      expect(Math.min(...widths), 'barras demasiado finas').toBeGreaterThanOrEqual(32)
      expect(Math.max(...gaps), 'barras demasiado separadas').toBeLessThanOrEqual(56)
    })
  }

  test('las etiquetas del eje son los días en tres letras y caben a 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/')
    const chart = page.getByRole('img', { name: 'Solicitudes por día' })
    await expect(chart).toBeVisible()
    const labels = chart.locator('[class*="axis"]:not([class*="axisRow"])')
    await expect(labels).toHaveCount(7)
    const texts = await labels.allTextContents()
    expect(
      texts.every((text) => /^[a-zñáéíóú]{3}$/.test(text)),
      texts.join(','),
    ).toBe(true)
    expect(texts).not.toContain('X')
    const clipped = await labels.evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
    expect(Math.max(...clipped)).toBeLessThanOrEqual(0)
  })
})
