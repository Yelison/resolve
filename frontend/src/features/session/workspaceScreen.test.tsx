import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me, OrganizationRef } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { metrics } from '../../test/ticketFixtures'
import { releaseWrites } from './sessionLifecycle'
import { renderShell, setCsrfCookie } from './shellHarness'
import { orgA, orgB } from './workspaceFixtures'

/**
 * Cambiar de espacio, o crear uno, desde una pantalla que no es Inicio: la pantalla de la ruta anterior no puede
 * montarse otra vez en el espacio nuevo mientras llega la navegación (pediría, p. ej., el ticket 1046 del otro espacio).
 */
const inOrg = (org: OrganizationRef, all: OrganizationRef[]) =>
  ({
    ...adminMe,
    role: org.role,
    organization: { ...adminMe.organization, id: org.id, name: org.name },
    organizations: all,
    organizationCreation: { allowed: true, created: 1, limit: 3 },
  }) as Me

const meInAcme = inOrg(orgA, [orgA, orgB])
const newWorkspace: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000009',
  name: 'Lumen Diseño',
  role: 'admin',
  color: 'orange',
  memberCount: 1,
}
const meInNew = { ...inOrg(newWorkspace, [orgA, orgB, newWorkspace]) } as Me

const requestsTo = (spy: ReturnType<typeof mockApi>, fragment: string) =>
  spy.mock.calls.map(([input]) => input as Request).filter((request) => request.url.includes(fragment))

/** Una pantalla de ticket que cuenta cuántas veces se monta. */
function renderOnTicket() {
  let mounts = 0
  function Ticket() {
    useEffect(() => {
      mounts += 1
    }, [])
    return <h1>Ticket</h1>
  }
  const rendered = renderShell('/')
  const children = rendered.router.routes[0]!.children!
  children.find((route) => route.path === 'tickets/:number')!.element = <Ticket />
  return { ...rendered, mounts: () => mounts }
}

beforeEach(() => {
  sessionStorage.clear()
  setCsrfCookie('token-1')
})

afterEach(() => {
  releaseWrites()
  vi.restoreAllMocks()
  sessionStorage.clear()
  setCsrfCookie(null)
})

describe('pantalla de la ruta anterior al cambiar o crear un espacio', () => {
  it('cambiar de espacio desde un ticket monta el ticket una sola vez y no lo pide al espacio nuevo', async () => {
    const spy = mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/session/organization': { body: inOrg(orgB, [orgA, orgB]) },
    })
    const { router, mounts } = renderOnTicket()
    await router.navigate('/tickets/1046')
    await screen.findByRole('heading', { name: 'Ticket' })
    expect(mounts()).toBe(1)
    await userEvent.click(await screen.findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Northwind, Agente' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await screen.findByRole('heading', { name: 'Inicio' })
    expect(mounts()).toBe(1)
    expect(requestsTo(spy, '/api/tickets/1046')).toHaveLength(0)
  })

  it('crear un espacio desde un ticket, con las métricas tardando, monta el ticket una sola vez', async () => {
    const spy = mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': { status: 201, body: meInNew },
      'GET /api/tickets/metrics': async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        return { body: { ...metrics, gettingStarted: null } }
      },
    })
    const { router, mounts } = renderOnTicket()
    await router.navigate('/tickets/1046')
    await screen.findByRole('heading', { name: 'Ticket' })
    await userEvent.click(await screen.findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Crear espacio' }))
    const dialog = await screen.findByRole('dialog', { name: 'Crear espacio' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), 'Lumen Diseño')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    // Mientras las métricas tardan, la sesión del servidor ya es la nueva pero la pantalla no se ha tocado.
    await waitFor(() => expect(requestsTo(spy, '/api/tickets/metrics')).toHaveLength(1))
    expect(router.state.location.pathname).toBe('/tickets/1046')
    expect(mounts()).toBe(1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await screen.findByRole('heading', { name: 'Inicio' })
    expect(mounts()).toBe(1)
    expect(requestsTo(spy, '/api/tickets/1046')).toHaveLength(0)
  })
})
