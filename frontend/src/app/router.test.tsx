import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../test/api'
import { metrics, page } from '../test/ticketFixtures'
import { mainNavigation } from './navigation'
import { renderApp } from '../test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rutas de la aplicación', () => {
  it('lleva a un cliente de / a /tickets', async () => {
    mockApi({ 'GET /api/me': { body: customerMe }, 'GET /api/tickets': { body: { items: [], page: 0, size: 20 } } })
    const router = renderApp('/')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
  })

  it('no redirige al personal desde /', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/reports/summary': { body: { byDay: [] } },
      'GET /api/tickets/activity': { body: [] },
      'GET /api/tickets': { body: page([]) },
    })
    const router = renderApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument()
    expect(await screen.findByText('Nada pendiente')).toBeInTheDocument()
    expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

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

  it('cubre todas las secciones de personal', () => {
    expect(staffSections.map((item) => item.to)).toEqual(['/clientes', '/equipo', '/reportes'])
  })
})
