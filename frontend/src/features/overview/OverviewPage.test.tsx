import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityFeedItem, ReportSummary } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { metrics, page, summary } from '../../test/ticketFixtures'
import { OverviewPage } from './OverviewPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']

const report = (created: number[] = [44, 61, 54, 72, 65, 35, 30]): ReportSummary => ({
  period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 7, timeZone: 'America/Bogota' },
  created: { value: 361, previous: 300 },
  resolved: { value: 300, previous: 280 },
  firstResponseMinutes: { value: 18, previous: 22, target: 30 },
  resolutionHours: { value: 6.5, previous: null },
  byDay: days.map((date, index) => ({ date, created: created[index] ?? 0, resolved: 0 })),
  byChannel: [],
  byAgent: [],
})

const feed: ActivityFeedItem[] = [
  {
    ticketNumber: 1047,
    subject: 'Error de pago',
    activity: {
      id: 'a-1',
      type: 'status_changed',
      actor: { id: 'u-laura', name: 'Laura Méndez' },
      createdAt: '2026-10-04T14:52:00Z',
      from: 'open',
      to: 'resolved',
    },
  },
]

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/tickets/metrics': { body: metrics },
  'GET /api/reports/summary': { body: report() },
  'GET /api/tickets/activity': { body: feed },
  'GET /api/tickets': { body: page([summary(), summary({ id: 't-1047', number: 1047, subject: 'Error de pago' })]) },
}

