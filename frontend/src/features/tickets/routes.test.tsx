import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { page, summary, ticket } from '../../test/ticketFixtures'
import { appRoutes } from '../../app/router'

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
})
