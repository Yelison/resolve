import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import type { ReportSummary } from '../src/api/schema'
import { expect, me, test } from './fixtures'

/** Retiene las respuestas del informe que cumplan `held` hasta llamar a la función devuelta. */
async function holdSummary(page: Page, held: (url: string) => boolean) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/reports/summary*', async (route) => {
    if (held(route.request().url())) await gate
    await route.fallback()
  })
  return release
}

/** Llega al elemento solo con Tab: enfocarlo por programa no demostraría que está en el orden de tabulación. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let presses = 0; presses < max; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('El elemento no recibe el foco con Tab')
}

const panelsTop = (page: Page) => page.getByTestId('report-panels').evaluate((el) => el.getBoundingClientRect().top)
const topOf = (page: Page, testId: string) => page.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().top)
const agentsTop = (page: Page) => topOf(page, 'report-agents')
const rangeBox = (page: Page) =>
  page
    .getByText(/America\/Bogota/)
    .first()
    .evaluate((el) => el.getBoundingClientRect().height)

test.describe('reportes', () => {
  test('muestra las cifras, el gráfico con su tabla, los canales y los agentes con su estado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible()
    await expect(page.getByText('61 más (20 %) frente a los 7 días anteriores')).toBeVisible()
    await expect(page.getByText('83 resueltos por cada 100 creados')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Solicitudes por canal' })).toBeVisible()

    // La alternativa tabular del gráfico se alcanza con el teclado.
    await page.getByRole('button', { name: 'Ver como tabla de Solicitudes y resueltos por día' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('table', { name: 'Solicitudes y resueltos por día' })).toBeVisible()

    const agents = page.getByRole('table', { name: 'Rendimiento por agente' })
    await expect(agents.getByRole('row')).toHaveCount(7) // cabecera + 6
    await expect(agents.getByRole('row', { name: /Pablo Viejo/ })).toContainText('Retirado')
    await expect(agents.getByRole('row', { name: /Sofía Ríos/ })).toContainText('Invitación pendiente')
    await expect(agents.getByRole('row', { name: /Laura Méndez/ })).not.toContainText('Retirado')
  })

  test('mientras el informe carga muestra el esqueleto y no deja exportar', async ({ page }) => {
    await page.route('**/api/reports/summary*', () => new Promise(() => {}))
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible()
    await expect(page.getByText('Cargando el informe…')).toBeAttached()
    await expect(page.getByRole('combobox', { name: 'Periodo' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
    await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toHaveCount(0)
  })

  test('cambiar el periodo cambia la petición y la URL, y 90 días agrega por semanas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    await expect(page.getByText(/frente a los 7 días anteriores/)).toBeVisible()

    const request = page.waitForRequest((req) => req.url().includes('/api/reports/summary?period=30d'))
    await page.getByRole('combobox', { name: 'Periodo' }).selectOption('30d')
    await request
    await expect(page).toHaveURL(/\?period=30d$/)
    await expect(page.getByText(/frente a los 30 días anteriores/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Teléfono: 15,2 %/ })).toBeVisible()

    await page.getByRole('combobox', { name: 'Periodo' }).selectOption('90d')
    await expect(page.getByRole('img', { name: 'Solicitudes y resueltos por semana' })).toBeVisible()
    // Sin periodo anterior ni medianas: ni porcentaje inventado ni cifras falsas.
    await expect(page.getByText('3900 más frente a los 90 días anteriores')).toBeVisible()
    await expect(page.getByText('Sin datos').first()).toBeVisible()
  })

  test('un periodo no válido en la URL vuelve al de por defecto', async ({ page }) => {
    await page.goto('/reportes?period=foo')
    await expect(page.getByText(/frente a los 7 días anteriores/)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Periodo' })).toHaveValue('7d')
    await expect(page).toHaveURL(/\/reportes$/)
  })

  test('exporta el CSV de agentes con BOM, estado y las fórmulas neutralizadas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes?period=30d')
    await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar CSV' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('reporte-agentes-30d-2026-10-04.csv')

    const bytes = await readFile((await file.path())!)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const rows = bytes.toString('utf8').slice(1).split('\r\n')
    expect(rows[0]).toBe('Agente,Estado,Resueltos,Primera respuesta (min),Asignados abiertos')
    expect(rows).toContain('Laura Méndez,Activo,128,14,1')
    expect(rows).toContain('Pablo Viejo,Retirado,9,45,0')
    expect(rows).toContain('Sofía Ríos,Invitación pendiente,2,,0')
    expect(rows).toContain(`"'=Carlos, ""Fórmula""",Activo,1,,0`)
  })

  test('un cliente no tiene acceso a los reportes', async ({ page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({ json: { ...me, role: 'customer', customerId: 'c-maria' } }),
    )
    const reportRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/reports/')) reportRequests.push(req.url())
    })
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible()
    expect(reportRequests).toEqual([])
  })

  for (const width of [390, 768, 1440]) {
    test(`el contenido no salta en la primera carga ni al cambiar de periodo · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const releaseFirst = await holdSummary(
        page,
        (url) => url.includes('period=30d') === false && !url.includes('period=90d'),
      )
      await page.goto('/reportes')
      await expect(page.getByText('Cargando el informe…')).toBeAttached()
      const loading = {
        top: await panelsTop(page),
        current: await topOf(page, 'report-panels-current'),
        agents: await agentsTop(page),
        range: await rangeBox(page),
      }
      releaseFirst()
      await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Abiertos con y sin responsable' })).toBeVisible()
      expect(await panelsTop(page), 'los paneles no se mueven al llegar el informe').toBeCloseTo(loading.top, 0)
      expect(await topOf(page, 'report-panels-current'), 'la segunda fila no se mueve').toBeCloseTo(loading.current, 0)
      expect(await agentsTop(page), 'los agentes no se mueven').toBeCloseTo(loading.agents, 0)
      expect(await rangeBox(page), 'la línea del rango conserva su altura').toBeCloseTo(loading.range, 0)
    })

    test(`al cambiar de periodo se ve el informe anterior sin esqueleto ni salto · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const releaseSecond = await holdSummary(page, (url) => url.includes('period=30d'))
      await page.goto('/reportes')
      await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
      const before = {
        top: await panelsTop(page),
        current: await topOf(page, 'report-panels-current'),
        agents: await agentsTop(page),
        range: await rangeBox(page),
      }

      await page.getByRole('combobox', { name: 'Periodo' }).selectOption('30d')
      await expect(page.getByText('Actualizando el informe…')).toBeAttached()
      await expect(page.getByText('Cargando el informe…')).toHaveCount(0)
      await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
      expect(await panelsTop(page)).toBeCloseTo(before.top, 0)
      expect(await topOf(page, 'report-panels-current')).toBeCloseTo(before.current, 0)
      expect(await rangeBox(page)).toBeCloseTo(before.range, 0)

      releaseSecond()
      await expect(page.getByText(/frente a los 30 días anteriores/)).toBeVisible()
      expect(await topOf(page, 'report-panels-current'), 'al llegar el periodo nuevo tampoco salta').toBeCloseTo(
        before.current,
        0,
      )
      expect(await agentsTop(page)).toBeCloseTo(before.agents, 0)
      await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled()
    })
  }

  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1024, 1440, 1920]) {
      test(`los paneles salen en su orden y nada desborda · ${theme} · ${width}px`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/reportes')
        await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()

        const titles = [
          'Solicitudes y resueltos por día',
          'Solicitudes por canal',
          'Pendientes acumulados',
          'Abiertos con y sin responsable',
          'Rendimiento por agente',
          'Estado de los abiertos',
          'Prioridad de los abiertos',
          'Cuánto tarda la resolución',
          'Cuándo llegan las solicitudes',
        ]
        const boxes = []
        for (const name of titles) {
          boxes.push(
            await page.getByRole('heading', { level: 2, name }).evaluate((el) => {
              const { top, left } = el.getBoundingClientRect()
              return { top, left }
            }),
          )
        }
        // Orden de lectura: fila por fila y, dentro de cada fila, de izquierda a derecha.
        const order = boxes.map((box, index) => ({ ...box, index }))
        order.sort((a, b) => (Math.abs(a.top - b.top) < 4 ? a.left - b.left : a.top - b.top))
        expect(order.map((box) => box.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
        if (width >= 1200) {
          expect(Math.abs(boxes[0]!.top - boxes[1]!.top), 'gráfico y canales en paralelo').toBeLessThan(4)
          expect(Math.abs(boxes[2]!.top - boxes[3]!.top), 'pendientes y abiertos en paralelo').toBeLessThan(4)
          expect(Math.abs(boxes[5]!.top - boxes[6]!.top), 'estado y prioridad en paralelo').toBeLessThan(4)
          expect(Math.abs(boxes[5]!.top - boxes[7]!.top), 'los tres paneles en una fila').toBeLessThan(4)
        } else {
          expect(boxes[1]!.top, 'apilados por debajo de 1200 px').toBeGreaterThan(boxes[0]!.top)
          if (width >= 768) {
            expect(Math.abs(boxes[5]!.top - boxes[6]!.top), 'dos paneles en intermedio').toBeLessThan(4)
            expect(boxes[7]!.top, 'el tercero baja en intermedio').toBeGreaterThan(boxes[5]!.top)
            const widths = await page.evaluate(() =>
              ['reports-status', 'reports-resolution'].map(
                (id) => document.getElementById(id)!.closest('section')!.getBoundingClientRect().width,
              ),
            )
            expect(widths[1]!, 'el tercero ocupa todo el ancho en intermedio').toBeGreaterThan(widths[0]! * 1.8)
          } else {
            expect(boxes[6]!.top, 'apilados en móvil').toBeGreaterThan(boxes[5]!.top)
          }
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, 'sin scroll horizontal de página').toBeLessThanOrEqual(0)
        const clipped = await page.evaluate(
          () =>
            [...document.querySelectorAll<HTMLElement>('section[aria-labelledby]')].filter(
              (panel) => panel.scrollWidth > panel.clientWidth + 1,
            ).length,
        )
        expect(clipped, 'ningún panel desborda').toBe(0)
      })
    }
  }

  test('el anillo de canales muestra el porcentaje y los tickets de cada uno y su tabla', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const channels = page.getByRole('region', { name: 'Solicitudes por canal' })
    const legend = channels.locator('li')
    await expect(legend.filter({ hasText: 'Correo' })).toContainText('71,5 % · 258 tickets')
    await expect(legend.filter({ hasText: 'Chat' })).toContainText('19,9 % · 72 tickets')
    await expect(legend.filter({ hasText: 'Web' })).toContainText('8,6 % · 31 tickets')
    await channels.getByRole('button', { name: 'Ver como tabla de Solicitudes por canal' }).click()
    const table = channels.getByRole('table', { name: 'Solicitudes por canal' })
    await expect(table).toBeVisible()
    await expect(table.getByRole('row', { name: /Correo.*71,5 % · 258 tickets/ })).toBeVisible()
  })

  test('con el teclado un punto del gráfico de agentes enseña su tooltip con el valor exacto', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const point = page.getByRole('button', { name: 'Laura Méndez: 14 min' })
    await expect(point).toBeVisible()
    await tabTo(page, point)
    await expect(page.getByRole('tooltip')).toHaveText('Laura Méndez: 14 min')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    const over = page.getByRole('button', { name: /^Pablo Viejo: 45 min, por encima del objetivo/ })
    await tabTo(page, over)
    await expect(page.getByRole('tooltip')).toContainText('por encima del objetivo')
    await expect(page.getByText(/Sin primeras respuestas en el periodo: Sofía Ríos/)).toBeVisible()
  })

  test('con todo el equipo dentro del objetivo el gráfico de agentes no desborda el panel a 320 px', async ({
    page,
  }) => {
    const report: ReportSummary = {
      period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 7, timeZone: 'America/Bogota' },
      created: { value: 20, previous: 18 },
      resolved: { value: 19, previous: 17 },
      firstResponseMinutes: { value: 20, previous: 25, target: 30 },
      resolutionHours: { value: 5, previous: 6 },
      byDay: ['28', '29', '30'].map((day) => ({ date: `2026-09-${day}`, created: 5, resolved: 4 })),
      byChannel: [{ channel: 'email', created: 20, share: 100 }],
      byAgent: [
        {
          member: { id: 'u-1', name: 'Laura Méndez' },
          status: 'active',
          resolved: 10,
          firstResponseMinutes: 14,
          openAssigned: 1,
        },
        {
          member: { id: 'u-2', name: 'Daniel Santos' },
          status: 'active',
          resolved: 9,
          firstResponseMinutes: 28,
          openAssigned: 2,
        },
      ],
      openByStatus: { open: 2, inProgress: 1, waiting: 0 },
      openByPriority: { urgent: 0, high: 1, medium: 2, low: 0 },
      resolutionTimes: [
        { bucket: 'under1h', resolved: 3 },
        { bucket: 'from1To4h', resolved: 6 },
        { bucket: 'from4To8h', resolved: 5 },
        { bucket: 'from8To24h', resolved: 3 },
        { bucket: 'from1To3d', resolved: 2 },
        { bucket: 'over3d', resolved: 0 },
      ],
      createdByWeekdayHour: [
        { weekday: 1, hour: 9, created: 12 },
        { weekday: 3, hour: 14, created: 8 },
      ],
    }
    await page.route('**/api/reports/summary*', (route) => route.fulfill({ json: report }))
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/reportes')
    const targetLabel = page.getByTestId('report-agents').locator('[class*="targetLabel"]')
    await expect(targetLabel).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'sin scroll horizontal de página').toBeLessThanOrEqual(0)
    const panel = await page.getByTestId('report-agents').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(panel, 'el panel de agentes no desborda').toBeLessThanOrEqual(0)
    // La etiqueta del objetivo queda dentro del panel.
    const label = await targetLabel.boundingBox()
    const box = await page.getByTestId('report-agents').boundingBox()
    expect(label!.x + label!.width).toBeLessThanOrEqual(box!.x + box!.width + 0.5)
  })

  /** Informe con el contrato exacto y los cuatro conjuntos nuevos vacíos (sin tickets abiertos ni actividad). */
  const emptyNewData: Pick<
    ReportSummary,
    'openByStatus' | 'openByPriority' | 'resolutionTimes' | 'createdByWeekdayHour'
  > = {
    openByStatus: { open: 0, inProgress: 0, waiting: 0 },
    openByPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
    resolutionTimes: [
      { bucket: 'under1h', resolved: 0 },
      { bucket: 'from1To4h', resolved: 0 },
      { bucket: 'from4To8h', resolved: 0 },
      { bucket: 'from8To24h', resolved: 0 },
      { bucket: 'from1To3d', resolved: 0 },
      { bucket: 'over3d', resolved: 0 },
    ],
    createdByWeekdayHour: [],
  }

  test('el mapa de calor se lee como tabla y la leyenda y los ejes salen como en la maqueta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const heat = page.getByRole('region', { name: 'Cuándo llegan las solicitudes' })
    await expect(heat.getByRole('grid')).toBeVisible()
    await expect(heat.getByRole('grid').getByRole('rowheader')).toHaveText([
      'lun',
      'mar',
      'mié',
      'jue',
      'vie',
      'sáb',
      'dom',
    ])
    await expect(heat.getByRole('grid').getByRole('columnheader')).toHaveText([
      '0',
      '2',
      '4',
      '6',
      '8',
      '10',
      '12',
      '14',
      '16',
      '18',
      '20',
      '22',
    ])
    await expect(heat.locator('[class*="live"]').getByText('Menos')).toBeVisible()
    await expect(heat.locator('[class*="live"]').getByText('Más')).toBeVisible()

    await heat.getByRole('button', { name: 'Ver como tabla de Cuándo llegan las solicitudes' }).click()
    const table = heat.getByRole('table', { name: 'Cuándo llegan las solicitudes' })
    await expect(table).toBeVisible()
    await expect(table.getByRole('row')).toHaveCount(8) // cabecera + 7 días
    await expect(table.getByRole('columnheader')).toHaveCount(13)
    await expect(table.getByRole('row', { name: /^lun/ }).getByRole('cell').first()).toHaveText('0 solicitudes')
  })

  test('con Tab se entra al mapa de calor por una sola celda, con tooltip, y las flechas lo recorren', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const grid = page.getByRole('grid', { name: 'Cuándo llegan las solicitudes' })
    await expect(grid).toBeVisible()
    const cells = grid.getByRole('gridcell')
    await expect(cells).toHaveCount(84)
    expect(await grid.locator('[role="gridcell"][tabindex="0"]').count(), 'una sola parada de Tab').toBe(1)

    await tabTo(page, grid.locator('[role="gridcell"][tabindex="0"]'))
    await expect(page.getByRole('tooltip')).toHaveText(/^lun 0–2 h: 0 solicitudes$/)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tooltip')).toHaveText(/^mar 4–6 h: 0 solicitudes$/)
    await page.keyboard.press('End')
    await expect(page.getByRole('tooltip')).toHaveText(/^mar 22–24 h: 0 solicitudes$/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    // Tab sale del mapa en una sola pulsación, a la tabla o al siguiente control, no a otra celda.
    await page.keyboard.press('Tab')
    expect(await grid.locator('[role="gridcell"]:focus').count()).toBe(0)
  })

  test('el tooltip de una celda con datos da el valor exacto y las celdas con datos usan pasos distintos', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const busiest = page.getByRole('gridcell', { name: /^mié 10–12 h: \d+ solicitudes$/ })
    await busiest.focus()
    await expect(page.getByRole('tooltip')).toHaveText(/^mié 10–12 h: \d+ solicitudes$/)
    const steps = await page
      .getByRole('grid', { name: 'Cuándo llegan las solicitudes' })
      .locator('[data-step]')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-step')))].sort())
    expect(steps.length, 'el valor se codifica con varios pasos discretos').toBeGreaterThanOrEqual(3)
    expect(steps).toContain('0')
  })

  test('el histograma y los anillos dan sus valores con el teclado y su tabla', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    const histogram = page.getByRole('region', { name: 'Cuánto tarda la resolución' })
    await expect(histogram.getByRole('button', { name: /^(<|>|\d)/ }).filter({ hasNotText: 'tabla' })).toHaveCount(6)
    const first = histogram.getByRole('button', { name: /^< 1 h: / })
    await tabTo(page, first)
    await expect(page.getByRole('tooltip')).toContainText('< 1 h')
    for (const label of ['< 1 h', '1–4 h', '4–8 h', '8–24 h', '1–3 d', '> 3 d']) {
      await expect(histogram.locator('[class*="axis"]', { hasText: label }).first()).toBeVisible()
    }
    const status = page.getByRole('region', { name: 'Estado de los abiertos' })
    await expect(status.locator('[class*="live"] li')).toHaveText([/Abierto\s*9/, /En curso\s*14/, /En espera\s*5/])
    const priority = page.getByRole('region', { name: 'Prioridad de los abiertos' })
    await expect(priority.locator('[class*="live"] li')).toHaveText([
      /Urgente\s*2/,
      /Alta\s*8/,
      /Media\s*13/,
      /Baja\s*5/,
    ])
    await priority.getByRole('button', { name: 'Ver como tabla de Prioridad de los abiertos' }).click()
    await expect(priority.getByRole('table', { name: 'Prioridad de los abiertos' })).toBeVisible()
  })

  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      test(`los paneles nuevos no desbordan la página, ni con la tabla abierta · ${theme} · ${width}px`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/reportes')
        const heat = page.getByRole('region', { name: 'Cuándo llegan las solicitudes' })
        await expect(heat.getByRole('grid')).toBeVisible()
        const pageOverflow = () =>
          page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(await pageOverflow(), 'sin scroll horizontal de página').toBeLessThanOrEqual(0)

        // Por debajo de unos 640 px el scroll horizontal vive dentro del panel; por encima, el mapa cabe.
        const scroller = await heat
          .getByRole('grid')
          .evaluate((grid) => ({ scroll: grid.parentElement!.scrollWidth, client: grid.parentElement!.clientWidth }))
        if (width <= 390)
          expect(scroller.scroll, 'el mapa se desplaza dentro de su panel').toBeGreaterThan(scroller.client)
        if (width >= 1024)
          expect(scroller.scroll, 'a ancho de escritorio no hace falta scroll').toBeLessThanOrEqual(scroller.client)

        // Con las tablas alternativas abiertas tampoco se desborda la página: la del mapa tiene 13 columnas.
        for (const name of [
          'Estado de los abiertos',
          'Prioridad de los abiertos',
          'Cuánto tarda la resolución',
          'Cuándo llegan las solicitudes',
        ]) {
          await page.getByRole('button', { name: `Ver como tabla de ${name}` }).click()
        }
        expect(await pageOverflow(), 'sin scroll horizontal con las tablas abiertas').toBeLessThanOrEqual(0)
        const clipped = await page.evaluate(
          () =>
            [...document.querySelectorAll<HTMLElement>('section[aria-labelledby]')].filter(
              (panel) => panel.scrollWidth > panel.clientWidth + 1,
            ).length,
        )
        expect(clipped, 'ningún panel desborda').toBe(0)
      })
    }
  }

  test('sin tickets abiertos ni actividad cada panel nuevo dice su vacío y el resto sigue', async ({ page }) => {
    const report: ReportSummary = {
      period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 7, timeZone: 'America/Bogota' },
      created: { value: 0, previous: 0 },
      resolved: { value: 0, previous: 0 },
      firstResponseMinutes: { value: null, previous: null, target: 30 },
      resolutionHours: { value: null, previous: null },
      byDay: ['28', '29', '30'].map((day) => ({ date: `2026-09-${day}`, created: 0, resolved: 0 })),
      byChannel: [],
      byAgent: [
        {
          member: { id: 'u-1', name: 'Laura Méndez' },
          status: 'active',
          resolved: 0,
          firstResponseMinutes: null,
          openAssigned: 0,
        },
      ],
      ...emptyNewData,
    }
    await page.route('**/api/reports/summary*', (route) => route.fulfill({ json: report }))
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { level: 3, name: 'Sin tickets abiertos' })).toHaveCount(2)
    await expect(page.getByRole('heading', { level: 3, name: 'Sin resoluciones en este periodo' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Sin solicitudes en este periodo' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0)
  })

  for (const width of [390, 768, 1440]) {
    test(`los paneles nuevos conservan su alto y su sitio al llegar el informe y al cambiar de periodo · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const releaseFirst = await holdSummary(page, (url) => !url.includes('period=30d') && !url.includes('period=90d'))
      await page.goto('/reportes')
      await expect(page.getByText('Cargando el informe…')).toBeAttached()
      const measure = () =>
        page.evaluate(() => {
          const box = (id: string) => {
            const el = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect()
            return { top: el.top, height: el.height }
          }
          const agents = box('report-agents')
          const open = box('report-panels-open')
          const heat = box('report-heatmap')
          return {
            openHeight: open.height,
            heatHeight: heat.height,
            // Separación respecto al panel anterior: constante aunque la tabla de agentes cambie de alto.
            openGap: open.top - (agents.top + agents.height),
            heatGap: heat.top - (open.top + open.height),
          }
        })
      const loading = await measure()
      releaseFirst()
      await expect(page.getByRole('grid', { name: 'Cuándo llegan las solicitudes' })).toBeVisible()
      const loaded = await measure()
      expect(loaded.openHeight, 'el alto de la fila de tres paneles').toBeCloseTo(loading.openHeight, 0)
      expect(loaded.heatHeight, 'el alto del mapa de calor').toBeCloseTo(loading.heatHeight, 0)
      expect(loaded.openGap).toBeCloseTo(loading.openGap, 0)
      expect(loaded.heatGap).toBeCloseTo(loading.heatGap, 0)
    })

    test(`al cambiar de periodo los paneles nuevos no se mueven · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const releaseSecond = await holdSummary(page, (url) => url.includes('period=30d'))
      await page.goto('/reportes')
      await expect(page.getByRole('grid', { name: 'Cuándo llegan las solicitudes' })).toBeVisible()
      const before = {
        open: await topOf(page, 'report-panels-open'),
        heat: await topOf(page, 'report-heatmap'),
      }
      await page.getByRole('combobox', { name: 'Periodo' }).selectOption('30d')
      await expect(page.getByText('Actualizando el informe…')).toBeAttached()
      expect(await topOf(page, 'report-panels-open')).toBeCloseTo(before.open, 0)
      expect(await topOf(page, 'report-heatmap')).toBeCloseTo(before.heat, 0)
      releaseSecond()
      await expect(page.getByText(/frente a los 30 días anteriores/)).toBeVisible()
      expect(await topOf(page, 'report-panels-open')).toBeCloseTo(before.open, 0)
      expect(await topOf(page, 'report-heatmap')).toBeCloseTo(before.heat, 0)
    })
  }

  for (const width of [320, 1440]) {
    test(`la etiqueta del último valor no tapa la línea ni los puntos de pendientes acumulados · ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/reportes')
      const panel = page.getByRole('region', { name: 'Pendientes acumulados' })
      const label = panel.locator('[class*="endLabel"]', { hasText: '+361 pendientes' })
      await expect(label).toBeVisible()
      const geometry = await panel.evaluate((section) => {
        const rect = (element: Element) => {
          const { left, top, right, bottom } = element.getBoundingClientRect()
          return { left, top, right, bottom }
        }
        const svg = section.querySelector('[class*="live"] svg[role="img"]')!
        const box = svg.getBoundingClientRect()
        const vertices = svg
          .querySelector('polyline')!
          .getAttribute('points')!
          .split(' ')
          .map((pair) => pair.split(',').map(Number) as [number, number])
          .map(([x, y]) => ({ x: box.left + (x / 100) * box.width, y: box.top + (y / 100) * box.height }))
        const dots = [...section.querySelectorAll('[class*="live"] [class*="dot"]')]
          .filter((dot) => getComputedStyle(dot).opacity !== '0')
          .map(rect)
        const labelElement = [...section.querySelectorAll('[class*="endLabel"]')].find((element) =>
          element.textContent?.includes('+361'),
        )!
        return { label: rect(labelElement), vertices, dots }
      })
      const inside = (x: number, y: number) =>
        x > geometry.label.left && x < geometry.label.right && y > geometry.label.top && y < geometry.label.bottom
      // Se muestrean los tramos de la polilínea: ningún punto de la línea cae dentro de la etiqueta.
      for (let index = 1; index < geometry.vertices.length; index += 1) {
        const from = geometry.vertices[index - 1]!
        const to = geometry.vertices[index]!
        for (let step = 0; step <= 40; step += 1) {
          const t = step / 40
          expect(inside(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t), 'la línea cruza la etiqueta').toBe(
            false,
          )
        }
      }
      for (const dot of geometry.dots) {
        const overlaps =
          dot.left < geometry.label.right &&
          dot.right > geometry.label.left &&
          dot.top < geometry.label.bottom &&
          dot.bottom > geometry.label.top
        expect(overlaps, 'un punto visible queda bajo la etiqueta').toBe(false)
      }
    })
  }
})
