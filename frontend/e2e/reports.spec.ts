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
        expect(order.map((box) => box.index)).toEqual([0, 1, 2, 3, 4])
        if (width >= 1200) {
          expect(Math.abs(boxes[0]!.top - boxes[1]!.top), 'gráfico y canales en paralelo').toBeLessThan(4)
          expect(Math.abs(boxes[2]!.top - boxes[3]!.top), 'pendientes y abiertos en paralelo').toBeLessThan(4)
        } else {
          expect(boxes[1]!.top, 'apilados por debajo de 1200 px').toBeGreaterThan(boxes[0]!.top)
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
})
