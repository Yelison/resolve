import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { metrics, page, summary, ticket } from '../../test/ticketFixtures'
import { TicketsPage } from './TicketsPage'

function renderInbox(path: string | { pathname: string; state: unknown } = '/tickets') {
  const router = createMemoryRouter([{ path: '/tickets', element: <TicketsPage /> }], { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TicketsPage para agentes', () => {
  it('muestra métricas, vistas con contadores y los tickets', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': {
        body: page([summary(), summary({ id: 't-1047', number: 1047, subject: 'Error de pago' })]),
      },
      'GET /api/assignees': { body: [] },
    })
    renderInbox()
    // Es el primer test del archivo: al arrancar en frío la carga puede superar el segundo por defecto.
    expect(
      await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' }, { timeout: 5000 }),
    ).toHaveAttribute('href', '/tickets/1048')
    expect(await screen.findByText('8 nuevos hoy')).toBeInTheDocument()
    expect(screen.getByText('↑ 12 % vs. ayer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignados a mí 4' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Todos los tickets 24' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Nuevo ticket/ })).toHaveAttribute('href', '/tickets/nuevo')
  })

  it('lleva la búsqueda y los filtros a la URL y a la API, volviendo a la primera página', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    const router = renderInbox('/tickets?page=3')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar tickets' }), 'pago')
    await waitFor(() => expect(router.state.location.search).toBe('?q=pago'))

    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'En progreso' }))
    expect(router.state.location.search).toBe('?status=in_progress&q=pago')
    expect(screen.getByRole('button', { name: 'Estado: En progreso' })).toBeInTheDocument()

    await waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/tickets').at(-1)!
      expect(last.searchParams.get('status')).toBe('in_progress')
      expect(last.searchParams.get('q')).toBe('pago')
      expect(last.searchParams.get('page')).toBe('0')
    })
  })

  it('cambiar el orden pide la lista con ese orden y vuelve a la primera página', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    const router = renderInbox('/tickets?page=3')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('updatedAt,desc')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar por' }), 'Número: mayor primero')

    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('number,desc')
    expect(new URLSearchParams(router.state.location.search).has('page')).toBe(false)
    await waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/tickets').at(-1)!
      expect(last.searchParams.get('sort')).toBe('number,desc')
      expect(last.searchParams.get('page')).toBe('0')
    })
  })

  it('carga el orden de la URL', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox('/tickets?sort=priority,asc')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('priority,asc')
    expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('sort')).toBe('priority,asc')
  })

  it('ignora un orden no válido de la URL', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox('/tickets?sort=title,asc')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('updatedAt,desc')
    const sorts = requestsTo(fetchSpy, '/api/tickets').map((url) => url.searchParams.get('sort'))
    expect(sorts).not.toHaveLength(0)
    expect(new Set(sorts)).toEqual(new Set(['updatedAt,desc']))
  })

  it('ofrece primero el orden por defecto y luego el más útil de cada campo', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox()
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    const options = within(screen.getByRole('combobox', { name: 'Ordenar por' })).getAllByRole('option')
    expect(options.map((option) => option.getAttribute('value'))).toEqual([
      'updatedAt,desc',
      'updatedAt,asc',
      'createdAt,desc',
      'createdAt,asc',
      'number,desc',
      'number,asc',
      'priority,desc',
      'priority,asc',
      'status,asc',
      'status,desc',
    ])
  })

  it('cambiar la vista desde la página 3 vuelve a la primera y conserva el orden', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    const router = renderInbox('/tickets?page=3&sort=number,asc')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })

    await userEvent.click(screen.getByRole('link', { name: /Asignados a mí/ }))
    const search = new URLSearchParams(router.state.location.search)
    expect(search.get('view')).toBe('mine')
    expect(search.get('sort')).toBe('number,asc')
    expect(search.has('page')).toBe(false)
    await waitFor(() => expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('page')).toBe('0'))
  })

  it('cambiar el responsable desde la página 3 vuelve a la primera y conserva el orden', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [{ id: 'u-2', name: 'Marta Ruiz', email: 'marta@example.com' }] },
    })
    const router = renderInbox('/tickets?page=3&sort=number,asc')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })

    await userEvent.click(screen.getByRole('button', { name: 'Responsable' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marta Ruiz' }))
    const search = new URLSearchParams(router.state.location.search)
    expect(search.get('assignee')).toBe('u-2')
    expect(search.get('sort')).toBe('number,asc')
    expect(search.has('page')).toBe(false)
    await waitFor(() => expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('page')).toBe('0'))
  })

  it('distingue una bandeja vacía de una búsqueda sin resultados', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([]) },
      'GET /api/assignees': { body: [] },
    })
    const router = renderInbox()
    expect(await screen.findByRole('heading', { name: 'Todavía no hay tickets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear ticket' })).toBeInTheDocument()

    await router.navigate('/tickets?priority=low')
    expect(await screen.findByRole('heading', { name: 'No encontramos tickets' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(router.state.location.search).toBe('')
  })

  it('permite reintentar cuando falla la carga', async () => {
    let attempts = 0
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/assignees': { body: [] },
      'GET /api/tickets': () => {
        attempts += 1
        return attempts === 1
          ? { status: 503, body: { status: 503, title: 'No disponible' } }
          : { body: page([summary()]) }
      },
    })
    renderInbox()
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })).toBeInTheDocument()
  })

  it('resuelve un ticket desde su menú usando la versión actual', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
      'GET /api/tickets/1048': { body: ticket({ version: 5 }) },
      'PATCH /api/tickets/1048': { body: ticket({ version: 6, status: 'resolved' }) },
    })
    renderInbox()
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones del ticket #1048' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))

    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Ticket #1048 resuelto')).toBeInTheDocument()
    const patch = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'PATCH')!
    expect(patch.headers.get('If-Match')).toBe('"5"')
    expect(patch.headers.get('Content-Type')).toBe('application/merge-patch+json')
    expect(await patch.clone().json()).toEqual({ status: 'resolved' })
  })
})

