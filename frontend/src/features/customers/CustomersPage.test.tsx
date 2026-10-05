import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomerMetrics, CustomerSummary } from '../../domain/customer'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { CustomersPage } from './CustomersPage'

const customer = (overrides: Partial<CustomerSummary> = {}): CustomerSummary => ({
  id: 'c-maria',
  name: 'María Pérez',
  email: 'maria@cliente.example',
  company: 'Acme Studio',
  openTickets: 3,
  totalTickets: 12,
  createdAt: '2026-09-01T10:00:00Z',
  archived: false,
  ...overrides,
})

const page = (items: CustomerSummary[], totalItems = items.length) => ({
  items,
  page: 0,
  size: 20,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
})

const metrics: CustomerMetrics = { total: 142, companies: 18, withOpenTickets: 21, newThisMonth: 12 }
const companies = ['Acme Studio', 'Northstar']

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/customers/metrics': { body: metrics },
  'GET /api/customers/companies': { body: companies },
}

function renderCustomers(path = '/clientes') {
  const router = createMemoryRouter(
    [
      { path: '/clientes', element: <CustomersPage /> },
      { path: '/clientes/nuevo', element: <p>Alta</p> },
    ],
    { initialEntries: [path] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CustomersPage', () => {
  it('muestra un esqueleto mientras carga', () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers': () => new Promise(() => {}) as never,
    })
    renderCustomers()
    expect(screen.getByText('Cargando clientes…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra cuatro métricas y la tabla con sus columnas', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()]) } })
    renderCustomers()
    const table = await screen.findByRole('table', { name: 'Clientes' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Cliente', 'Empresa', 'Correo', 'Tickets', 'Estado', 'Acciones'])
    expect(await screen.findByText('142')).toBeInTheDocument()
    expect(screen.getByText('Clientes activos')).toBeInTheDocument()
    expect(screen.getByText('Empresas')).toBeInTheDocument()
    expect(screen.getByText('Con tickets abiertos')).toBeInTheDocument()
    expect(screen.getAllByText('Nuevos este mes')).toHaveLength(1)
    expect(screen.getByText('Mostrando 1 resultado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo cliente/ })).toHaveAttribute('href', '/clientes/nuevo')
    expect(screen.queryByText(/Archivar/)).not.toBeInTheDocument()
  })

  it('sin clientes ofrece crear el primero', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([]) } })
    renderCustomers()
    expect(await screen.findByText('Todavía no hay clientes')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Nuevo cliente/ })
    expect(links).toHaveLength(2)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/clientes/nuevo'))
  })

  it('sin resultados ofrece limpiar los filtros y los quita', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers': (request) => {
        const url = new URL(request.url)
        return { body: url.searchParams.has('q') ? page([]) : page([customer()]) }
      },
    })
    const router = renderCustomers('/clientes?q=zzz&company=Northstar&archived=true&page=2')
    expect(await screen.findByText('No encontramos clientes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue('')
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.search).toBe('?page=0&size=20&sort=name%2Casc')
  })

  it('una página que ya no existe lleva a la primera', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers': (request) => ({
        body: new URL(request.url).searchParams.get('page') === '4' ? { ...page([]), page: 4 } : page([customer()]),
      }),
    })
    const router = renderCustomers('/clientes?page=5')
    await userEvent.click(await screen.findByRole('button', { name: 'Ir a la primera página' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('un error ofrece reintentar y recupera la lista', async () => {
    let fail = true
    mockApi({
      ...baseRoutes,
      'GET /api/customers': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: page([customer()]) },
    })
    renderCustomers()
    expect(await screen.findByText('No pudimos cargar los clientes')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
  })

  it('cambiar de empresa vuelve a la primera página y pide esa empresa', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()], 45) } })
    const router = renderCustomers('/clientes?page=3')
    await screen.findByRole('link', { name: 'María Pérez' })
    await screen.findByRole('option', { name: 'Northstar' })

    await userEvent.selectOptions(screen.getByLabelText('Empresa'), 'Northstar')
    await waitFor(() => expect(router.state.location.search).toBe('?company=Northstar'))
    await waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('company')).toBe('Northstar'),
    )
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('page')).toBe('0')
  })

  it('la búsqueda pasa a la URL y a la API volviendo a la primera página', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()], 45) } })
    const router = renderCustomers('/clientes?page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'ana')
    await waitFor(() => expect(router.state.location.search).toBe('?q=ana'))
    await waitFor(() => expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('q')).toBe('ana'))
  })

  it('cambiar el orden vuelve a la primera página', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()], 45) } })
    const router = renderCustomers('/clientes?page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'openTickets,desc')
    await waitFor(() => expect(router.state.location.search).toBe('?sort=openTickets%2Cdesc'))
  })

  it('con archived=true pide los archivados y los marca', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers': { body: page([customer({ archived: true, openTickets: 0 })]) },
    })
    renderCustomers('/clientes?archived=true')
    expect(await screen.findByText('Archivado')).toBeInTheDocument()
    expect(screen.queryByText('Activo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Estado: Archivados' })).toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('archived')).toBe('true')
  })

  it('elegir Archivados en el menú lo lleva a la URL', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()]) } })
    const router = renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archivados' }))
    await waitFor(() => expect(router.state.location.search).toBe('?archived=true'))
  })

  it('pagina con los controles de la lista', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()], 45) } })
    const router = renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(router.state.location.search).toBe('?page=2')
  })

  it('conserva una empresa de la URL que no está en la lista de empresas', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([customer()]) } })
    renderCustomers('/clientes?company=Cerrada')
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(screen.getByLabelText('Empresa')).toHaveValue('Cerrada')
  })

  it('un nombre y un correo muy largos no rompen la fila y siguen accesibles', async () => {
    const name = 'Ana García Fernández de la Fuente y Rodríguez de Santa Cruz'
    mockApi({
      ...baseRoutes,
      'GET /api/customers': { body: page([customer({ name, email: `${'a'.repeat(80)}@orbit.example` })]) },
    })
    renderCustomers()
    expect(await screen.findByRole('link', { name })).toHaveAttribute('title', name)
  })
})
