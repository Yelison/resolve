import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../../app/router'
import type { Me, OrganizationRef } from '../../api/schema'
import { PROBLEM_TYPES } from '../../api/client'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { releaseWrites } from '../session/sessionLifecycle'
import { SESSION_TAB_ID } from '../session/sessionChannel'
import { FakeChannel, setCsrfCookie } from '../session/shellHarness'
import { orgA, orgB, orgC } from '../session/workspaceFixtures'
import { memberKeys } from '../team/queries'
import { teamMember } from '../team/teamFixtures'
import { mockViewport } from './viewportTesting'

const lumen: OrganizationRef = { ...orgB, name: 'Lumen Diseño', memberCount: 6 }
const kora: OrganizationRef = {
  ...orgA,
  id: '0192f000-0000-7000-8000-000000000004',
  name: 'Kora Fitness',
  memberCount: 3,
}

const meIn = (current: OrganizationRef, all: OrganizationRef[]): Me =>
  ({
    ...adminMe,
    role: current.role,
    customerId: current.role === 'customer' ? 'c-maria' : null,
    organization: { ...adminMe.organization, id: current.id, name: current.name },
    organizations: all,
  }) as Me

const acmeMe = meIn(orgA, [orgA, lumen, orgC, kora])

function renderSpaces(path = '/configuracion/espacios') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const rendered = renderWithProviders(<RouterProvider router={router} />)
  return { router, ...rendered }
}

const lastAdmin = { status: 409, body: { status: 409, type: PROBLEM_TYPES.lastAdmin, title: 'Conflicto' } }
const lastOrganization = {
  status: 409,
  body: { status: 409, type: PROBLEM_TYPES.lastOrganization, title: 'Conflicto' },
}
const requestsTo = (spy: ReturnType<typeof mockApi>, method: string, pathname: string) =>
  spy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === method && new URL(request.url).pathname === pathname)

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

