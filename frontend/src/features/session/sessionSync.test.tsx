import { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, PROBLEM_TYPES, SESSION_CHANGED_DETAIL } from '../../api/client'
import { shouldRetry } from '../../lib/queryClient'
import { adminMe, mockApi } from '../../test/api'
import { sessionKeys } from './queries'
import { SESSION_TAB_ID } from './sessionChannel'
import { focusContentWhenReady, holdWrites, navigation, releaseWrites, sessionState } from './sessionLifecycle'
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

/**
 * La aplicación con `/me` controlado por el test: lo que devuelva `server.me` (`null` = 401), cuántas veces se pidió,
 * `server.hold` (si es una promesa, la siguiente lectura de `/me` espera a ella; la respuesta ya está decidida) y las
 * escrituras que llegaron (`PATCH /me`).
 */
async function openShell(path = '/tickets/1046', lazyHome?: Promise<void>, queryClient?: QueryClient) {
  const server: {
    me: ReturnType<typeof inOrganization> | null
    reads: number
    writes: number
    hold: Promise<void> | null
    patchStatus: number
    timeout: boolean
  } = { me: inOrganization(acme), reads: 0, writes: 0, hold: null, patchStatus: 200, timeout: false }
  mockApi({
    'GET /api/me': async () => {
      server.reads += 1
      // `/me` que no responde: `fetchMe` aborta a los `ME_TIMEOUT_MS` con un `TimeoutError`.
      if (server.timeout) throw new DOMException('Tiempo agotado', 'TimeoutError')
      const answer = server.me ? { body: server.me } : unauthorized
      const hold = server.hold
      server.hold = null
      if (hold) await hold
      return answer
    },
    'PATCH /api/me': () => {
      server.writes += 1
      // Un 403 de este servidor simulado es siempre el rechazo por falta de token CSRF: el reintento lo reconoce por el type.
      return server.patchStatus === 200
        ? { body: adminMe }
        : {
            status: server.patchStatus,
            body: {
              ...(server.patchStatus === 403 && { type: PROBLEM_TYPES.csrf }),
              status: server.patchStatus,
              title: 'Sin permiso',
            },
          }
    },
  })
  sessionStorage.setItem('resolve-draft-1046', 'Respuesta a medias')
  const shell = renderShell(path, lazyHome, queryClient)
  await screen.findByRole('button', { name: /^Cuenta/ })
  shell.queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de la sesión anterior' })
  const reads = server.reads
  return { ...shell, server, readsSinceOpen: () => server.reads - reads }
}

/** Una lectura de `/me` retenida hasta llamar a `release`. */
function holdNextRead(server: { hold: Promise<void> | null }) {
  let release!: () => void
  server.hold = new Promise<void>((resolve) => (release = resolve))
  return release
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
  releaseWrites()
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

describe('mensajes durante una comprobación', () => {
  it('un «logout» que llega con la lectura ya respondida no se pierde: se repite al terminar', async () => {
    const { server, router, queryClient } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus'))) // la comprobación por foco queda en vuelo (200, misma sesión)
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    server.me = null // en otra pestaña cerraron sesión
    fromAnotherTab('logout')
    release()

    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'))
    expect(queryClient.getQueryData(sessionKeys.me)).toBeUndefined()
  })

  it('el mensaje pendiente solo repite una vez aunque lleguen varios', async () => {
    const { server, readsSinceOpen } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(readsSinceOpen()).toBe(1))
    fromAnotherTab('signed-in')
    fromAnotherTab('signed-in')
    fromAnotherTab('organization-changed')
    release()
    await waitFor(() => expect(readsSinceOpen()).toBe(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readsSinceOpen()).toBe(2)
  })
})

describe('la cadena del foco no sobrevive a la shell', () => {
  it('al desmontarse la shell deja de buscar #contenido', async () => {
    const { unmount } = await openShell()
    const dialog = document.createElement('dialog') // un diálogo abierto: la cadena reintenta sin llegar a enfocar
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    const getById = vi.spyOn(document, 'getElementById')
    focusContentWhenReady()
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(getById.mock.calls.length).toBeGreaterThan(0)

    unmount()
    dialog.remove()
    const calls = getById.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(getById.mock.calls.length).toBe(calls)
  })
})

describe('/me que no responde (L-2)', () => {
  it('la comprobación hace una sola lectura (sin los reintentos de las consultas) y la escritura no espera de más', async () => {
    // La política real de reintentos de las consultas: dos más ante un `TimeoutError` (aquí sin esperas entre ellos).
    const client = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetry, retryDelay: 0, gcTime: Infinity }, mutations: { retry: false } },
    })
    const { server, readsSinceOpen } = await openShell('/tickets/1046', undefined, client)
    server.timeout = true
    act(() => void window.dispatchEvent(new Event('focus')))
    const write = api.PATCH('/me', { body: { name: 'Yelisson' } })

    expect((await write).response.status).toBe(200) // sale en cuanto la comprobación termina
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(readsSinceOpen()).toBe(1)
    expect(server.writes).toBe(1)
  })
})

