import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityFeedItem, ArticleSummary, ReportSummary, TicketSummary } from '../../api/schema'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { createTestQueryClient, renderWithProviders } from '../../test/render'
import { metrics, page, summary, ticket } from '../../test/ticketFixtures'
import { reportDays, reportSummary } from '../reports/reportFixtures'
import { ticketKeys } from '../tickets/queries'
import { OverviewPage } from './OverviewPage'

// 12:00 en Bogotá (UTC−5): «Buenas tardes» allí, «Buenas noches» en Tokio.
const NOW = new Date('2026-10-10T17:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

const report = (created: number[] = [44, 61, 54, 72, 65, 35, 30]): ReportSummary =>
  reportSummary({ byDay: reportDays(7, created), byChannel: [], byAgent: [] })

const feedItem = (index: number): ActivityFeedItem => ({
  ticketNumber: 1000 + index,
  subject: `Asunto ${index}`,
  activity: {
    id: `a-${index}`,
    type: 'status_changed',
    actor: { id: 'u-laura', name: 'Laura Méndez' },
    createdAt: ago(index),
    from: 'open',
    to: 'resolved',
  },
})

const feed = (count: number) => Array.from({ length: count }, (_, index) => feedItem(index + 1))

const draft = (index: number): ArticleSummary => ({
  id: `d-${index}`,
  slug: `borrador-${index}`,
  title: `Borrador ${index}`,
  category: { id: 'c-1', name: 'Primeros pasos', slug: 'primeros-pasos' },
  status: 'draft',
  visibility: 'public',
  excerpt: '',
  updatedAt: ago(60 * index),
  publishedAt: null,
})

const drafts = (shown: number, total = shown) => ({
  items: Array.from({ length: shown }, (_, index) => draft(index + 1)),
  page: 0,
  size: 3,
  totalItems: total,
  totalPages: Math.ceil(total / 3),
})

const urgent = (number: number, overrides: Partial<TicketSummary> = {}) =>
  summary({
    id: `t-${number}`,
    number,
    subject: `Urgente ${number}`,
    priority: 'urgent',
    status: 'open',
    assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    customer: { id: 'c-1', name: 'María Pérez', email: 'maria@cliente.example', company: null },
    createdAt: ago(60 * 5),
    updatedAt: ago(5),
    ...overrides,
  })

/** Los motivos de la maqueta del caso con muchos datos, con el usuario como responsable de los tuyos. */
const manyTickets = (): TicketSummary[] => [
  urgent(1148),
  urgent(1145, { createdAt: ago(60 * 9) }),
  summary({
    id: 't-1131',
    number: 1131,
    subject: 'Doble cargo en la tarjeta',
    priority: 'medium',
    status: 'open',
    assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    customer: { id: 'c-2', name: 'Mateo Jiménez', email: 'mateo@fintek.example', company: 'Fintek' },
    lastMessage: {
      excerpt: 'Me cobraron dos veces',
      authorName: 'Mateo Jiménez',
      internal: false,
      createdAt: ago(60 * 3 + 5),
    },
    createdAt: ago(60 * 8),
    updatedAt: ago(60 * 3),
  }),
  summary({
    id: 't-1127',
    number: 1127,
    subject: 'La exportación a CSV sale vacía',
    priority: 'medium',
    status: 'in_progress',
    assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    customer: { id: 'c-3', name: 'Camila Rojas', email: 'camila@pino.example', company: 'Estudio Pino' },
    lastMessage: { excerpt: 'Sigue saliendo vacía', authorName: 'Camila Rojas', internal: false, createdAt: ago(40) },
    createdAt: ago(60 * 30),
    updatedAt: ago(40),
  }),
  summary({
    id: 't-1119',
    number: 1119,
    subject: 'Necesito borrar mis datos',
    priority: 'high',
    status: 'in_progress',
    assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    lastMessage: { excerpt: 'Hecho', authorName: 'Yelisson Ortiz', internal: false, createdAt: ago(60 * 24) },
    createdAt: ago(60 * 48),
    updatedAt: ago(60 * 24),
  }),
  summary({
    id: 't-1102',
    number: 1102,
    subject: 'El informe semanal no incluye mi equipo',
    priority: 'low',
    status: 'waiting',
    assignee: { id: 'u-admin', name: 'Yelisson Ortiz' },
    createdAt: ago(60 * 24 * 9),
    updatedAt: ago(60 * 24 * 5 + 30),
  }),
  summary({
    id: 't-1090',
    number: 1090,
    subject: 'Cambiar correo de facturación',
    priority: 'medium',
    status: 'in_progress',
    assignee: null,
    lastMessage: { excerpt: 'Listo', authorName: 'Yelisson Ortiz', internal: false, createdAt: ago(60 * 2) },
    createdAt: ago(60 * 10),
    updatedAt: ago(60 * 2),
  }),
]

const manyMetrics = { ...metrics, views: { all: 40, mine: 12, unassigned: 6, resolved: 10 }, open: 34 }

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/tickets/metrics': { body: metrics },
  'GET /api/reports/summary': { body: report() },
  'GET /api/tickets/activity': { body: feed(2) },
  'GET /api/knowledge/articles': { body: drafts(1) },
  'GET /api/tickets': {
    body: page([
      urgent(1048),
      summary({ id: 't-1047', number: 1047, subject: 'Error de pago', priority: 'high', status: 'in_progress' }),
    ]),
  },
}

