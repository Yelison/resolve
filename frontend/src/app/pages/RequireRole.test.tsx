import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { IndexRedirect, RequireRole } from './RequireRole'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderGuard() {
  renderWithProviders(
    <RequireRole roles={['admin', 'agent']}>
      <h1>Contenido del equipo</h1>
    </RequireRole>,
  )
}

describe('RequireRole', () => {
  it('muestra el aviso de sin acceso a un cliente', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderGuard()
    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Contenido del equipo' })).not.toBeInTheDocument()
  })

  it('muestra el contenido a un rol permitido', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderGuard()
    expect(await screen.findByRole('heading', { name: 'Contenido del equipo' })).toBeInTheDocument()
  })

  it('muestra un esqueleto mientras carga la sesión', () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderGuard()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('IndexRedirect', () => {
  function renderIndex() {
    const router = createMemoryRouter(
      [
        { path: '/', element: <IndexRedirect fallback={<h1>Resumen</h1>} /> },
        { path: '/tickets', element: <h1>Tickets</h1> },
      ],
      { initialEntries: ['/'] },
    )
    renderWithProviders(<RouterProvider router={router} />)
    return router
  }

  it('lleva a un cliente a /tickets', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    const router = renderIndex()
    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
  })

  it('deja al personal en el resumen', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    const router = renderIndex()
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
