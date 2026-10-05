import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummary } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ReportsPage } from './ReportsPage'
import { reportAgent, reportDays, reportSummary } from './reportFixtures'

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

const baseRoutes = { 'GET /api/me': { body: adminMe }, 'GET /api/reports/summary': byPeriod() }

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

  it('dibuja el gráfico con su tabla alternativa y un ProgressBar por canal con su etiqueta en español', async () => {
    mockApi(baseRoutes)
    renderReports()
    expect(await screen.findByRole('img', { name: 'Solicitudes y resueltos por día' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toBeInTheDocument()
    const email = screen.getByRole('progressbar', { name: 'Correo' })
    expect(email).toHaveAttribute('aria-valuetext', '71,5 % · 258 tickets')
    expect(screen.getByRole('progressbar', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Web' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Teléfono' })).not.toBeInTheDocument()
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
      expect(await screen.findByText('Sin actividad en este periodo')).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Solicitudes y resueltos/ })).not.toBeInTheDocument()
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