function renderOverview(queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <OverviewPage /> },
      { path: '/tickets/nuevo', element: <h1>Nuevo ticket</h1> },
      { path: '/tickets/:number', element: <h1>Detalle</h1> },
      { path: '/tickets', element: <h1>Bandeja</h1> },
      { path: '/reportes', element: <h1>Reportes</h1> },
    ],
    { initialEntries: ['/'] },
  )
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return router
}

const never = () => new Promise(() => {}) as never
const problem = { status: 500, body: { status: 500, title: 'Error' } }
const metricValue = async (label: string) => (await screen.findByText(label)).closest('dl')!
const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, pathname: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === pathname)

describe('OverviewPage · cabecera', () => {
  it('saluda según la hora de la zona de la organización y dice el día', async () => {
    mockApi(baseRoutes)
    renderOverview()
    expect(await screen.findByRole('heading', { level: 1, name: 'Buenas tardes, Yelisson' })).toBeInTheDocument()
    expect(screen.getByText('Sábado, 10 de octubre')).toBeInTheDocument()
  })

  it('con otra zona cambia el saludo y el día, aunque el navegador esté en la suya', async () => {
    // Las 17:00 UTC son las 02:00 del domingo en Tokio.
    mockApi({
      ...baseRoutes,
      'GET /api/me': { body: { ...adminMe, organization: { ...adminMe.organization, timeZone: 'Asia/Tokyo' } } },
    })
    renderOverview()
    expect(await screen.findByRole('heading', { level: 1, name: 'Buenas noches, Yelisson' })).toBeInTheDocument()
    expect(screen.getByText('Domingo, 11 de octubre')).toBeInTheDocument()
  })

  it('ofrece los accesos a los reportes y a un ticket nuevo', async () => {
    mockApi(baseRoutes)
    renderOverview()
    expect(await screen.findByRole('link', { name: 'Ver reportes' })).toHaveAttribute('href', '/reportes')
    expect(screen.getByRole('link', { name: '+ Nuevo ticket' })).toHaveAttribute('href', '/tickets/nuevo')
  })
})

