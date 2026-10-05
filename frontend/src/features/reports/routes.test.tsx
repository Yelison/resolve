import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { reportSummary } from './reportFixtures'
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

  it.each(staffMes)('deja al personal abrir los reportes como %s', async (_role, me) => {
    mockApi({
      'GET /api/me': { body: me },
      'GET /api/reports/summary': { body: reportSummary() },
    })
    renderApp('/reportes')
    expect(await screen.findByRole('heading', { level: 1, name: 'Reportes' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Rendimiento por agente' })).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
  })

  it('un cliente no abre /reportes y no se pide el informe', async () => {
    const spy = mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/reportes')
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
    expect(spy.mock.calls.some(([input]) => new URL((input as Request).url).pathname.startsWith('/api/reports'))).toBe(
      false,
    )
  })
})
