import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomerCompanyGroup, CustomerMetrics, CustomerSummary } from '../../domain/customer'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { CustomersPage } from './CustomersPage'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const customer = (overrides: Partial<CustomerSummary> = {}): CustomerSummary => ({
  id: 'c-maria',
  name: 'María Pérez',
  email: 'maria@cliente.example',
  company: 'Lumen Diseño',
  openTickets: 3,
  totalTickets: 12,
  createdAt: '2026-09-01T10:00:00Z',
  archived: false,
  lastTicket: { number: 1048, subject: 'No puedo acceder a mi cuenta', status: 'open', updatedAt: minutesAgo(5) },
  ...overrides,
})

/** Página de clientes (la lista plana, de 20 en 20). */
const page = (items: CustomerSummary[], totalItems = items.length) => ({
  items,
  page: 0,
  size: 20,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
})

/** Una empresa del servidor: con `customerCount` mayor que los clientes que trae, quedan más tras «Ver los N…». */
const group = (
  company: string | null,
  customers: CustomerSummary[],
  overrides: Partial<CustomerCompanyGroup> = {},
): CustomerCompanyGroup => ({
  company,
  customerCount: customers.length,
  openTickets: customers.reduce((sum, member) => sum + member.openTickets, 0),
  customers,
  ...overrides,
})

/** Página de empresas (la lista agrupada, de 8 en 8). */
const groupsPage = (groups: CustomerCompanyGroup[], totalItems = groups.length, pageNumber = 0) => ({
  items: groups,
  page: pageNumber,
  size: 8,
  totalItems,
  totalPages: Math.ceil(totalItems / 8),
})

const metrics: CustomerMetrics = { total: 142, companies: 18, withOpenTickets: 21, newThisMonth: 12 }
const summary = '142 clientes de 18 empresas · 21 con tickets abiertos · 12 nuevos este mes'
const companies = ['Lumen Diseño', 'Northstar']

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/customers/metrics': { body: metrics },
  'GET /api/customers/companies': { body: companies },
}

/** La lista agrupada por defecto y la plana, con el mismo cliente. */
const oneCustomer = () => ({
  'GET /api/customers/by-company': { body: groupsPage([group('Lumen Diseño', [customer()])]) },
  'GET /api/customers': { body: page([customer()]) },
})

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

