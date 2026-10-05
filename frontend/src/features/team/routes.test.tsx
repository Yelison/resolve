import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { customerMe, mockApi } from '../../test/api'
import { renderApp, requestedPaths, staffMes } from '../../test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rutas de la aplicación', () => {
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