describe('OverviewPage · así va el soporte hoy', () => {
  it('muestra un esqueleto en cada bloque mientras carga', () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': never,
      'GET /api/reports/summary': never,
      'GET /api/tickets/activity': never,
      'GET /api/knowledge/articles': never,
      'GET /api/tickets': never,
    })
    renderOverview()
    for (const label of [
      'Cargando las métricas…',
      'Cargando las solicitudes de la semana…',
      'Cargando la actividad reciente…',
      'Cargando los tickets que necesitan atención…',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('el esqueleto tiene una sola etiqueta de carga y no repite los textos reales', () => {
    mockApi({ ...baseRoutes, 'GET /api/tickets/metrics': never })
    renderOverview()
    expect(screen.getAllByText('Cargando las métricas…')).toHaveLength(1)
    expect(screen.queryByText('Tickets abiertos')).not.toBeInTheDocument()
    // Las celdas de muestra que dan la altura no se leen ni se enfocan.
    expect(screen.queryByRole('link', { name: /Sin responsable/ })).not.toBeInTheDocument()
  })

  it('muestra los cuatro datos y cada uno enlaza a su vista de la bandeja', async () => {
    mockApi(baseRoutes)
    renderOverview()
    const strip = await screen.findByRole('group', { name: 'Así va el soporte hoy' })
    const links = await within(strip).findAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/tickets',
      '/tickets?view=unassigned',
      '/tickets?status=open&sort=createdAt,asc',
      '/tickets?view=resolved',
    ])
    const open = await metricValue('Tickets abiertos')
    expect(within(open).getByText('24')).toBeInTheDocument()
    expect(within(open).getByText('8 nuevos hoy')).toBeInTheDocument()
    const resolved = await metricValue('Resueltos hoy')
    expect(within(resolved).getByText('38')).toBeInTheDocument()
    expect(within(resolved).getByText('4 más que ayer (12 %)')).toBeInTheDocument()
  })

  it('avisa con texto de lo que va mal: sin responsable más de 4 h y la primera respuesta fuera del objetivo', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: { ...metrics, unassignedOver4Hours: 9, firstResponseMinutes: 42 } },
    })
    renderOverview()
    expect(await screen.findByText('9 llevan más de 4 h')).toBeInTheDocument()
    expect(screen.getByText(/Por encima del objetivo de\s30\smin/)).toBeInTheDocument()
    expect(within(await metricValue('Primera respuesta')).getByText('42 min')).toBeInTheDocument()
  })

  it('con todo en orden lo dice también con texto', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': {
        body: { ...metrics, unassignedOver4Hours: 0, views: { ...metrics.views, unassigned: 0 } },
      },
    })
    renderOverview()
    expect(await screen.findByText('Todos tienen responsable')).toBeInTheDocument()
    expect(screen.getByText(/Dentro del objetivo de\s30\smin/)).toBeInTheDocument()
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
})

