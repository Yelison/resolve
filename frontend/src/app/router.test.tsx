import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../test/api'
import { metrics, page } from '../test/ticketFixtures'
import { reportSummary } from '../features/reports/reportFixtures'
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
      'GET /api/tickets/metrics': { body: { ...metrics, views: { ...metrics.views, mine: 0 } } },
      'GET /api/reports/summary': { body: reportSummary({ byDay: [] }) },
      'GET /api/tickets/activity': { body: [] },
      'GET /api/knowledge/articles': { body: { items: [], page: 0, size: 3, totalItems: 0, totalPages: 0 } },
      'GET /api/tickets': { body: page([]) },
    })
    const router = renderApp('/')
    // El título de la página de inicio es el saludo con el nombre; «Inicio» queda en el menú y en las migas.
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Buen(os días|as tardes|as noches), Yelisson$/ }),
    ).toBeInTheDocument()
    // «Inicio» es el nombre de la sección en el menú y las migas, y el título de la pestaña.
    await vi.waitFor(() => expect(document.title).toBe('Inicio · Resolve'))
    expect(await screen.findByText('Nada pendiente')).toBeInTheDocument()
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
    },
  )

  it('cubre todas las secciones de personal', () => {
    expect(staffSections.map((item) => item.to)).toEqual(['/clientes', '/equipo', '/reportes'])
  })
})