describe('Configuración › Tus espacios · escritorio', () => {
  beforeEach(() => {
    mockViewport(1440)
  })

  it('aparece en «Tu cuenta», después de General, y lista cada espacio con tu rol y cuántas personas hay', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    const nav = await screen.findByRole('navigation', { name: 'Secciones de configuración' })
    await within(nav).findByRole('link', { name: /Tus espacios/ })
    const account = within(nav).getByRole('list', { name: 'Tu cuenta' })
    expect(
      within(account)
        .getAllByRole('link')
        .map((link) => link.querySelector('span')?.textContent),
    ).toEqual(['General', 'Tus espacios'])
    expect(await screen.findByRole('heading', { level: 2, name: 'Tus espacios' })).toBeInTheDocument()
    const rows = screen
      .getAllByRole('listitem')
      .filter((item) => item.closest('section[aria-labelledby="workspaces-heading"]'))
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Acme Studio'),
      expect.stringContaining('Lumen Diseño'),
      expect.stringContaining('Norte Viajes'),
      expect.stringContaining('Kora Fitness'),
    ])
    expect(rows[0]).toHaveTextContent('Administrador · 4 personas')
    expect(rows[1]).toHaveTextContent('Agente · 6 personas')
    expect(rows[2]).toHaveTextContent('Soporte de Norte Viajes')
    expect(rows[3]).toHaveTextContent('Administrador · 3 personas')
  })

  it('el actual dice «Estás aquí», los demás «Abrir», y el espacio de cliente no tiene «Salir»', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    await screen.findByRole('heading', { level: 2, name: 'Tus espacios' })
    expect(screen.getByText('Estás aquí')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir Acme Studio' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir Lumen Diseño' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir Norte Viajes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir de Acme Studio' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Salir de Lumen Diseño' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Salir de Norte Viajes' })).not.toBeInTheDocument()
  })

  it('«Abrir» cambia de espacio como el selector: pide el cambio y vuelve a Inicio', async () => {
    const spy = mockApi({
      'GET /api/me': { body: acmeMe },
      'POST /api/session/organization': { body: meIn(lumen, [orgA, lumen, orgC, kora]) },
    })
    const { router } = renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir Lumen Diseño' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await expect(requestsTo(spy, 'POST', '/api/session/organization')[0]!.clone().json()).resolves.toEqual({
      organizationId: lumen.id,
    })
  })

  it('con un solo espacio «Salir» está deshabilitado y dice «Es tu único espacio»', async () => {
    mockApi({ 'GET /api/me': { body: meIn(orgA, [orgA]) } })
    renderSpaces()
    const leave = await screen.findByRole('button', { name: 'Salir de Acme Studio' })
    expect(leave).toBeDisabled()
    expect(leave).toHaveAccessibleDescription('Es tu único espacio')
    expect(screen.getByText('Es tu único espacio')).toBeVisible()
  })

  it('un cliente no tiene la sección: la ruta da el estado sin permisos y no está en la navegación', async () => {
    mockApi({
      'GET /api/me': {
        body: { ...customerMe, organizations: [{ ...orgC, id: customerMe.organization.id, name: 'Acme Studio' }] },
      },
    })
    renderSpaces()
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Secciones de configuración' })
    expect(within(nav).queryByRole('link', { name: /Tus espacios/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Tus espacios' })).not.toBeInTheDocument()
  })

  it('mientras /me carga no hay filas ni acciones: solo un esqueleto', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderSpaces()
    expect(await screen.findByText('Cargando tus espacios…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salir/ })).not.toBeInTheDocument()
  })
})

describe('Configuración › Tus espacios · salir (escritorio)', () => {
  beforeEach(() => {
    mockViewport(1440)
  })

  it('la confirmación nombra el espacio, no sale hasta confirmar y, de otro espacio, no inventa una cifra', async () => {
    const meAfter = meIn(orgA, [orgA, orgC, kora])
    let left = false
    const spy = mockApi({
      'GET /api/me': () => ({ body: left ? meAfter : acmeMe }),
      [`DELETE /api/me/organizations/${lumen.id}`]: () => {
        left = true
        return { status: 204 }
      },
    })
    const { queryClient } = renderSpaces()
    // El equipo cargado es el del espacio actual: su cifra no es la de otro espacio.
    queryClient.setQueryData(memberKeys.list(), [
      teamMember({ id: adminMe.user.id, name: 'Yelisson Ortiz', role: 'admin', openTickets: 4 }),
    ])
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    expect(
      within(dialog).getByText('Tus respuestas y notas se quedan en el historial con tu nombre.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Los tickets que tengas asignados quedarán sin asignar.')).toBeInTheDocument()
    expect(within(dialog).getByText('Para volver, un administrador tendrá que invitarte.')).toBeInTheDocument()
    expect(requestsTo(spy, 'DELETE', `/api/me/organizations/${lumen.id}`)).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    const region = await screen.findByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Saliste de Lumen Diseño')).toBeInTheDocument()
    const sent = requestsTo(spy, 'DELETE', `/api/me/organizations/${lumen.id}`)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers.get('X-XSRF-TOKEN')).toBe('token-1')
    // La lista se actualiza sin recargar y el foco queda en el título, no en `body`.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir Lumen Diseño' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toHaveFocus())
  })

  it('del espacio actual, con el equipo ya cargado, dice cuántos tickets quedan sin asignar y la app vuelve a cargar /me', async () => {
    const meAfter = meIn(lumen, [lumen, orgC, kora])
    let left = false
    const spy = mockApi({
      'GET /api/me': () => ({ body: left ? meAfter : acmeMe }),
      [`DELETE /api/me/organizations/${orgA.id}`]: () => {
        left = true
        return { status: 204 }
      },
    })
    const { router, queryClient } = renderSpaces()
    queryClient.setQueryData(memberKeys.list(), [
      teamMember({ id: adminMe.user.id, name: 'Yelisson Ortiz', role: 'admin', openTickets: 4 }),
    ])
    sessionStorage.setItem('resolve-draft-1046', 'Borrador')
    queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de Acme' })
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Acme Studio' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Acme Studio?' })
    expect(within(dialog).getByText('Tus 4 tickets asignados quedarán sin asignar.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('button', { name: 'Espacio: Lumen Diseño. Cambiar de espacio' })).toBeInTheDocument()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    // La caché del espacio que se deja no pasa al siguiente.
    expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeUndefined()
    expect(requestsTo(spy, 'DELETE', `/api/me/organizations/${orgA.id}`)).toHaveLength(1)
    expect(document.body).not.toHaveFocus()
  })

  it('salir del espacio actual avisa a las demás pestañas y no se trata como un cambio hecho en otra', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const received: string[] = []
    const remote = new FakeChannel('resolve-session')
    remote.onmessage = (event) =>
      received.push(`${(event.data as { type: string }).type}:${(event.data as { tab: string }).tab}`)
    let left = false
    mockApi({
      'GET /api/me': () => ({ body: left ? meIn(lumen, [lumen, orgC, kora]) : acmeMe }),
      [`DELETE /api/me/organizations/${orgA.id}`]: () => {
        left = true
        return { status: 204 }
      },
    })
    const { router } = renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Acme Studio' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir del espacio' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(received).toContain(`organization-changed:${SESSION_TAB_ID}`)
    const region = await screen.findByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Saliste de Acme Studio')).toBeInTheDocument()
    expect(within(region).queryByText(/en otra pestaña/)).not.toBeInTheDocument()
    remote.close()
    vi.unstubAllGlobals()
  })

  it('con un solo ticket la frase va en singular y sin ninguno lo dice', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    const { queryClient } = renderSpaces()
    queryClient.setQueryData(memberKeys.list(), [teamMember({ id: adminMe.user.id, role: 'admin', openTickets: 1 })])
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Acme Studio' }))
    expect(await screen.findByText('Tu ticket asignado quedará sin asignar.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    queryClient.setQueryData(memberKeys.list(), [teamMember({ id: adminMe.user.id, role: 'admin', openTickets: 0 })])
    await userEvent.click(screen.getByRole('button', { name: 'Salir de Acme Studio' }))
    expect(await screen.findByText('No tienes tickets asignados en este espacio.')).toBeInTheDocument()
  })

  it('cancelar no sale y devuelve el foco al botón «Salir»', async () => {
    const spy = mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    const leave = await screen.findByRole('button', { name: 'Salir de Lumen Diseño' })
    await userEvent.click(leave)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(leave).toHaveFocus()
    expect(spy.mock.calls.some(([input]) => (input as Request).method === 'DELETE')).toBe(false)
  })

  it('el último administrador (409 last-admin) ve «No puedes salir de …» con «Ir a Equipo», y el espacio sigue en la lista', async () => {
    mockApi({
      'GET /api/me': { body: acmeMe },
      [`DELETE /api/me/organizations/${orgA.id}`]: lastAdmin,
      'GET /api/members': { body: [] },
      'GET /api/members/metrics': { status: 500, body: { status: 500, title: 'x' } },
    })
    const { router } = renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Acme Studio' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Acme Studio?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    const blocked = await screen.findByRole('dialog', { name: 'No puedes salir de Acme Studio' })
    const notice = within(blocked).getByRole('status')
    expect(notice).toHaveTextContent('Eres el único administrador')
    expect(notice).toHaveTextContent('Da el rol de administrador a otra persona del equipo y después podrás salir.')
    expect(within(blocked).queryByRole('button', { name: 'Salir del espacio' })).not.toBeInTheDocument()
    await userEvent.click(within(blocked).getByRole('button', { name: 'Ir a Equipo' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/equipo'))
  })

  it('un 409 que no es last-admin ni last-organization no se confunde con ellos: error genérico', async () => {
    mockApi({
      'GET /api/me': { body: acmeMe },
      [`DELETE /api/me/organizations/${lumen.id}`]: {
        status: 409,
        body: { status: 409, title: 'Conflicto', detail: 'x' },
      },
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir del espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión e inténtalo de nuevo.')
    expect(screen.queryByRole('dialog', { name: /No puedes salir/ })).not.toBeInTheDocument()
  })

  it('si el servidor responde last-organization se trata como «Es tu único espacio»', async () => {
    mockApi({
      'GET /api/me': { body: acmeMe },
      [`DELETE /api/me/organizations/${lumen.id}`]: lastOrganization,
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Es tu único espacio')
    expect(within(dialog).getByRole('button', { name: 'Salir del espacio' })).toBeDisabled()
  })

  it('un 404 (ya no formas parte) lo dice y relee la lista', async () => {
    let meReads = 0
    mockApi({
      'GET /api/me': () => {
        meReads += 1
        return { body: acmeMe }
      },
      [`DELETE /api/me/organizations/${lumen.id}`]: { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir del espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no formas parte de este espacio.')
    await waitFor(() => expect(meReads).toBe(2))
  })

  it('si el espacio desapareció de la lista mientras el diálogo estaba abierto, al cerrarlo el foco va al título', async () => {
    let meReads = 0
    mockApi({
      'GET /api/me': () => {
        meReads += 1
        return { body: meReads === 1 ? acmeMe : meIn(orgA, [orgA, orgC, kora]) }
      },
      [`DELETE /api/me/organizations/${lumen.id}`]: { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya no formas parte de este espacio.')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir Lumen Diseño' })).not.toBeInTheDocument())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toHaveFocus())
  })

  it('un fallo de red deja el diálogo abierto con el aviso y permite reintentar', async () => {
    let calls = 0
    mockApi({
      'GET /api/me': { body: acmeMe },
      [`DELETE /api/me/organizations/${lumen.id}`]: () => {
        calls += 1
        return calls === 1 ? { status: 500, body: { status: 500, title: 'Error interno' } } : { status: 204 }
      },
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Salir de Lumen Diseño' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Revisa tu conexión')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    await waitFor(() => expect(calls).toBe(2))
  })
})

describe('Configuración › Tus espacios · móvil', () => {
  beforeEach(() => {
    mockViewport(390)
  })

  it('toda la fila abre el espacio y «⋯» abre una hoja con el espacio, «Abrir», «Salir del espacio» y «Cancelar»', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    expect(await screen.findByText('Toca un espacio para abrirlo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salir de/ })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones para Lumen Diseño' }))
    const sheet = await screen.findByRole('dialog', { name: 'Lumen Diseño' })
    expect(sheet).toHaveAccessibleDescription('Agente · 6 personas')
    expect(within(sheet).getByRole('button', { name: 'Abrir Lumen Diseño' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Salir del espacio' })).toBeEnabled()
    expect(within(sheet).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('el espacio de cliente no tiene «⋯», y la hoja del actual no ofrece «Abrir»', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    await screen.findByText('Toca un espacio para abrirlo.')
    expect(screen.queryByRole('button', { name: 'Más acciones para Norte Viajes' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones para Acme Studio' }))
    const sheet = await screen.findByRole('dialog', { name: 'Acme Studio' })
    expect(within(sheet).queryByRole('button', { name: /^Abrir/ })).not.toBeInTheDocument()
  })

  it('tocar la fila abre ese espacio', async () => {
    const spy = mockApi({
      'GET /api/me': { body: acmeMe },
      'POST /api/session/organization': { body: meIn(kora, [orgA, lumen, orgC, kora]) },
    })
    const { router } = renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: /^Kora Fitness/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(requestsTo(spy, 'POST', '/api/session/organization')).toHaveLength(1)
  })

  it('desde la hoja, «Salir del espacio» abre la confirmación como hoja inferior y confirma', async () => {
    let left = false
    const spy = mockApi({
      'GET /api/me': () => ({ body: left ? meIn(orgA, [orgA, orgC, kora]) : acmeMe }),
      [`DELETE /api/me/organizations/${lumen.id}`]: () => {
        left = true
        return { status: 204 }
      },
    })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones para Lumen Diseño' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Lumen Diseño' })).getByRole('button', {
        name: 'Salir del espacio',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    expect(dialog.className).toMatch(/sheet/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir del espacio' }))
    await waitFor(() => expect(requestsTo(spy, 'DELETE', `/api/me/organizations/${lumen.id}`)).toHaveLength(1))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Más acciones para Lumen Diseño' })).not.toBeInTheDocument(),
    )
    expect(document.body).not.toHaveFocus()
  })

  it('con un solo espacio la hoja deshabilita «Salir del espacio» con «Es tu único espacio»', async () => {
    mockApi({ 'GET /api/me': { body: meIn(orgA, [orgA]) } })
    renderSpaces()
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones para Acme Studio' }))
    const sheet = await screen.findByRole('dialog', { name: 'Acme Studio' })
    const leave = within(sheet).getByRole('button', { name: 'Salir del espacio' })
    expect(leave).toBeDisabled()
    expect(leave).toHaveAccessibleDescription('Es tu único espacio')
  })

  it('cancelar la confirmación abierta desde la hoja devuelve el foco a «⋯», no a body ni al título', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    const more = await screen.findByRole('button', { name: 'Más acciones para Lumen Diseño' })
    await userEvent.click(more)
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir del espacio' }))
    const confirm = await screen.findByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(more).toHaveFocus())
  })

  it('cancelar la hoja devuelve el foco a «⋯»', async () => {
    mockApi({ 'GET /api/me': { body: acmeMe } })
    renderSpaces()
    const more = await screen.findByRole('button', { name: 'Más acciones para Lumen Diseño' })
    await userEvent.click(more)
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(more).toHaveFocus()
  })
})