describe('OverviewPage · necesitan atención', () => {
  it('por defecto muestra «Para mí» y pide los abiertos asignados a ti', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/tickets/metrics': { body: manyMetrics } })
    renderOverview()
    const mine = await screen.findByRole('button', { name: 'Para mí 12' })
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Todo el equipo 34' })).toHaveAttribute('aria-pressed', 'false')
    await screen.findByRole('list', { name: 'Tickets que necesitan atención' })
    const request = requestsTo(fetchSpy, '/api/tickets').at(-1)!
    expect(request.searchParams.get('view')).toBe('mine')
    expect(request.searchParams.get('sort')).toBe('priority,desc')
    expect(request.searchParams.get('size')).toBe('100')
  })

  it('sin nada asignado empieza por «Todo el equipo» y explica por qué', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: { ...manyMetrics, views: { ...manyMetrics.views, mine: 0 } } },
    })
    renderOverview()
    expect(await screen.findByRole('button', { name: 'Todo el equipo 34' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      await screen.findByText('No tienes tickets asignados. Te mostramos lo que el equipo tiene pendiente.'),
    ).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Tickets que necesitan atención' })
    const request = requestsTo(fetchSpy, '/api/tickets').at(-1)!
    expect(request.searchParams.get('view')).toBe('all')
    expect(request.searchParams.getAll('status')).toEqual(['open', 'in_progress', 'waiting'])
  })

  it('dice el motivo de cada ticket y ofrece la acción que toca', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: manyMetrics },
      'GET /api/tickets': { body: page(manyTickets(), 12) },
    })
    renderOverview()
    const list = await screen.findByRole('list', { name: 'Tickets que necesitan atención' })
    const rows = within(list).getAllByRole('listitem')
    // Urgentes primero (el que más espera, antes), luego sin respuesta, sin asignar, respondió, alta y esperando.
    expect(rows).toHaveLength(6)
    expect(rows.map((row) => within(row).getAllByRole('link')[0]!.textContent)).toEqual([
      '#1145 Urgente 1145',
      '#1148 Urgente 1148',
      '#1131 Doble cargo en la tarjeta',
      '#1090 Cambiar correo de facturación',
      '#1127 La exportación a CSV sale vacía',
      '#1119 Necesito borrar mis datos',
    ])
    expect(within(rows[2]!).getByText('Sin respuesta desde hace 3 h')).toBeInTheDocument()
    expect(within(rows[4]!).getByText('El cliente respondió hace 40 min')).toBeInTheDocument()
    expect(within(rows[4]!).getByText('«Sigue saliendo vacía»')).toBeInTheDocument()
    // Responder en lo tuyo que espera respuesta, Asignármelo en lo que no tiene responsable, Abrir en el resto.
    expect(within(rows[0]!).getByRole('link', { name: /Responder/ })).toHaveAttribute('href', '/tickets/1145')
    expect(within(rows[3]!).getByRole('button', { name: /Asignármelo/ })).toBeInTheDocument()
    expect(within(rows[4]!).getByRole('link', { name: /Abrir/ })).toHaveAttribute('href', '/tickets/1127')
  })

  it('el motivo «Esperando al cliente N días» aparece cuando cabe en los 6', async () => {
    const waiting = manyTickets().find((candidate) => candidate.number === 1102)!
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: manyMetrics },
      'GET /api/tickets': { body: page([waiting], 1) },
    })
    renderOverview()
    expect(await screen.findByText('Esperando al cliente 5 días')).toBeInTheDocument()
    expect(screen.getByText('Esperando')).toBeInTheDocument()
  })

  it('el pie dice cuántos hay y lleva a la bandeja con el mismo filtro', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: manyMetrics },
      'GET /api/tickets': { body: page(manyTickets(), 12) },
    })
    renderOverview()
    expect(await screen.findByText('Los 6 más urgentes de 12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver los 12 en la bandeja' })).toHaveAttribute(
      'href',
      '/tickets?view=mine&sort=priority,desc',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Todo el equipo 34' }))
    expect(await screen.findByRole('link', { name: 'Ver los 12 en la bandeja' })).toHaveAttribute(
      'href',
      '/tickets?sort=priority,desc',
    )
  })

  it('si caben todos no habla de «los más urgentes» ni de «Ver los 1»', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets': { body: page([urgent(1048)], 1) },
    })
    renderOverview()
    expect(await screen.findByText('1 ticket abierto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a la bandeja' })).toBeInTheDocument()
    expect(screen.queryByText(/más urgentes/)).not.toBeInTheDocument()
  })

  it('la elección de la persona no se pisa cuando las métricas se vuelven a pedir', async () => {
    let mine = 4
    const queryClient = createTestQueryClient()
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': () => ({ body: { ...metrics, views: { ...metrics.views, mine } } }),
    })
    renderOverview(queryClient)
    await userEvent.click(await screen.findByRole('button', { name: 'Todo el equipo 24' }))
    mine = 0
    await act(() => queryClient.refetchQueries({ queryKey: ticketKeys.metrics() }))
    expect(await screen.findByRole('button', { name: 'Para mí 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todo el equipo 24' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/No tienes tickets asignados\. Te mostramos/)).not.toBeInTheDocument()
  })

  it('«Asignármelo» asigna el ticket, lo anuncia y deja el foco en el ticket', async () => {
    const unassigned = urgent(1046, { assignee: null, subject: 'Cambiar correo de facturación' })
    const patched: unknown[] = []
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: { ...metrics, views: { ...metrics.views, mine: 0 } } },
      'GET /api/tickets': { body: page([unassigned], 1) },
      'GET /api/tickets/1046': { body: ticket({ number: 1046, version: 7 }) },
      'PATCH /api/tickets/1046': async (request) => {
        patched.push([request.headers.get('If-Match'), await request.json()])
        return { body: ticket({ number: 1046, version: 8, assignee: { id: 'u-admin', name: 'Yelisson Ortiz' } }) }
      },
    })
    renderOverview()
    await userEvent.click(await screen.findByRole('button', { name: /Asignármelo/ }))
    expect(await screen.findByText('Te asignaste el ticket #1046')).toBeInTheDocument()
    expect(patched).toEqual([['"7"', { assigneeId: 'u-admin' }]])
    // Lo urgente que es tuyo pide «Responder»: el botón se sustituye por ese enlace y el foco no cae en `body`.
    expect(await screen.findByRole('link', { name: /Responder/ })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole('link', { name: /#1046 Cambiar correo/ })).toHaveFocus())
  })

  it('si falla al asignar lo dice y el botón sigue ahí para repetirlo', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': { body: { ...metrics, views: { ...metrics.views, mine: 0 } } },
      'GET /api/tickets': { body: page([urgent(1046, { assignee: null })], 1) },
      'GET /api/tickets/1046': { body: ticket({ number: 1046, version: 7 }) },
      'PATCH /api/tickets/1046': { status: 412, body: { status: 412, title: 'Precondition Failed' } },
    })
    renderOverview()
    await userEvent.click(await screen.findByRole('button', { name: /Asignármelo/ }))
    expect(await screen.findByText('No se pudo asignar el ticket #1046')).toBeInTheDocument()
    expect(screen.getByText(/Otra persona lo cambió a la vez/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Asignármelo/ })).toBeEnabled()
  })

  describe('vacío', () => {
    it('sin tickets abiertos en el equipo dice que no hay nada pendiente', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/tickets/metrics': {
          body: { ...metrics, open: 0, views: { all: 3, mine: 0, unassigned: 0, resolved: 3 } },
        },
        'GET /api/tickets': { body: page([]) },
      })
      renderOverview()
      expect(await screen.findByText('Nada pendiente')).toBeInTheDocument()
    })

    it('«Para mí» vacío, elegido a propósito, lo dice con su propio texto', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/tickets/metrics': { body: { ...metrics, views: { ...metrics.views, mine: 0 } } },
        'GET /api/tickets': { body: page([]) },
      })
      renderOverview()
      await userEvent.click(await screen.findByRole('button', { name: 'Para mí 0' }))
      expect(await screen.findByText('Cuando te asignen uno, aparecerá aquí.')).toBeInTheDocument()
    })

    it('con tickets abiertos pero ninguno con motivo dice que no hay nada urgente', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/tickets': {
          body: page([summary({ priority: 'medium', status: 'in_progress', lastMessage: null })], 1),
        },
      })
      renderOverview()
      expect(await screen.findByText('Nada urgente por ahora')).toBeInTheDocument()
    })
  })
})

