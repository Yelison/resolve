import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummary } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ReportsPage } from './ReportsPage'
import { reportAgent, reportDays, reportResolutionTimes, reportSummary } from './reportFixtures'

afterEach(() => {
  vi.restoreAllMocks()
})

const problem = { status: 500, body: { status: 500, title: 'Error' } }
const never = () => new Promise(() => {}) as never

/** Pide el informe de cada periodo con su `days` para que el rótulo del periodo anterior coincida con lo pedido. */
const byPeriod =
  (overrides: Partial<ReportSummary> = {}) =>
  (request: Request) => {
    const period = new URL(request.url).searchParams.get('period') ?? '7d'
    const days = Number.parseInt(period, 10) as 7 | 30 | 90
    return {
      body: reportSummary({
        period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days, timeZone: 'America/Bogota' },
        byDay: reportDays(days),
        ...overrides,
      }),
    }
  }

const teamMetrics = {
  staff: 4,
  assignedOpen: 31,
  unassignedOpen: 7,
  averageLoad: 7.8,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
}

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/reports/summary': byPeriod(),
  'GET /api/members/metrics': { body: teamMetrics },
}

function renderReports(path = '/reportes') {
  const router = createMemoryRouter([{ path: '/reportes', element: <ReportsPage /> }], { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const requestedPeriods = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === '/api/reports/summary')
    .map((url) => url.searchParams.get('period'))

// El nombre de una tarjeta también aparece en el gráfico y en la tabla: se busca solo entre las etiquetas de métrica.
// El esqueleto y la línea del rango ocultos repiten texto representativo para reservar su altura: los tests solo cuentan lo no oculto.
const visibleRange = () =>
  screen.queryAllByText(/America\/Bogota/).filter((node) => !node.closest('[aria-hidden="true"]'))
const metricCard = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('dl')!
const findMetricCard = async (label: string) => (await screen.findByText(label, { selector: 'dt' })).closest('dl')!

describe('ReportsPage', () => {
  it('muestra un esqueleto mientras carga y deja el periodo y la exportación a la vista', () => {
    mockApi({ ...baseRoutes, 'GET /api/reports/summary': never })
    renderReports()
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toBeInTheDocument()
    expect(screen.getByText('Cargando el informe…')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Periodo' })).toHaveValue('7d')
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
  })

  it('muestra las cuatro cifras, el periodo anterior rotulado por su duración y el rango en la zona de la organización', async () => {
    mockApi(baseRoutes)
    renderReports()
    const card = await findMetricCard('Solicitudes')
    expect(within(card).getByText('361')).toBeInTheDocument()
    expect(within(card).getByText(/61 más \(20 %\) frente a los 7 días anteriores/)).toBeInTheDocument()
    expect(within(metricCard('Resueltos')).getByText('300')).toBeInTheDocument()
    expect(within(metricCard('Resueltos')).getByText('83 resueltos por cada 100 creados')).toBeInTheDocument()
    expect(within(metricCard('Primera respuesta')).getByText('18 min')).toBeInTheDocument()
    expect(within(metricCard('Primera respuesta')).getByText('Dentro del objetivo de 30 min')).toBeInTheDocument()
    expect(within(metricCard('Resolución')).getByText('6,5 h')).toBeInTheDocument()
    expect(screen.getByText(/28 sept?\.? 2026 – 4 oct\.? 2026 · America\/Bogota/)).toBeInTheDocument()
    expect(screen.queryByText(/semana pasada|mes pasado/)).not.toBeInTheDocument()
  })

  it('agrupa los miles en las cifras de las tarjetas', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/reports/summary': byPeriod({
        created: { value: 12000, previous: 10000 },
        resolved: { value: 95000, previous: 0 },
      }),
    })
    renderReports()
    expect(within(await findMetricCard('Solicitudes')).getByText('12.000')).toBeInTheDocument()
    expect(within(metricCard('Resueltos')).getByText('95.000')).toBeInTheDocument()
  })

  it('con el periodo anterior a 0 no calcula un porcentaje', async () => {
    mockApi({ ...baseRoutes, 'GET /api/reports/summary': byPeriod({ created: { value: 12, previous: 0 } }) })
    renderReports()
    const card = await findMetricCard('Solicitudes')
    expect(within(card).getByText(/12 más frente a los 7 días anteriores/)).toBeInTheDocument()
    expect(card.textContent).not.toContain('%')
  })

  it('sin creados no hay «resueltos por cada 100 creados» y los valores nulos muestran «Sin datos»', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/reports/summary': byPeriod({
        created: { value: 0, previous: 0 },
        resolved: { value: 3, previous: 0 },
        firstResponseMinutes: { value: null, previous: null, target: 30 },
        resolutionHours: { value: null, previous: null },
      }),
    })
    renderReports()
    const card = await findMetricCard('Primera respuesta')
    expect(within(card).getByText('Sin datos')).toBeInTheDocument()
    expect(within(card).getByText('Objetivo: 30 min')).toBeInTheDocument()
    expect(within(metricCard('Resolución')).getByText('Sin datos')).toBeInTheDocument()
    expect(metricCard('Resueltos').textContent).not.toContain('por cada 100 creados')
  })

  it('dibuja el gráfico de barras con su tabla alternativa', async () => {
    mockApi(baseRoutes)
    renderReports()
    expect(await screen.findByRole('img', { name: 'Solicitudes y resueltos por día' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ver como tabla de Solicitudes y resueltos por día' }),
    ).toBeInTheDocument()
  })

  it('dibuja los canales como un anillo con el valor de cada uno y el color de su canal', async () => {
    mockApi(baseRoutes)
    renderReports()
    const donut = await screen.findByRole('img', { name: 'Solicitudes por canal' })
    expect(donut).toHaveAccessibleDescription(
      /Correo 71,5 % · 258 tickets; Chat 19,9 % · 72 tickets; Web 8,6 % · 31 tickets/,
    )
    expect(screen.getByRole('button', { name: 'Correo: 71,5 % · 258 tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Teléfono/ })).not.toBeInTheDocument()
    // El color sigue al canal: Web es la serie 4 aunque sea el tercero de la lista.
    const classes = [...donut.querySelectorAll('path')].map((path) => path.getAttribute('class'))
    expect(classes[0]).toMatch(/color1/)
    expect(classes[1]).toMatch(/color2/)
    expect(classes[2]).toMatch(/color4/)
    expect(within(donut).getByText('361')).toBeInTheDocument()
    // La alternativa tabular del anillo se alcanza con el botón.
    await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla de Solicitudes por canal' }))
    expect(screen.getByRole('table', { name: 'Solicitudes por canal' })).toBeVisible()
  })

  it('las dos primeras tarjetas llevan un minigráfico decorativo y la de primera respuesta, la barra con sus marcas', async () => {
    mockApi(baseRoutes)
    renderReports()
    const created = await findMetricCard('Solicitudes')
    const resolved = metricCard('Resueltos')
    expect(created.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(resolved.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    const created7 = created.querySelector('polyline')!.getAttribute('points')!.split(' ')
    expect(created7).toHaveLength(7)
    const firstResponse = metricCard('Primera respuesta')
    expect(within(firstResponse).getByText('antes 22')).toBeInTheDocument()
    expect(within(firstResponse).getByText(/^objetivo 30\smin$/)).toBeInTheDocument()
    expect(metricCard('Resolución').querySelector('svg')).toBeNull()
  })

  it('sin primera respuesta ni periodo anterior la barra solo marca el objetivo', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/reports/summary': byPeriod({ firstResponseMinutes: { value: null, previous: null, target: 30 } }),
    })
    renderReports()
    const card = await findMetricCard('Primera respuesta')
    expect(within(card).queryByText(/^antes/)).not.toBeInTheDocument()
    expect(within(card).getByText(/^objetivo 30\smin$/)).toBeInTheDocument()
  })

  describe('pendientes acumulados', () => {
    it('dibuja la línea de solicitudes menos resueltos acumulados y rotula el último valor', async () => {
      mockApi(baseRoutes)
      renderReports()
      const chart = await screen.findByRole('img', { name: 'Pendientes acumulados' })
      // 361 creados menos 6 resueltos (0+1+2+0+1+2+0) en la serie de prueba.
      expect(chart.closest('figure')!.querySelector('[class*="endLabel"]')).toHaveTextContent('+355 pendientes')
      expect(chart.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(7)
      expect(screen.getByRole('button', { name: /domingo.*: \+355 pendientes/ })).toBeInTheDocument()
    })

    it('si se resuelve más de lo que llega, el último valor es negativo con el menos tipográfico', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          byDay: reportDays(7, [0]).map((day, index) => ({ ...day, created: index === 0 ? 1 : 0, resolved: 2 })),
        }),
      })
      renderReports()
      expect(await screen.findByText('−11 pendientes')).toBeInTheDocument()
    })
  })

  describe('abiertos con y sin responsable', () => {
    it('dibuja el estado actual de useTeamMetrics con asignados y sin asignar', async () => {
      mockApi(baseRoutes)
      renderReports()
      const donut = await screen.findByRole('img', { name: 'Abiertos con y sin responsable' })
      expect(donut).toHaveAccessibleDescription(/Asignados 31; Sin asignar 7/)
      expect(within(donut).getByText('38')).toBeInTheDocument()
    })

    it('si su consulta falla muestra su propio error con Reintentar y el resto del informe sigue ahí', async () => {
      let fail = true
      mockApi({
        ...baseRoutes,
        'GET /api/members/metrics': () => (fail ? problem : { body: teamMetrics }),
      })
      renderReports()
      expect(await screen.findByText('No pudimos cargar los tickets abiertos')).toBeInTheDocument()
      // El informe no se ve afectado: cifras, gráficos y agentes siguen visibles.
      expect(metricCard('Solicitudes')).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Solicitudes por canal' })).toBeInTheDocument()
      expect(screen.getByRole('table', { name: 'Rendimiento por agente' })).toBeInTheDocument()
      expect(screen.queryByText('No pudimos cargar el informe')).not.toBeInTheDocument()
      // Su reintento tiene un nombre distinto al del informe.
      const retry = screen.getByRole('button', { name: /^Reintentar la carga de abiertos/ })
      fail = false
      await userEvent.click(retry)
      expect(await screen.findByRole('img', { name: 'Abiertos con y sin responsable' })).toBeInTheDocument()
    })

    it('sin tickets abiertos muestra un estado vacío', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/members/metrics': { body: { ...teamMetrics, assignedOpen: 0, unassignedOpen: 0 } },
      })
      renderReports()
      expect(await screen.findByText('No hay tickets abiertos')).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: 'Abiertos con y sin responsable' })).not.toBeInTheDocument()
    })

    it('no se atenúa al cambiar de periodo: es el estado actual', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': async (request) => {
          if (new URL(request.url).searchParams.get('period') === '30d') await gate
          return byPeriod()(request)
        },
      })
      renderReports()
      await screen.findByRole('img', { name: 'Abiertos con y sin responsable' })
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '30d')
      await screen.findByText('Actualizando el informe…')
      expect(screen.getByRole('region', { name: 'Abiertos con y sin responsable' })).not.toHaveClass('updating')
      expect(screen.getByRole('region', { name: 'Solicitudes por canal' })).toHaveClass('updating')
      release()
    })
  })

  describe('primera respuesta de los agentes', () => {
    it('dibuja un punto por agente con primera respuesta y nombra aparte a quien no la tiene', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          byAgent: [
            reportAgent({ member: { id: 'u-1', name: 'Laura Méndez' }, firstResponseMinutes: 14 }),
            reportAgent({ member: { id: 'u-2', name: 'Daniel Santos' }, firstResponseMinutes: 45 }),
            reportAgent({ member: { id: 'u-3', name: 'Pablo Viejo' }, firstResponseMinutes: null }),
            reportAgent({ member: { id: 'u-4', name: 'Sofía Ríos' }, firstResponseMinutes: null }),
          ],
        }),
      })
      renderReports()
      const plot = await screen.findByRole('group', { name: 'Primera respuesta frente al objetivo' })
      expect(within(plot).getAllByRole('button', { name: /min/ })).toHaveLength(2)
      expect(within(plot).queryByText('Pablo Viejo')).not.toBeInTheDocument()
      expect(screen.getByText('Sin primeras respuestas en el periodo: Pablo Viejo y Sofía Ríos.')).toBeInTheDocument()
      // Quien supera el objetivo (30 min) lo dice con texto, no solo con color.
      const [laura, daniel] = within(plot).getAllByRole('listitem')
      expect(daniel).toHaveTextContent('Daniel Santos')
      expect(daniel).toHaveTextContent('45 min · por encima del objetivo')
      expect(laura).not.toHaveTextContent('por encima')
      // La tabla de agentes no cambia: sigue incluyendo a quien no tiene dato.
      expect(screen.getByRole('table', { name: 'Rendimiento por agente' })).toHaveAccessibleDescription(
        'Mostrando 4 agentes',
      )
    })

    it('si nadie tiene primera respuesta no dibuja el gráfico y lo explica en la nota', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          byAgent: [reportAgent({ firstResponseMinutes: null })],
        }),
      })
      renderReports()
      expect(await screen.findByText('Sin primeras respuestas en el periodo: Laura Méndez.')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Primera respuesta frente al objetivo' })).not.toBeInTheDocument()
    })

    it('con el teclado se llega a un punto y su tooltip da el valor exacto', async () => {
      mockApi(baseRoutes)
      renderReports()
      const point = await screen.findByRole('button', { name: 'Laura Méndez: 15 min' })
      point.focus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Laura Méndez: 15 min')
    })
  })

  it('lista a los agentes y rotula a quien ya no está en el equipo activo', async () => {
    mockApi(baseRoutes)
    renderReports()
    const table = await screen.findByRole('table', { name: 'Rendimiento por agente' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(5)
    expect(within(rows[2]!).getByText('Sin datos')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('Retirado')).toBeInTheDocument()
    expect(within(rows[4]!).getByText('Invitación pendiente')).toBeInTheDocument()
    expect(table).toHaveAccessibleDescription('Mostrando 4 agentes')
  })

  it('explica quién aparece en una nota bajo la tabla de agentes, no en un aviso', async () => {
    mockApi(baseRoutes)
    renderReports()
    const table = await screen.findByRole('table', { name: 'Rendimiento por agente' })
    const note = screen.getByText('Incluye a quien ya no está en el equipo si atendió tickets en el periodo.')
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Quién aparece aquí')).not.toBeInTheDocument()
  })

  describe('estado, prioridad, tiempo de resolución y horario', () => {
    const titles = [
      'Estado de los abiertos',
      'Prioridad de los abiertos',
      'Cuánto tarda la resolución',
      'Cuándo llegan las solicitudes',
    ]

    it('añade los cuatro paneles tras «Rendimiento por agente», en su orden', async () => {
      mockApi(baseRoutes)
      renderReports()
      await screen.findByRole('table', { name: 'Rendimiento por agente' })
      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
      expect(headings.slice(headings.indexOf('Rendimiento por agente'))).toEqual(['Rendimiento por agente', ...titles])
    })

    it('el estado de los abiertos es un anillo con el total en el centro y los colores 1–3', async () => {
      mockApi(baseRoutes)
      renderReports()
      const donut = await screen.findByRole('img', { name: 'Estado de los abiertos' })
      expect(donut).toHaveAccessibleDescription(/Abierto 9; En progreso 14; Esperando cliente 5/)
      expect(within(donut).getByText('28')).toBeInTheDocument()
      expect(within(donut).getByText('abiertos')).toBeInTheDocument()
      expect(
        [...donut.querySelectorAll('path')].map((path) => /color(\d)/.exec(path.getAttribute('class') ?? '')?.[1]),
      ).toEqual(['1', '2', '3'])
      await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla de Estado de los abiertos' }))
      const table = screen.getByRole('table', { name: 'Estado de los abiertos' })
      expect(within(table).getByRole('cell', { name: '14' })).toBeInTheDocument()
    })

    it('la prioridad usa un solo tono, de la rampa más intensa a la más suave, y no los colores de estado', async () => {
      mockApi(baseRoutes)
      renderReports()
      const donut = await screen.findByRole('img', { name: 'Prioridad de los abiertos' })
      expect(donut).toHaveAccessibleDescription(/Urgente 2; Alta 8; Media 13; Baja 5/)
      const classes = [...donut.querySelectorAll('path')].map((path) => path.getAttribute('class') ?? '')
      expect(classes.map((c) => /colorseq(\d)/.exec(c)?.[1])).toEqual(['1', '2', '3', '4'])
      expect(screen.getByRole('button', { name: 'Urgente: 2' })).toBeInTheDocument()
    })

    it('el histograma da los seis tramos en orden, con su valor exacto con el teclado y su tabla', async () => {
      mockApi(baseRoutes)
      renderReports()
      const chart = await screen.findByRole('group', { name: 'Cuánto tarda la resolución' })
      expect(
        within(chart)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual(['< 1 h: 24', '1–4 h: 96', '4–8 h: 78', '8–24 h: 54', '1–3 d: 36', '> 3 d: 12'])
      // El eje usa las etiquetas compactas; el nombre accesible y la tabla, las completas.
      expect(chart.querySelectorAll('[class*="axis"]:not([class*="axisRow"])')).toHaveLength(6)
      expect(
        [...chart.querySelectorAll('[class*="axis"]:not([class*="axisRow"])')].map((el) => el.textContent),
      ).toEqual(['<1h', '1–4h', '4–8h', '8–24h', '1–3d', '>3d'])
      await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla de Cuánto tarda la resolución' }))
      const table = screen.getByRole('table', { name: 'Cuánto tarda la resolución' })
      expect(within(table).getByRole('columnheader', { name: 'Tiempo hasta resolver' })).toBeInTheDocument()
      expect(within(table).getAllByRole('row')).toHaveLength(7)
    })

    it('el mapa de calor pone lunes a domingo y las franjas de dos horas, con 0 en las celdas que no llegan', async () => {
      mockApi(baseRoutes)
      renderReports()
      const grid = await screen.findByRole('grid', { name: 'Cuándo llegan las solicitudes' })
      expect(
        within(grid)
          .getAllByRole('rowheader')
          .map((header) => header.textContent),
      ).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
      // Doce franjas y la esquina («Día»), que da a cada fila el mismo número de celdas.
      expect(within(grid).getAllByRole('columnheader')).toHaveLength(13)
      expect(within(grid).getAllByRole('gridcell')).toHaveLength(84)
      // Lunes 9 h (60) cae en la franja de 8 a 10 h y lunes 10 h (52) en la de 10 a 12 h.
      expect(within(grid).getByRole('gridcell', { name: 'lun 8–10 h: 60 solicitudes' })).toBeInTheDocument()
      expect(within(grid).getByRole('gridcell', { name: 'lun 10–12 h: 52 solicitudes' })).toBeInTheDocument()
      expect(within(grid).getByRole('gridcell', { name: 'mar 0–2 h: 0 solicitudes' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla de Cuándo llegan las solicitudes' }))
      expect(screen.getByRole('table', { name: 'Cuándo llegan las solicitudes' })).toBeVisible()
    })

    it('cada panel muestra su vacío sin esconder a los demás', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          openByStatus: { open: 0, inProgress: 0, waiting: 0 },
          openByPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
          resolutionTimes: reportResolutionTimes([0, 0, 0, 0, 0, 0]),
          createdByWeekdayHour: [],
        }),
      })
      renderReports()
      expect(await screen.findAllByRole('heading', { level: 3, name: 'Sin tickets abiertos' })).toHaveLength(2)
      expect(screen.getByRole('heading', { level: 3, name: 'Sin resoluciones en este periodo' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Sin solicitudes en este periodo' })).toBeInTheDocument()
      for (const title of titles) expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
      expect(screen.getByRole('table', { name: 'Rendimiento por agente' })).toBeInTheDocument()
    })

    it('un anillo con tickets en un solo estado sigue dibujándose', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          openByStatus: { open: 1, inProgress: 0, waiting: 0 },
          openByPriority: { urgent: 0, high: 0, medium: 0, low: 1 },
        }),
      })
      renderReports()
      const donut = await screen.findByRole('img', { name: 'Estado de los abiertos' })
      expect(within(donut).getByText('abierto')).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Prioridad de los abiertos' })).toBeInTheDocument()
    })

    it('el esqueleto de carga no repite los títulos ni se lee', () => {
      mockApi({ ...baseRoutes, 'GET /api/reports/summary': never })
      renderReports()
      for (const title of titles) expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    })

    it('se atenúan con el periodo que cambia, como el resto del informe', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': async (request) => {
          if (new URL(request.url).searchParams.get('period') === '30d') await gate
          return byPeriod()(request)
        },
      })
      renderReports()
      await screen.findByRole('grid')
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '30d')
      await screen.findByText('Actualizando el informe…')
      for (const title of titles) {
        expect(screen.getByRole('heading', { level: 2, name: title }).closest('section')).toHaveClass('updating')
      }
      release()
      await waitFor(() => expect(screen.queryByText('Actualizando el informe…')).not.toBeInTheDocument())
    })
  })

  describe('periodo', () => {
    it('cambiar el periodo cambia la petición y la URL', async () => {
      const spy = mockApi(baseRoutes)
      const router = renderReports()
      await findMetricCard('Solicitudes')
      expect(requestedPeriods(spy)).toEqual(['7d'])

      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '30d')
      await waitFor(() => expect(requestedPeriods(spy)).toEqual(['7d', '30d']))
      expect(router.state.location.search).toBe('?period=30d')
      expect(await screen.findByText(/frente a los 30 días anteriores/)).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Periodo' })).toHaveValue('30d')

      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '7d')
      await waitFor(() => expect(router.state.location.search).toBe(''))
    })

    it('al cambiar de periodo sigue viendo el informe anterior, avisa que actualiza y no deja exportar', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': async (request) => {
          if (new URL(request.url).searchParams.get('period') === '30d') await gate
          return byPeriod()(request)
        },
      })
      renderReports()
      await findMetricCard('Solicitudes')
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled()

      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '30d')
      // El informe de 7 días sigue en pantalla, ocupado, sin esqueleto, y no se puede exportar como si fuera el de 30.
      expect(await screen.findByText('Actualizando el informe…')).toBeInTheDocument()
      expect(screen.getByText(/frente a los 7 días anteriores/).closest('[aria-busy]')).toHaveAttribute(
        'aria-busy',
        'true',
      )
      expect(screen.queryByText('Cargando el informe…')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
      // El rango sigue siendo el del informe visible: se atenúa con él para que no se lea como el del periodo elegido.
      expect(visibleRange()[0]).toHaveClass('updating')

      release()
      expect(await screen.findByText(/frente a los 30 días anteriores/)).toBeInTheDocument()
      expect(screen.queryByText('Actualizando el informe…')).not.toBeInTheDocument()
      expect(visibleRange()[0]).not.toHaveClass('updating')
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled()
    })

    it('abre con el periodo de la URL', async () => {
      const spy = mockApi(baseRoutes)
      renderReports('/reportes?period=90d')
      expect(await screen.findByRole('table', { name: 'Rendimiento por agente' })).toBeInTheDocument()
      expect(screen.getAllByText(/frente a los 90 días anteriores/).length).toBeGreaterThan(0)
      expect(screen.getByRole('combobox', { name: 'Periodo' })).toHaveValue('90d')
      expect(requestedPeriods(spy)).toEqual(['90d'])
      // Con 90 días el gráfico agrega por semanas.
      expect(screen.getByRole('img', { name: 'Solicitudes y resueltos por semana' })).toBeInTheDocument()
      expect(screen.getByText('Una barra por semana; la última puede estar incompleta.')).toBeInTheDocument()
    })

    it('un periodo que no existe vuelve al de por defecto, también en la URL', async () => {
      const spy = mockApi(baseRoutes)
      const router = renderReports('/reportes?period=foo')
      expect(await screen.findByText(/frente a los 7 días anteriores/)).toBeInTheDocument()
      expect(requestedPeriods(spy)).toEqual(['7d'])
      expect(screen.getByRole('combobox', { name: 'Periodo' })).toHaveValue('7d')
      await waitFor(() => expect(router.state.location.search).toBe(''))
    })
  })

  describe('estados vacíos y de error', () => {
    it('sin actividad en el periodo no dibuja barras vacías', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          byDay: reportDays(7, [0]).map((day) => ({ ...day, resolved: 0 })),
          byChannel: [],
          created: { value: 0, previous: 0 },
        }),
      })
      renderReports()
      // Sin actividad ni las barras ni la línea de pendientes tienen nada que dibujar.
      expect(await screen.findAllByText('Sin actividad en este periodo')).toHaveLength(2)
      expect(screen.queryByRole('img', { name: /Solicitudes y resueltos/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('img', { name: 'Pendientes acumulados' })).not.toBeInTheDocument()
      expect(screen.getByText('Ningún ticket se creó en este periodo.')).toBeInTheDocument()
    })

    it('sin agentes muestra el estado vacío y deshabilita la exportación', async () => {
      mockApi({ ...baseRoutes, 'GET /api/reports/summary': byPeriod({ byAgent: [] }) })
      renderReports()
      expect(await screen.findByText('Sin agentes en este periodo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
    })

    it('si falla ofrece reintentar y deshabilita la exportación', async () => {
      let fail = true
      mockApi({ ...baseRoutes, 'GET /api/reports/summary': (request) => (fail ? problem : byPeriod()(request)) })
      renderReports()
      expect(await screen.findByText('No pudimos cargar el informe')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByRole('table', { name: 'Rendimiento por agente' })).toBeInTheDocument()
    })
  })

  it('tras un refetch fallido muestra el error, sin el rango anterior, y no deja exportar los datos viejos', async () => {
    let fail = false
    mockApi({ ...baseRoutes, 'GET /api/reports/summary': (request) => (fail ? problem : byPeriod()(request)) })
    const { queryClient } = renderWithProviders(
      <RouterProvider
        router={createMemoryRouter([{ path: '/reportes', element: <ReportsPage /> }], {
          initialEntries: ['/reportes'],
        })}
      />,
    )
    await findMetricCard('Solicitudes')
    expect(visibleRange()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled()

    fail = true
    await queryClient.refetchQueries()
    expect(await screen.findByText('No pudimos cargar el informe')).toBeInTheDocument()
    expect(visibleRange()).toHaveLength(0)
    expect(screen.queryByRole('table', { name: 'Rendimiento por agente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
  })

  describe('exportar CSV', () => {
    function stubDownload() {
      const createObjectURL = vi.fn(() => 'blob:reporte')
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
      const anchors: { download: string; href: string }[] = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        anchors.push({ download: this.download, href: this.href })
      })
      return { createObjectURL, anchors }
    }

    it('descarga un archivo con los agentes, su estado y el nombre del periodo y la fecha de la organización', async () => {
      const { createObjectURL, anchors } = stubDownload()
      // 03:30 UTC del 5 de octubre sigue siendo el 4 en Bogotá.
      mockApi({
        ...baseRoutes,
        'GET /api/reports/summary': byPeriod({
          period: { from: '2026-09-05T05:00:00Z', to: '2026-10-05T03:30:00Z', days: 30, timeZone: 'America/Bogota' },
          byAgent: [reportAgent({ member: { id: 'u-1', name: '=cmd' } }), reportAgent({ status: 'removed' })],
        }),
      })
      renderReports('/reportes?period=30d')
      const button = await screen.findByRole('button', { name: 'Exportar CSV' })
      await waitFor(() => expect(button).toBeEnabled())
      await userEvent.click(button)

      expect(createObjectURL).toHaveBeenCalledOnce()
      expect(anchors).toEqual([{ download: 'reporte-agentes-30d-2026-10-04.csv', href: 'blob:reporte' }])
      const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]
      const bytes = new Uint8Array(await blob.arrayBuffer())
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const rows = new TextDecoder().decode(bytes).split('\r\n')
      expect(rows[0]).toBe('Agente,Estado,Resueltos,Primera respuesta (min),Asignados abiertos')
      expect(rows[1]).toBe("'=cmd,Activo,20,15,4")
      expect(rows[2]).toBe('Laura Méndez,Retirado,20,15,4')
    })
  })
})
