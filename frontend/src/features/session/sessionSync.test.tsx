import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { sessionKeys } from './queries'
import { SESSION_TAB_ID } from './sessionChannel'
import { navigation, sessionState } from './sessionLifecycle'
import { fromAnotherTab, renderShell, setCsrfCookie, FakeChannel } from './shellHarness'

const acme = { id: 'org-1', name: 'Acme Studio' }
const northwind = { id: 'org-2', name: 'Northwind' }
const inOrganization = (organization: typeof acme) => ({
  ...adminMe,
  organization: { ...adminMe.organization, ...organization },
  organizations: [acme, northwind],
})
const personB = { ...inOrganization(acme), user: { id: 'u-jordi', name: 'Jordi Puig', email: 'jordi@acme.example' } }
const region = () => screen.getByRole('region', { name: 'Notificaciones' })
const unauthorized = { status: 401, body: { status: 401, title: 'No autenticado' } }

/** La aplicación con `/me` controlado por el test: lo que devuelva `server.me` (`null` = 401) y cuántas veces se pidió. */
async function openShell(path = '/tickets/1046') {
  const server: { me: ReturnType<typeof inOrganization> | null; reads: number } = { me: inOrganization(acme), reads: 0 }
  mockApi({
    'GET /api/me': () => {
      server.reads += 1
      return server.me ? { body: server.me } : unauthorized
    },
  })
  sessionStorage.setItem('resolve-draft-1046', 'Respuesta a medias')
  const shell = renderShell(path)
  await screen.findByRole('button', { name: /^Cuenta/ })
  shell.queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de la sesión anterior' })
  const reads = server.reads
  return { ...shell, server, readsSinceOpen: () => server.reads - reads }
}

const cachedTicket = (client: { getQueryData: (key: unknown[]) => unknown }) =>
  client.getQueryData(['tickets', 'detail', 1046])

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  setCsrfCookie('token-1')
  vi.spyOn(navigation, 'assign').mockImplementation(() => {})
})

afterEach(() => {
  sessionState.ending = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeChannel.open.clear()
  sessionStorage.clear()
  setCsrfCookie(null)
})

describe('otras pestañas (BroadcastChannel)', () => {
  it('«organization-changed»: si el servidor ya está en otra organización, descarta, vuelve al resumen y avisa', async () => {
    const { server, queryClient, router } = await openShell()
    server.me = inOrganization(northwind)
    fromAnotherTab('organization-changed')

    expect(await within(region()).findByText('Cambiaste a Northwind en otra pestaña')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeInTheDocument()
  })

  it('«signed-in»: si ahora es otra persona, descarta y lo explica', async () => {
    const { server, queryClient, router } = await openShell()
    server.me = personB
    fromAnotherTab('signed-in')

    expect(await within(region()).findByText('Ahora usas Resolve como Jordi Puig en Acme Studio')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    expect(router.state.location.pathname).toBe('/')
  })

  it('«signed-in» de la misma persona y organización no toca nada', async () => {
    const { queryClient, router, readsSinceOpen } = await openShell()
    fromAnotherTab('signed-in')
    await waitFor(() => expect(readsSinceOpen()).toBe(1))
    expect(cachedTicket(queryClient)).toBeDefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBe('Respuesta a medias')
    expect(router.state.location.pathname).toBe('/tickets/1046')
    expect(within(region()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('«logout»: descarta y lleva a /entrar sin esperar a que useMe reaccione', async () => {
    const { server, queryClient, router } = await openShell()
    server.me = null
    fromAnotherTab('logout')

    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'))
    expect(queryClient.getQueryData(sessionKeys.me)).toBeUndefined()
    expect(cachedTicket(queryClient)).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
  })

  it('ignora lo que publica la propia pestaña', async () => {
    const { readsSinceOpen, router } = await openShell()
    fromAnotherTab('logout', SESSION_TAB_ID)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readsSinceOpen()).toBe(0)
    expect(router.state.location.pathname).toBe('/tickets/1046')
  })

  it('un 401 por otro motivo que no es el cierre de sesión avisa de que caducó', async () => {
    const { server } = await openShell()
    server.me = null
    fromAnotherTab('organization-changed')
    expect(await within(region()).findByText('Tu sesión caducó')).toBeInTheDocument()
  })
})

describe('publicar a las demás pestañas', () => {
  /** Lo que publica esta pestaña, tal como lo vería otra. */
  function listen() {
    const received: string[] = []
    const remote = new FakeChannel('resolve-session')
    remote.onmessage = (event) =>
      received.push(`${(event.data as { type: string }).type}:${(event.data as { tab: string }).tab}`)
    return received
  }

  it('al cargar el primer Me anuncia «signed-in»', async () => {
    const received = listen()
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    expect(received).toEqual([`signed-in:${SESSION_TAB_ID}`])
  })

  it('al cerrar sesión anuncia «logout» justo antes de salir hacia el proveedor', async () => {
    const events: string[] = []
    const remote = new FakeChannel('resolve-session')
    remote.onmessage = (event) => events.push(`msg:${(event.data as { type: string }).type}`)
    vi.mocked(navigation.assign).mockImplementation(() => void events.push('assign'))
    mockApi({
      'GET /api/me': { body: adminMe },
      'POST /api/logout': { body: { logoutUrl: 'https://idp.example/logout' } },
    })
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: /^Cuenta/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(events).toContain('assign'))
    expect(events.filter((event) => event !== 'msg:signed-in')).toEqual(['msg:logout', 'assign'])
  })

  it('al cambiar de organización anuncia «organization-changed» con el Me nuevo ya guardado', async () => {
    const received = listen()
    mockApi({
      'GET /api/me': { body: inOrganization(acme) },
      'POST /api/session/organization': { body: inOrganization(northwind) },
    })
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: /^Cuenta/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Cambiar de organización/ }))
    const dialog = screen.getByRole('dialog', { name: 'Cambiar de organización' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Northwind' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar de organización' }))
    await waitFor(() => expect(received).toContain(`organization-changed:${SESSION_TAB_ID}`))
  })
})