describe('OverviewPage · columna derecha', () => {
  it('dibuja las solicitudes de la semana con su total, la comparación y la tabla alternativa', async () => {
    mockApi(baseRoutes)
    renderOverview()
    expect(await screen.findByRole('img', { name: 'Solicitudes por día' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Solicitudes esta semana' })).toBeInTheDocument()
    expect(screen.getByText('361')).toBeInTheDocument()
    expect(screen.getByText('61 más (20 %) frente a los 7 días anteriores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el detalle en Reportes' })).toHaveAttribute('href', '/reportes')
    await userEvent.click(screen.getByRole('button', { name: /Ver como tabla/ }))
    expect(screen.getByRole('table', { name: 'Solicitudes por día' })).toBeVisible()
  })

  it('sustituye el gráfico por un estado vacío si no hubo solicitudes', async () => {
    mockApi({ ...baseRoutes, 'GET /api/reports/summary': { body: report([0, 0, 0, 0, 0, 0, 0]) } })
    renderOverview()
    expect(await screen.findByText('Sin solicitudes esta semana')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Solicitudes por día' })).not.toBeInTheDocument()
  })

  it('enlaza cada actividad con su ticket', async () => {
    mockApi(baseRoutes)
    const router = renderOverview()
    const link = await screen.findByRole('link', {
      name: 'Laura Méndez cambió el estado a Resuelto · #1001 Asunto 1',
    })
    expect(link).toHaveAttribute('href', '/tickets/1001')
    await userEvent.click(link)
    expect(router.state.location.pathname).toBe('/tickets/1001')
  })

  it('muestra 5 eventos y «Ver más actividad» amplía la lista en la misma página', async () => {
    mockApi({ ...baseRoutes, 'GET /api/tickets/activity': { body: feed(12) } })
    renderOverview()
    const panel = await screen.findByRole('region', { name: 'Actividad reciente' })
    expect(await within(panel).findAllByRole('listitem')).toHaveLength(5)
    const more = within(panel).getByRole('button', { name: 'Ver más actividad' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(within(panel).getAllByRole('listitem')).toHaveLength(12)
    const less = within(panel).getByRole('button', { name: 'Ver menos actividad' })
    expect(less).toHaveAttribute('aria-expanded', 'true')
    expect(less).toHaveFocus()
    await userEvent.click(less)
    expect(within(panel).getAllByRole('listitem')).toHaveLength(5)
  })

  it('con 5 eventos o menos no ofrece «Ver más actividad»', async () => {
    mockApi({ ...baseRoutes, 'GET /api/tickets/activity': { body: feed(5) } })
    renderOverview()
    const panel = await screen.findByRole('region', { name: 'Actividad reciente' })
    await within(panel).findAllByRole('listitem')
    expect(within(panel).queryByRole('button', { name: /Ver más actividad/ })).not.toBeInTheDocument()
  })

  it('lista los 3 borradores más recientes y enlaza con Conocimiento filtrado por borradores', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/knowledge/articles': { body: drafts(3, 6) } })
    renderOverview()
    const panel = await screen.findByRole('region', { name: /Borradores sin publicar/ })
    expect(await within(panel).findByRole('link', { name: 'Borrador 1' })).toHaveAttribute(
      'href',
      '/conocimiento/borrador-1/editar',
    )
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
    expect(within(panel).getByRole('link', { name: 'Ver los 6 borradores' })).toHaveAttribute(
      'href',
      '/conocimiento?status=draft',
    )
    const request = requestsTo(fetchSpy, '/api/knowledge/articles')[0]!
    expect(request.searchParams.get('status')).toBe('draft')
    expect(request.searchParams.get('size')).toBe('3')
  })

  it('sin borradores lo dice', async () => {
    mockApi({ ...baseRoutes, 'GET /api/knowledge/articles': { body: drafts(0) } })
    renderOverview()
    expect(await screen.findByText('No tienes borradores')).toBeInTheDocument()
  })

  it('quien no puede escribir artículos no ve los borradores ni los pide', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/me': { body: customerMe } })
    renderOverview()
    await screen.findByRole('heading', { level: 1, name: /Buenas tardes, María/ })
    expect(screen.queryByRole('region', { name: /Borradores sin publicar/ })).not.toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/knowledge/articles')).toHaveLength(0)
  })
})

describe('OverviewPage · error', () => {
  const cases = [
    [
      'GET /api/tickets/metrics',
      'No pudimos cargar las métricas',
      'Reintentar cargar las métricas',
      'group',
      'Así va el soporte hoy',
    ],
    [
      'GET /api/reports/summary',
      'No pudimos cargar las solicitudes',
      'Reintentar cargar las solicitudes de la semana',
      'region',
      'Solicitudes esta semana',
    ],
    [
      'GET /api/tickets/activity',
      'No pudimos cargar la actividad',
      'Reintentar cargar la actividad reciente',
      'region',
      'Actividad reciente',
    ],
    [
      'GET /api/tickets',
      'No pudimos cargar los tickets',
      'Reintentar cargar los tickets que necesitan atención',
      'region',
      'Necesitan atención',
    ],
    [
      'GET /api/knowledge/articles',
      'No pudimos cargar los borradores',
      'Reintentar cargar los borradores',
      'region',
      'Borradores sin publicar',
    ],
  ] as const

  it.each(cases)(
    'si falla %s solo ese bloque muestra el error y se reintenta por separado',
    async (route, title, retry, role, block) => {
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
      // El botón desaparece: el foco pasa al bloque recuperado, no a `body`.
      expect(screen.getByRole(role, { name: new RegExp(block) })).toHaveFocus()
    },
  )

  it.each([
    ['GET /api/tickets/metrics', 'No tienes permiso para ver las métricas'],
    ['GET /api/reports/summary', 'No tienes permiso para ver las solicitudes'],
    ['GET /api/tickets/activity', 'No tienes permiso para ver la actividad'],
    ['GET /api/tickets', 'No tienes permiso para ver los tickets'],
    ['GET /api/knowledge/articles', 'No tienes permiso para ver los borradores'],
  ] as const)('si %s responde 403 dice que no hay permiso, sin ofrecer reintentar', async (route, title) => {
    mockApi({ ...baseRoutes, [route]: { status: 403, body: { status: 403, title: 'Forbidden' } } })
    renderOverview()
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reintentar/ })).not.toBeInTheDocument()
  })

  it('si fallan las métricas los tickets siguen saliendo, con el equipo como alcance', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/tickets/metrics': problem })
    renderOverview()
    expect(await screen.findByText('No pudimos cargar las métricas')).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Tickets que necesitan atención' })
    expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('view')).toBe('all')
    // Sin cifras, los botones del selector se quedan con su nombre.
    expect(screen.getByRole('button', { name: 'Todo el equipo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('no roba el foco si la persona lo movió a otro control mientras llegaba el reintento', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let failing = true
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': async () => {
        if (!failing) await gate
        return failing ? problem : baseRoutes['GET /api/tickets/metrics']
      },
      'GET /api/tickets/activity': problem,
    })
    renderOverview()
    const metricsRetry = await screen.findByRole('button', { name: 'Reintentar cargar las métricas' })
    const activityRetry = await screen.findByRole('button', { name: 'Reintentar cargar la actividad reciente' })
    failing = false
    await userEvent.click(metricsRetry)
    // Mientras la respuesta está retenida, la persona pasa a otro control.
    act(() => activityRetry.focus())
    release()
    expect(await screen.findByRole('group', { name: 'Así va el soporte hoy' })).toBeInTheDocument()
    expect(activityRetry).toHaveFocus()
  })

  it('un reintento que falla no deja pendiente el foco para una recuperación posterior', async () => {
    let failing = true
    const queryClient = createTestQueryClient()
    mockApi({
      ...baseRoutes,
      'GET /api/tickets/metrics': () => (failing ? problem : baseRoutes['GET /api/tickets/metrics']),
    })
    renderOverview(queryClient)
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar cargar las métricas' }))
    // El reintento falla: el botón sigue ahí. Después la consulta se recupera sin que nadie pulse nada.
    expect(await screen.findByRole('button', { name: 'Reintentar cargar las métricas' })).toBeInTheDocument()
    failing = false
    ;(document.activeElement as HTMLElement | null)?.blur()
    await act(() => queryClient.refetchQueries({ queryKey: ticketKeys.metrics() }))
    expect(await screen.findByRole('group', { name: 'Así va el soporte hoy' })).toBeInTheDocument()
    expect(document.body).toHaveFocus()
  })
})