const byCompany = '/api/customers/by-company'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CustomersPage', () => {
  it('muestra un esqueleto mientras carga', () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': () => new Promise(() => {}) as never,
    })
    renderCustomers()
    expect(screen.getByText('Cargando clientes…')).toBeInTheDocument()
    expect(screen.getByText('Cargando el resumen…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('el anuncio de resultados concuerda en singular: «1 empresa» agrupado', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    renderCustomers()
    await screen.findByText(summary)
    await waitFor(() => expect(screen.getAllByRole('status').map((node) => node.textContent)).toContain('1 empresa'))
  })

  it('el anuncio de resultados concuerda en singular: «1 cliente» en la lista plana', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    renderCustomers('/clientes?group=none')
    await screen.findByText(summary)
    await waitFor(() => expect(screen.getAllByRole('status').map((node) => node.textContent)).toContain('1 cliente'))
  })

  it('resume la cartera bajo el título y no dibuja métricas ni tabla', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    renderCustomers()
    expect(await screen.findByText(summary)).toBeInTheDocument()
    expect(screen.queryByText('Clientes activos')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Métricas de clientes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo cliente/ })).toHaveAttribute('href', '/clientes/nuevo')
    expect(screen.queryByText(/Archivar/)).not.toBeInTheDocument()
  })

  it('una tarjeta por empresa con su resumen y una fila por cliente, y «Sin empresa» donde la deja el servidor', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([
          group('Lumen Diseño', [
            customer(),
            customer({ id: 'c-ana', name: 'Ana Acme', email: 'ana@acme.example', openTickets: 0 }),
          ]),
          group('Northstar', [
            customer({
              id: 'c-carlos',
              name: 'Carlos Ruiz',
              email: 'carlos@northstar.example',
              company: 'Northstar',
              openTickets: 1,
              lastTicket: { number: 1047, subject: 'Error al pagar', status: 'in_progress', updatedAt: minutesAgo(12) },
            }),
          ]),
          group(null, [
            customer({ id: 'c-sin', name: 'Zoe Sin Empresa', email: 'zoe@x.example', company: null, openTickets: 0 }),
          ]),
        ]),
      },
    })
    renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Lumen Diseño',
      'Northstar',
      'Sin empresa',
    ])

    const acme = screen.getByRole('region', { name: 'Lumen Diseño' })
    expect(within(acme).getByText('2 clientes · 3 tickets abiertos')).toBeInTheDocument()
    expect(within(acme).getAllByRole('listitem')).toHaveLength(2)
    expect(within(acme).queryByRole('link', { name: /Ver los/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Northstar' })).toHaveTextContent('1 cliente · 1 ticket abierto')
    expect(screen.getByRole('region', { name: 'Sin empresa' })).toHaveTextContent('1 cliente · sin tickets abiertos')

    const maria = within(acme).getByRole('link', { name: 'María Pérez' }).closest('li')!
    expect(within(maria).getByText('maria@cliente.example')).toBeInTheDocument()
    expect(within(maria).getByText('Última conversación')).toBeInTheDocument()
    expect(within(maria).getByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })).toHaveAttribute(
      'href',
      '/tickets/1048',
    )
    expect(within(maria).getByText('hace 5 minutos')).toHaveAttribute('datetime')
    expect(within(maria).getByText('3 abiertos')).toBeInTheDocument()
    expect(within(acme).getByText('Sin abiertos')).toBeInTheDocument()
    expect(screen.getByText('1 abierto')).toBeInTheDocument()
  })

  it('un cliente sin tickets dice que no hay conversaciones', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([group('Lumen Diseño', [customer({ openTickets: 0, totalTickets: 0, lastTicket: null })])]),
      },
    })
    renderCustomers()
    expect(await screen.findByText('Sin conversaciones todavía')).toBeInTheDocument()
    expect(screen.getByText('Sin abiertos')).toBeInTheDocument()
  })

  it('la lista agrupada pide 8 empresas por página y la pagina por empresas', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': { body: groupsPage([group('Lumen Diseño', [customer()])], 38) },
    })
    const router = renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(requestsTo(fetchSpy, byCompany).at(-1)?.search).toBe('?page=0&size=8&sort=name%2Casc')
    expect(screen.getByText('1–8 de 38 empresas')).toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/customers')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(router.state.location.search).toBe('?page=2')
    await waitFor(() => expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('page')).toBe('1'))
  })

  it('«Ver los N clientes de …» abre la empresa entera en la misma página, con su chip y la vuelta', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([
          group('Lumen Diseño', [customer(), customer({ id: 'c-2', name: 'Bea', email: 'bea@acme.example' })], {
            customerCount: 14,
            openTickets: 9,
          }),
          group('Northstar', [customer({ id: 'c-n', name: 'Carlos', email: 'c@n.example', company: 'Northstar' })]),
        ]),
      },
      'GET /api/customers': {
        body: page(
          Array.from({ length: 14 }, (_, index) =>
            customer({ id: `c-${index}`, name: `Cliente ${index}`, email: `c${index}@acme.example` }),
          ),
        ),
      },
    })
    const router = renderCustomers('/clientes?q=a&archived=true&sort=createdAt%2Cdesc&page=2')
    const link = await screen.findByRole('link', { name: 'Ver los 14 clientes de Lumen Diseño' })
    expect(screen.queryByRole('link', { name: /Ver los .* de Northstar/ })).not.toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/clientes?q=a&company=Lumen+Dise%C3%B1o&archived=true&sort=createdAt%2Cdesc')

    await userEvent.click(link)
    expect(router.state.location.pathname).toBe('/clientes')
    expect(router.state.location.search).toBe('?q=a&company=Lumen+Dise%C3%B1o&archived=true&sort=createdAt%2Cdesc')
    expect(await screen.findByRole('link', { name: 'Cliente 13' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lista de clientes' })).toHaveFocus()
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.search).toBe(
      '?q=a&company=Lumen%20Dise%C3%B1o&archived=true&page=0&size=20&sort=createdAt%2Cdesc',
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Lumen Diseño' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lumen Diseño' })).toHaveTextContent('14 clientes')
    expect(screen.queryByRole('heading', { name: 'Northstar' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Quitar el filtro Empresa del cliente: Lumen Diseño' }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: '← Volver a todas las empresas' }))
    expect(router.state.location.search).toBe('?q=a&archived=true&sort=createdAt%2Cdesc')
    expect(await screen.findByRole('heading', { level: 2, name: 'Northstar' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lista de clientes' })).toHaveFocus()
  })

  it('quitar el chip de la empresa vuelve a todas las empresas', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers('/clientes?company=Lumen+Dise%C3%B1o&page=3')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Quitar el filtro Empresa del cliente: Lumen Diseño' }),
    )
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('1–1 de 1 empresa')).toBeInTheDocument()
    // El chip desaparece al quitarlo: el foco pasa a la lista, no a `body`.
    expect(screen.getByRole('region', { name: 'Lista de clientes' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /Quitar el filtro/ })).not.toBeInTheDocument()
  })

  it('los clientes sin empresa también se abren enteros', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([
          group(null, [customer({ id: 'c-s', name: 'Zoe', email: 'z@x.example', company: null })], {
            customerCount: 5,
          }),
        ]),
      },
      'GET /api/customers': { body: page([customer({ id: 'c-s', name: 'Zoe', email: 'z@x.example', company: null })]) },
    })
    const router = renderCustomers()
    await userEvent.click(await screen.findByRole('link', { name: 'Ver los 5 clientes sin empresa' }))
    expect(router.state.location.search).toBe('?withoutCompany=true')
    await screen.findByRole('button', { name: 'Quitar el filtro Empresa del cliente: Sin empresa' })
    await waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('withoutCompany')).toBe('true'),
    )
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.has('company')).toBe(false)
    expect(screen.getByRole('heading', { level: 2, name: 'Sin empresa' })).toBeInTheDocument()
  })

  it('un nombre de empresa muy largo envuelve en la cabecera y en el enlace', async () => {
    const company = 'Asociación Colombiana de Distribuidores de Repuestos Agrícolas del Valle del Cauca'
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([group(company, [customer({ company })], { customerCount: 9 })]),
      },
    })
    renderCustomers()
    expect(await screen.findByRole('heading', { level: 2, name: company })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Ver los 9 clientes de ${company}` })).toBeInTheDocument()
  })

  it('«Sin agrupar» pide la lista plana de 20 en 20 con la empresa en cada fila y vuelve a la primera página', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      ...oneCustomer(),
      'GET /api/customers': {
        body: page([customer(), customer({ id: 'c-sin', name: 'Zoe', email: 'zoe@x.example', company: null })], 45),
      },
    })
    const router = renderCustomers('/clientes?page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)

    await userEvent.selectOptions(screen.getByLabelText('Agrupar'), 'none')
    // Página 2 de empresas no es página 2 de clientes: se vuelve a la primera.
    await waitFor(() => expect(router.state.location.search).toBe('?group=none'))
    await screen.findByRole('link', { name: 'Zoe' })
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Clientes' })).toHaveTextContent('Lumen Diseño')
    expect(screen.getByRole('group', { name: 'Clientes' })).toHaveTextContent('Sin empresa')
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.search).toBe('?page=0&size=20&sort=name%2Casc')
    expect(screen.getByText('1–20 de 45 resultados')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Agrupar'), 'company')
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByRole('heading', { level: 2, name: 'Lumen Diseño' })).toBeInTheDocument()
  })

  it('cada vista pide solo su lista: la plana no pide empresas y la agrupada no pide la plana', async () => {
    const flat = mockApi({ ...baseRoutes, ...oneCustomer() })
    renderCustomers('/clientes?group=none')
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(requestsTo(flat, byCompany)).toHaveLength(0)
    expect(requestsTo(flat, '/api/customers')).toHaveLength(1)
  })

  it('la agrupación no cuenta como filtro: sin clientes no ofrece limpiar solo por ella', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers': { body: page([]) } })
    renderCustomers('/clientes?group=none')
    expect(await screen.findByText('Todavía no hay clientes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('un agente ve «Nuevo cliente» y ninguna acción de archivar', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/me': { body: { ...adminMe, role: 'agent' } },
      ...oneCustomer(),
    })
    renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(screen.getByRole('link', { name: /Nuevo cliente/ })).toBeInTheDocument()
    expect(screen.queryByText(/Archivar|Restaurar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
  })

  it('sin clientes ofrece crear el primero', async () => {
    mockApi({ ...baseRoutes, 'GET /api/customers/by-company': { body: groupsPage([]) } })
    renderCustomers()
    expect(await screen.findByText('Todavía no hay clientes')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Nuevo cliente/ })
    expect(links).toHaveLength(2)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/clientes/nuevo'))
  })

  it('sin resultados ofrece limpiar los filtros y los quita', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers': { body: page([]) },
      'GET /api/customers/by-company': (request) => {
        const url = new URL(request.url)
        return { body: url.searchParams.has('q') ? groupsPage([]) : groupsPage([group('Lumen Diseño', [customer()])]) }
      },
    })
    const router = renderCustomers('/clientes?q=zzz&archived=true&page=2')
    expect(await screen.findByText('No encontramos clientes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue('')
    expect(requestsTo(fetchSpy, byCompany).at(-1)?.search).toBe('?page=0&size=8&sort=name%2Casc')
  })

  it('una empresa sin clientes (filtro de la URL) ofrece limpiar y vuelve a todas', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers': { body: page([]) },
      'GET /api/customers/by-company': { body: groupsPage([group('Lumen Diseño', [customer()])]) },
    })
    const router = renderCustomers('/clientes?company=Cerrada')
    expect(await screen.findByText('No encontramos clientes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('una página de empresas que ya no existe lleva a la primera', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': (request) => ({
        body:
          new URL(request.url).searchParams.get('page') === '4'
            ? groupsPage([], 3, 4)
            : groupsPage([group('Lumen Diseño', [customer()])]),
      }),
    })
    const router = renderCustomers('/clientes?page=5')
    expect(await screen.findByText('Hay menos empresas que antes.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('una página fuera de rango con filtros conserva los filtros al volver a la primera', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': (request) => ({
        body:
          new URL(request.url).searchParams.get('page') === '4'
            ? groupsPage([], 3, 4)
            : groupsPage([group('Lumen Diseño', [customer()])]),
      }),
    })
    const router = renderCustomers('/clientes?q=ana&page=5')
    expect(await screen.findByText('Esta página ya no existe')).toBeInTheDocument()
    expect(screen.queryByText('No encontramos clientes')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=ana')
    expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('q')).toBe('ana')
  })

  it('un error en el resumen lo dice y permite reintentar sin mover la lista', async () => {
    let fail = true
    mockApi({
      ...baseRoutes,
      'GET /api/customers/metrics': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: metrics },
      ...oneCustomer(),
    })
    renderCustomers()
    expect(await screen.findByText(/No pudimos cargar el resumen/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar el resumen' }))
    expect(await screen.findByText(summary)).toBeInTheDocument()
    expect(screen.queryByText(/No pudimos cargar el resumen/)).not.toBeInTheDocument()
    // El botón desaparece: el foco pasa al resumen, no a `body`.
    expect(screen.getByText(summary)).toHaveFocus()
  })

  it('un reintento del resumen que vuelve a fallar deja el foco en el botón', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/metrics': { status: 500, body: { status: 500, title: 'Error' } },
      ...oneCustomer(),
    })
    renderCustomers()
    const retry = await screen.findByRole('button', { name: 'Reintentar cargar el resumen' })
    await userEvent.click(retry)
    await vi.waitFor(() => expect(requestsTo(fetchSpy, '/api/customers/metrics').length).toBeGreaterThan(1))
    expect(screen.getByRole('button', { name: 'Reintentar cargar el resumen' })).toHaveFocus()
  })

  it('un error en las empresas lo dice junto al filtro y permite reintentar', async () => {
    let fail = true
    mockApi({
      ...baseRoutes,
      'GET /api/customers/companies': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: companies },
      ...oneCustomer(),
    })
    renderCustomers()
    expect(await screen.findByText(/No pudimos cargar las empresas/)).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar las empresas' }))
    expect(await screen.findByRole('option', { name: 'Northstar' })).toBeInTheDocument()
    expect(screen.queryByText(/No pudimos cargar las empresas/)).not.toBeInTheDocument()
    // El botón desaparece: el foco pasa al filtro de empresa, no a `body`.
    expect(screen.getByRole('combobox', { name: 'Empresa del cliente' })).toHaveFocus()
  })

  it('un error ofrece reintentar, recupera la lista y lleva el foco a ella', async () => {
    let fail = true
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': () =>
        fail
          ? { status: 500, body: { status: 500, title: 'Error' } }
          : { body: groupsPage([group('Lumen Diseño', [customer()])]) },
    })
    renderCustomers()
    expect(await screen.findByText('No pudimos cargar los clientes')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar los clientes' }))
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    // El botón desaparece: el foco pasa a la lista, no a `body`.
    expect(screen.getByRole('region', { name: 'Lista de clientes' })).toHaveFocus()
  })

  it('un error en la lista no oculta el resumen ni los filtros', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': { status: 500, body: { status: 500, title: 'Error' } },
    })
    renderCustomers()
    expect(await screen.findByText('No pudimos cargar los clientes')).toBeInTheDocument()
    expect(screen.getByText(summary)).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toBeInTheDocument()
  })

  it('un 403 en la lista dice que no hay acceso, sin ofrecer reintentar', async () => {
    mockApi({
      ...baseRoutes,
      'GET /api/customers/metrics': { status: 403, body: { status: 403, title: 'Prohibido' } },
      'GET /api/customers/by-company': { status: 403, body: { status: 403, title: 'Prohibido' } },
    })
    renderCustomers()
    expect(await screen.findByText('No tienes acceso a los clientes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })

  it('elegir una empresa en el filtro abre su lista entera desde la primera página', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers('/clientes?page=3')
    await screen.findByRole('link', { name: 'María Pérez' })
    await screen.findByRole('option', { name: 'Northstar' })

    await userEvent.selectOptions(screen.getByLabelText('Empresa del cliente'), 'Northstar')
    await waitFor(() => expect(router.state.location.search).toBe('?company=Northstar'))
    await waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('company')).toBe('Northstar'),
    )
    expect(requestsTo(fetchSpy, '/api/customers').at(-1)?.searchParams.get('page')).toBe('0')

    await userEvent.selectOptions(screen.getByLabelText('Empresa del cliente'), 'Sin empresa')
    await waitFor(() => expect(router.state.location.search).toBe('?withoutCompany=true'))
  })

  it('la búsqueda pasa a la URL y a la API volviendo a la primera página', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers('/clientes?page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'ana')
    await waitFor(() => expect(router.state.location.search).toBe('?q=ana'))
    await waitFor(() => expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('q')).toBe('ana'))
    expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('page')).toBe('0')
  })

  it('cambiar el orden vuelve a la primera página y lo aplica dentro de cada empresa', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers('/clientes?page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'openTickets,desc')
    await waitFor(() => expect(router.state.location.search).toBe('?sort=openTickets%2Cdesc'))
    await waitFor(() =>
      expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('sort')).toBe('openTickets,desc'),
    )
  })

  it('con archived=true pide los archivados', async () => {
    const fetchSpy = mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([group('Lumen Diseño', [customer({ archived: true, openTickets: 0 })])]),
      },
    })
    renderCustomers('/clientes?archived=true')
    expect(await screen.findByRole('link', { name: 'María Pérez' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Estado: Archivados' })).toBeInTheDocument()
    expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.get('archived')).toBe('true')
  })

  it('elegir Archivados en el menú lo lleva a la URL', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers()
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archivados' }))
    await waitFor(() => expect(router.state.location.search).toBe('?archived=true'))
  })

  it('volver a Activos quita archived de la URL y de la petición', async () => {
    const fetchSpy = mockApi({ ...baseRoutes, ...oneCustomer() })
    const router = renderCustomers('/clientes?archived=true&page=2')
    await screen.findByRole('link', { name: 'María Pérez' })
    await userEvent.click(screen.getByRole('button', { name: 'Estado: Archivados' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Activos' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() => expect(requestsTo(fetchSpy, byCompany).at(-1)?.searchParams.has('archived')).toBe(false))
  })

  it('conserva una empresa de la URL que no está en la lista de empresas', async () => {
    mockApi({ ...baseRoutes, ...oneCustomer() })
    renderCustomers('/clientes?company=Cerrada')
    await screen.findByRole('link', { name: 'María Pérez' })
    expect(screen.getByLabelText('Empresa del cliente')).toHaveValue('Cerrada')
  })

  it('un nombre y un correo muy largos no rompen la fila y siguen accesibles', async () => {
    const name = 'Ana García Fernández de la Fuente y Rodríguez de Santa Cruz'
    mockApi({
      ...baseRoutes,
      'GET /api/customers/by-company': {
        body: groupsPage([group('Lumen Diseño', [customer({ name, email: `${'a'.repeat(80)}@orbit.example` })])]),
      },
    })
    renderCustomers()
    expect(await screen.findByRole('link', { name })).toHaveAttribute('href', '/clientes/c-maria')
    expect(screen.getByText(/^a{80}@orbit\.example$/)).toBeInTheDocument()
  })
})
