import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../test/api'
import { renderWithProviders } from '../test/render'
import { page, summary, ticket } from '../test/ticketFixtures'
import { mainNavigation } from './navigation'
import { appRoutes } from './router'

afterEach(() => {
  vi.restoreAllMocks()
})

const requestedPaths = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => new URL((input as Request).url).pathname)

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

describe('rutas de la aplicación', () => {
  it('lleva a un cliente de / a /tickets', async () => {
    mockApi({ 'GET /api/me': { body: customerMe }, 'GET /api/tickets': { body: { items: [], page: 0, size: 20 } } })
    const router = renderApp('/')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
  })

  it('no redirige al personal desde /', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    const router = renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('muestra a un cliente el aviso sin acceso en /tickets/nuevo, con su encabezado', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/tickets/nuevo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Crear ticket' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeInTheDocument()
    expect(screen.getByText('Solo los agentes y administradores pueden registrar tickets.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear ticket' })).not.toBeInTheDocument()
  })

  it('deja al personal abrir /tickets/nuevo', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers': { body: { items: [], page: 0, size: 20 } },
      'GET /api/assignees': { body: [] },
    })
    renderApp('/tickets/nuevo')
    expect(await screen.findByRole('button', { name: 'Crear ticket' })).toBeInTheDocument()
  })

  it('deja a un cliente ver la bandeja en /tickets', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/tickets': { body: page([summary()]) },
    })
    renderApp('/tickets')
    expect(await screen.findByText('No puedo acceder a mi cuenta')).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    expect(requestedPaths(fetchSpy)).toContain('/api/tickets')
  })

  it('deja a un cliente ver el detalle en /tickets/:number', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/tickets/1048': { body: ticket() },
      'GET /api/tickets/1048/messages': { body: [] },
    })
    renderApp('/tickets/1048')
    expect(await screen.findByText('No puedo acceder a mi cuenta')).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
  })

  it('pide el detalle de un ticket sin esperar a que cargue la sesión', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': () => new Promise<never>(() => {}),
      'GET /api/tickets/1048': { body: ticket() },
      'GET /api/tickets/1048/messages': { body: [] },
    })
    renderApp('/tickets/1048')
    await vi.waitFor(() => expect(requestedPaths(fetchSpy)).toContain('/api/tickets/1048'))
  })

  const staffMes = [
    ['admin', adminMe],
    ['agent', { ...adminMe, role: 'agent' }],
  ] as const

  const staffSections = mainNavigation.filter((item) => item.to !== '/' && !item.roles.includes('customer'))

  it.each(staffSections.map((item) => [item.to, item.label]))(
    'muestra a un cliente el aviso sin acceso en %s, con el encabezado «%s»',
    async (path, label) => {
      mockApi({ 'GET /api/me': { body: customerMe } })
      renderApp(path)
      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeInTheDocument()
      expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
    },
  )

  // /clientes y /equipo ya tienen su vista; se prueban aparte.
  const pendingSections = staffSections.filter((item) => item.to !== '/clientes' && item.to !== '/equipo')

  it.each(pendingSections.flatMap((item) => staffMes.map(([role, me]) => [item.to, item.label, role, me] as const)))(
    'deja al personal abrir %s («%s») como %s',
    async (path, label, _role, me) => {
      mockApi({ 'GET /api/me': { body: me } })
      renderApp(path)
      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Vista en construcción' })).toBeInTheDocument()
      expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    },
  )

  it.each(staffMes)('deja al personal abrir la lista de clientes como %s', async (_role, me) => {
    mockApi({
      'GET /api/me': { body: me },
      'GET /api/customers': { body: { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 } },
      'GET /api/customers/metrics': { body: { total: 0, companies: 0, withOpenTickets: 0, newThisMonth: 0 } },
      'GET /api/customers/companies': { body: [] },
    })
    renderApp('/clientes')
    expect(await screen.findByText('Todavía no hay clientes')).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
  })

  it('/clientes/nuevo abre el diálogo de alta sobre la lista, que sigue montada', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers': { body: { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 } },
      'GET /api/customers/metrics': { body: { total: 0, companies: 0, withOpenTickets: 0, newThisMonth: 0 } },
      'GET /api/customers/companies': { body: [] },
    })
    renderApp('/clientes/nuevo')
    expect(await screen.findByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument()
  })

  it('un cliente no abre /clientes/:id: ve el aviso sin acceso y la ficha no se pide', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/clientes/c-maria')
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
    expect(fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url).pathname)).toEqual(['/api/me'])
  })

  it('/clientes/:id abre el detalle del cliente', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers/c-maria': { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderApp('/clientes/c-maria')
    expect(await screen.findByText('No existe el cliente')).toBeInTheDocument()
  })

  it('un cliente no abre /equipo: ve el aviso sin acceso y el equipo no se pide', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/equipo')
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
    expect(requestedPaths(fetchSpy)).toEqual(['/api/me'])
  })

  it.each(staffMes)('deja al personal abrir el equipo como %s', async (_role, me) => {
    mockApi({
      'GET /api/me': { body: me },
      'GET /api/members': { body: [] },
      'GET /api/members/metrics': {
        body: {
          staff: 0,
          assignedOpen: 0,
          unassignedOpen: 0,
          averageLoad: 0,
          firstResponseMinutes: null,
          firstResponseTargetMinutes: 30,
        },
      },
    })
    renderApp('/equipo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo' })).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay equipo')).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
  })

  it('cubre todas las secciones de personal', () => {
    expect(staffSections.map((item) => item.to)).toEqual([
      '/clientes',
      '/equipo',
      '/reportes',
      '/conocimiento',
      '/configuracion',
    ])
  })
})
