import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../test/api'
import { renderWithProviders } from '../test/render'
import { mainNavigation } from './navigation'
import { appRoutes } from './router'

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it.each(staffSections.flatMap((item) => staffMes.map(([role, me]) => [item.to, item.label, role, me] as const)))(
    'deja al personal abrir %s («%s») como %s',
    async (path, label, _role, me) => {
      mockApi({ 'GET /api/me': { body: me } })
      renderApp(path)
      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Vista en construcción' })).toBeInTheDocument()
      expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    },
  )

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