describe('escrituras y mensajes pendientes de repetirse', () => {
  it('la escritura espera también a la repetición: si esta descubre otra organización, no sale', async () => {
    const { server, queryClient } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus'))) // lectura en vuelo, ya decidida: la misma sesión
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    const write = api.PATCH('/me', { body: { name: 'Yelisson' } })
    server.me = inOrganization(northwind) // la repetición leerá la organización nueva
    fromAnotherTab('organization-changed') // llega durante la comprobación: queda pendiente
    release()

    const { response, error } = await write
    expect(response.status).toBe(409)
    expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
    expect(server.writes).toBe(0)
    expect(await within(region()).findByText('Cambiaste a Northwind en otra pestaña')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
  })

  it('si la repetición confirma la misma sesión, la escritura sale al terminar las dos lecturas', async () => {
    const { server, readsSinceOpen } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(readsSinceOpen()).toBe(1))
    const write = api.PATCH('/me', { body: { name: 'Yelisson' } })
    fromAnotherTab('signed-in')
    release()
    expect((await write).response.status).toBe(200)
    expect(readsSinceOpen()).toBe(2) // la lectura inicial y la repetición, antes de que saliera
    expect(server.writes).toBe(1)
  })
})

describe('escrituras mientras se comprueba la sesión (B-1n)', () => {
  const patch = () => api.PATCH('/me', { body: { name: 'Yelisson' } })

  it('si al terminar la comprobación la organización cambió, la escritura no sale y recibe un 409 con el motivo', async () => {
    const { server, queryClient } = await openShell()
    server.me = inOrganization(northwind)
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))

    const write = patch() // el clic llega con la comprobación en vuelo
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(server.writes).toBe(0)
    release()
    const { response, error } = await write

    expect(response.status).toBe(409)
    expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
    expect(server.writes).toBe(0)
    expect(await within(region()).findByText('Cambiaste a Northwind en otra pestaña')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
  })

  it('si cambió la persona también se cancela', async () => {
    const { server } = await openShell()
    server.me = personB
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    const write = patch()
    release()
    expect((await write).response.status).toBe(409)
    expect(server.writes).toBe(0)
  })

  it('si la sesión es la misma, la escritura sale en cuanto termina la comprobación', async () => {
    const { server } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    const write = patch()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(server.writes).toBe(0)
    release()
    expect((await write).response.status).toBe(200)
    expect(server.writes).toBe(1)
  })

  it('sin comprobación en vuelo no espera ni pide /me', async () => {
    const { server, readsSinceOpen } = await openShell()
    expect((await patch()).response.status).toBe(200)
    expect(server.writes).toBe(1)
    expect(readsSinceOpen()).toBe(0)
  })

  it('una lectura GET no espera a la comprobación', async () => {
    const { server } = await openShell()
    const release = holdNextRead(server)
    act(() => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    const read = api.GET('/me')
    release()
    expect((await read).response.status).toBe(200)
  })
})

describe('reintento de CSRF y sesión en pantalla (H-2)', () => {
  it('si el /me del reintento ya es otra organización, no se reintenta y la pestaña se pone al día', async () => {
    vi.unstubAllGlobals() // sin canal: no hay mensaje que avise a tiempo
    const { server, queryClient, router } = await openShell()
    setCsrfCookie(null) // justo tras iniciar sesión aún no hay cookie
    server.patchStatus = 403 // la escritura sale sin token y se rechaza
    server.me = inOrganization(northwind) // otra pestaña cambió mientras tanto

    const { response, error } = await api.PATCH('/me', { body: { name: 'Yelisson' } })
    expect(response.status).toBe(409)
    expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
    expect(server.writes).toBe(1) // solo el primer intento, sin reintento hacia Northwind
    expect(await within(region()).findByText('Cambiaste a Northwind en otra pestaña')).toBeInTheDocument()
    expect(cachedTicket(queryClient)).toBeUndefined()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('escrituras mientras la pantalla anterior sigue montada (H-1)', () => {
  const patch = () => api.PATCH('/me', { body: { name: 'Yelisson' } })

  it('tras detectar el cambio y hasta que la navegación a / se confirma, la escritura recibe el 409', async () => {
    let loadHome!: () => void
    const home = new Promise<void>((resolve) => (loadHome = resolve))
    const { server, queryClient, router } = await openShell('/tickets/1046', home)
    server.me = inOrganization(northwind)
    act(() => void window.dispatchEvent(new Event('focus')))

    // La comprobación ya terminó y la caché está vacía, pero la ruta `/` aún no cargó: el ticket anterior sigue montado.
    await waitFor(() => expect(cachedTicket(queryClient)).toBeUndefined())
    await waitFor(() => expect(server.reads).toBeGreaterThan(1))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(router.state.location.pathname).toBe('/tickets/1046')
    expect(screen.getByRole('heading', { name: 'Ticket' })).toBeInTheDocument()
    const { response, error } = await patch()
    expect(response.status).toBe(409)
    expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
    expect(server.writes).toBe(0)

    // Al confirmarse la navegación (la pantalla anterior se va) la guardia se abre.
    loadHome()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeInTheDocument()
    expect((await patch()).response.status).toBe(200)
    expect(server.writes).toBe(1)
  })

  it('si la navegación no llega a confirmarse, las escrituras no quedan bloqueadas para siempre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    holdWrites()
    expect(sessionState.switching).toBe(true)
    vi.advanceTimersByTime(5_001)
    expect(sessionState.switching).toBe(false)
    vi.useRealTimers()
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