function renderOverview() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <OverviewPage /> },
      { path: '/tickets/:number', element: <h1>Detalle</h1> },
      { path: '/tickets', element: <h1>Bandeja</h1> },
      { path: '/reportes', element: <h1>Reportes</h1> },
    ],
    { initialEntries: ['/'] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const never = () => new Promise(() => {}) as never
const problem = { status: 500, body: { status: 500, title: 'Error' } }
const metricValue = async (label: string) => (await screen.findByText(label)).closest('dl')!

describe('OverviewPage', () => {
  it('muestra un esqueleto en cada bloque mientras carga', () => {
    mockApi({
      'GET /api/tickets/metrics': never,
      'GET /api/reports/summary': never,
      'GET /api/tickets/activity': never,
      'GET /api/tickets': never,
    })
    renderOverview()
    expect(screen.getByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument()
    for (const label of [
      'Cargando métricas…',
      'Cargando el gráfico de solicitudes…',
      'Cargando la actividad reciente…',
      'Cargando los tickets que necesitan atención…',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('muestra cada tarjeta con sus valores', async () => {
    mockApi(baseRoutes)
    renderOverview()
    const open = await metricValue('Tickets abiertos')
    expect(await within(open).findByText('24')).toBeInTheDocument()
    expect(within(open).getByText('8 nuevos hoy')).toBeInTheDocument()
    const resolved = await metricValue('Resueltos hoy')
    expect(within(resolved).getByText('38')).toBeInTheDocument()
    expect(within(resolved).getByText('4 más que ayer (12 %)')).toBeInTheDocument()
    const first = await metricValue('Primera respuesta')
    expect(within(first).getByText('18 min')).toBeInTheDocument()
    expect(within(first).getByText('Mediana de 7 días · Objetivo: 30 min')).toBeInTheDocument()
    const unassigned = await metricValue('Sin responsable')
    expect(within(unassigned).getByText('6')).toBeInTheDocument()
    expect(within(unassigned).getByRole('link', { name: 'Ver sin asignar' })).toHaveAttribute(
      'href',
      '/tickets?view=unassigned',
    )
  })

  it('muestra «Sin datos» sin primera respuesta y no inventa porcentajes con ayer = 0', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': {
        body: { ...metrics, firstResponseMinutes: null, resolvedToday: 3, resolvedYesterday: 0 },
      },
    })
    renderOverview()
    expect(await within(await metricValue('Primera respuesta')).findByText('Sin datos')).toBeInTheDocument()
    expect(within(await metricValue('Resueltos hoy')).getByText('3 más que ayer')).toBeInTheDocument()
  })

  it('dibuja el gráfico de la semana con su tabla alternativa', async () => {
    mockApi(baseRoutes)
    renderOverview()
    expect(await screen.findByRole('img', { name: 'Solicitudes por día' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Solicitudes · Últimos 7 días' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Ver como tabla/ }))
    expect(screen.getByRole('table', { name: 'Solicitudes por día' })).toBeVisible()
  })

  it('sustituye el gráfico por un estado vacío si no hubo solicitudes', async () => {
    mockApi({ ...baseRoutes, 'GET /api/reports/summary': { body: report([0, 0, 0, 0, 0, 0, 0]) } })
    renderOverview()
    expect(await screen.findByText('Sin solicitudes en los últimos 7 días')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Solicitudes por día' })).not.toBeInTheDocument()
  })

  it('enlaza cada actividad con su ticket', async () => {
    mockApi(baseRoutes)
    const router = renderOverview()
    const link = await screen.findByRole('link', {
      name: 'Laura Méndez cambió el estado a Resuelto · #1047 Error de pago',
    })
    expect(link).toHaveAttribute('href', '/tickets/1047')
    await userEvent.click(link)
    expect(router.state.location.pathname).toBe('/tickets/1047')
  })

  it('lista los tickets que necesitan atención y enlaza con la bandeja', async () => {
    const fetchSpy = mockApi(baseRoutes)
    renderOverview()
    const table = await screen.findByRole('table', { name: 'Tickets que necesitan atención' })
    expect(within(table).getByRole('link', { name: /#1047 Error de pago/ })).toHaveAttribute('href', '/tickets/1047')
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/tickets')
    expect(screen.getByRole('link', { name: 'Ver reportes' })).toHaveAttribute('href', '/reportes')
    const request = fetchSpy.mock.calls
      .map(([input]) => new URL((input as Request).url))
      .find((url) => url.pathname === '/api/tickets')!
    expect(request.searchParams.getAll('status')).toEqual(['open', 'in_progress'])
    expect(request.searchParams.get('sort')).toBe('priority,desc')
    expect(request.searchParams.get('size')).toBe('5')
  })

  describe('vacío', () => {
    it('muestra un estado vacío en la actividad y en la tabla', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/tickets/activity': { body: [] },
        'GET /api/tickets': { body: page([]) },
      })
      renderOverview()
      expect(await screen.findByText('Sin actividad todavía')).toBeInTheDocument()
      expect(await screen.findByText('Nada pendiente')).toBeInTheDocument()
    })
  })

  describe('error', () => {
    const cases = [
      ['GET /api/tickets/metrics', 'No pudimos cargar las métricas', 'Reintentar cargar las métricas'],
      ['GET /api/reports/summary', 'No pudimos cargar las solicitudes', 'Reintentar cargar el gráfico de solicitudes'],
      ['GET /api/tickets/activity', 'No pudimos cargar la actividad', 'Reintentar cargar la actividad reciente'],
      ['GET /api/tickets', 'No pudimos cargar los tickets', 'Reintentar cargar los tickets que necesitan atención'],
    ] as const

    it.each(cases)(
      'si falla %s solo ese bloque muestra el error y se reintenta por separado',
      async (route, title, retry) => {
        let failing = true
        mockApi({ ...baseRoutes, [route]: () => (failing ? problem : baseRoutes[route]) })
        renderOverview()
        expect(await screen.findByText(title)).toBeInTheDocument()
        // Los demás bloques siguen cargados y hay exactamente un error en pantalla.
        expect(screen.getAllByRole('button', { name: /^Reintentar/ })).toHaveLength(1)
        failing = false
        await userEvent.click(screen.getByRole('button', { name: retry }))
        await vi.waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument())
        expect(screen.queryByRole('button', { name: /^Reintentar/ })).not.toBeInTheDocument()
      },
    )
  })
})