describe('respaldo sin canal: foco y visibilidad', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const focusWindow = () => act(() => void window.dispatchEvent(new Event('focus')))

  it('al recuperar el foco relee /me aunque no haya aviso; si es otra organización, descarta y avisa', async () => {
    const { server, queryClient, router } = await openShell()
    server.me = inOrganization(northwind)
    focusWindow()
    expect(await within(region()).findByText('Cambiaste a Northwind en otra pestaña')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    expect(router.state.location.pathname).toBe('/')
  })

  it('si es otra persona, descarta y avisa', async () => {
    const { server } = await openShell()
    server.me = personB
    focusWindow()
    expect(await within(region()).findByText('Ahora usas Resolve como Jordi Puig en Acme Studio')).toBeInTheDocument()
  })

  it('con la misma identidad lo relee y no cambia nada', async () => {
    const { queryClient, router, readsSinceOpen } = await openShell()
    focusWindow()
    await waitFor(() => expect(readsSinceOpen()).toBe(1))
    expect(cachedTicket(queryClient)).toBeDefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBe('Respuesta a medias')
    expect(router.state.location.pathname).toBe('/tickets/1046')
  })

  it('foco y visibilidad a la vez dan una sola lectura de /me', async () => {
    const { readsSinceOpen } = await openShell()
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(readsSinceOpen()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readsSinceOpen()).toBe(1)
  })

  it('un 401 al volver (la sesión murió fuera) muestra «Tu sesión caducó» una sola vez', async () => {
    const { server } = await openShell()
    server.me = null
    focusWindow()
    expect(await within(region()).findByText('Tu sesión caducó')).toBeInTheDocument()
    focusWindow()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(region()).getAllByText('Tu sesión caducó')).toHaveLength(1)
  })

  it('con la pestaña oculta no relee', async () => {
    const { readsSinceOpen } = await openShell()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    focusWindow()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readsSinceOpen()).toBe(0)
  })

  it('sin sesión cargada (/me falló) no relee: la página de error de sesión no se reanuncia', async () => {
    let reads = 0
    mockApi({
      'GET /api/me': () => {
        reads += 1
        return { status: 500, body: { status: 500, title: 'Error interno' } }
      },
    })
    renderShell()
    await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
    const before = reads
    focusWindow()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(reads).toBe(before)
  })
})
