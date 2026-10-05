import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { appRoutes } from '../../app/router'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

describe('rutas de la aplicación', () => {
  const staffMes = [
    ['admin', adminMe],
    ['agent', { ...adminMe, role: 'agent' }],
  ] as const

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
})
