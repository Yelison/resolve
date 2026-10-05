import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
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
  const staffMes = [
    ['admin', adminMe],
    ['agent', { ...adminMe, role: 'agent' }],
  ] as const

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
})