describe('TicketsPage y el historial del navegador', () => {
  it('el buscador refleja la búsqueda de la URL al navegar', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    const router = renderInbox('/tickets?q=pago')
    const search = await screen.findByRole('searchbox', { name: 'Buscar tickets' })
    expect(search).toHaveValue('pago')
    await router.navigate('/tickets?q=acceso')
    await waitFor(() => expect(search).toHaveValue('acceso'))
    await router.navigate('/tickets')
    await waitFor(() => expect(search).toHaveValue(''))
  })
})

describe('TicketsPage desde el atajo de búsqueda', () => {
  it('enfoca el buscador', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox({ pathname: '/tickets', state: { focusSearch: 1 } })
    expect(await screen.findByRole('searchbox', { name: 'Buscar tickets' })).toHaveFocus()
  })
})

describe('TicketsPage para clientes', () => {
  it('no pide métricas ni muestra vistas ni acciones de equipo', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/tickets': { body: page([summary()]) },
    })
    renderInbox()
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    expect(screen.getByText('Tus solicitudes de soporte.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Vistas de la bandeja' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo ticket/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Responsable' })).not.toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/tickets/metrics')).toHaveLength(0)
  })

  it('ignora vistas y responsable de la URL y no muestra el menú de acciones', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/tickets': { body: page([summary()]) },
    })
    renderInbox('/tickets?view=mine&assignee=none')
    await screen.findByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })
    const params = requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams
    expect(params.get('view')).toBe('all')
    expect(params.has('assigneeId')).toBe(false)
    expect(screen.queryByRole('button', { name: /Acciones del ticket/ })).not.toBeInTheDocument()
  })
})

describe('TicketsPage y la zona de la organización', () => {
  it('cuenta el «ayer» de cada fila en la zona de la organización', async () => {
    // 11:00 del día 2 en Ciudad de México; ahora son las 23:30 del día 3 allí (36 h y 30 min después). Contar días de UTC daría «anteayer».
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T05:30:00Z') })
    mockApi({
      'GET /api/me': {
        body: { ...adminMe, organization: { ...adminMe.organization, timeZone: 'America/Mexico_City' } },
      },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary({ updatedAt: '2026-10-02T17:00:00Z' })]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox()
    expect((await screen.findAllByText('ayer')).length).toBeGreaterThan(0)
    expect(screen.queryByText('anteayer')).not.toBeInTheDocument()
  })
})
