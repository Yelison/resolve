import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROBLEM_TYPES } from '../../api/client'
import { appRoutes } from '../../app/router'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { requestedPaths } from '../../test/renderApp'
import { LOGIN_PATH, navigation } from './sessionLifecycle'
import { setCsrfCookie } from './shellHarness'
import { FakeChannel, fromAnotherTab, stubProductionBuild } from './shellHarness'

const unauthorized = { status: 401, body: { status: 401, title: 'No autenticado' } }

/** La aplicación real, con sus rutas y guardias, en `path`. */
function renderRoutes(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

/**
 * Espera a que termine la comprobación de la sesión: el título está desde el principio (oculto bajo el esqueleto) y
 * solo recibe el foco cuando la respuesta 401 ya llegó y la pantalla está lista.
 */
async function settled() {
  const heading = await screen.findByRole('heading', { name: 'Entra a Resolve' })
  await waitFor(() => expect(heading).toHaveFocus())
}

beforeEach(() => {
  vi.spyOn(navigation, 'assign').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('sin sesión', () => {
  it('un 401 en /me lleva de cualquier pantalla a /entrar, sin bucle', async () => {
    const spy = mockApi({ 'GET /api/me': unauthorized })
    const router = renderRoutes('/tickets/1046')
    expect(await screen.findByRole('heading', { level: 1, name: 'Entra a Resolve' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(router.state.location.pathname).toBe('/entrar')
    // La shell pidió /me una vez y la pantalla de entrada una más como mucho: nada que se repita sin fin.
    expect(requestedPaths(spy).filter((path) => path === '/api/me').length).toBeLessThanOrEqual(2)
    // `replace`: Atrás no deja volver a la pantalla que ya no se puede abrir.
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('«Entrar con tu cuenta» navega al inicio de sesión del backend', async () => {
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con tu cuenta' }))
    expect(navigation.assign).toHaveBeenCalledWith('/api/oauth2/authorization/resolve')
    expect(LOGIN_PATH).toBe('/api/oauth2/authorization/resolve')
  })

  it('anuncia el fallo del proveedor cuando el backend vuelve con ?error=oidc', async () => {
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar?error=oidc')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar sesión')
  })

  it('no muestra ese aviso en una visita normal', async () => {
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    await settled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lleva el foco al título al mostrarse', async () => {
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    const heading = await screen.findByRole('heading', { name: 'Entra a Resolve' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('mientras comprueba la sesión no se puede pulsar «Entrar» y el esqueleto lo anuncia', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderRoutes('/entrar')
    expect(await screen.findByText('Comprobando tu sesión…')).toBeInTheDocument()
    expect(screen.getByText('Entrar con tu cuenta').closest('[inert]')).not.toBeNull()
  })

  it('un fallo que no es 401 ofrece reintentar en lugar de pedir credenciales', async () => {
    let attempts = 0
    mockApi({
      'GET /api/me': () => {
        attempts += 1
        return attempts === 1 ? { status: 500, body: { status: 500, title: 'Error interno' } } : { body: adminMe }
      },
    })
    const router = renderRoutes('/entrar')
    expect(await screen.findByRole('heading', { name: 'No pudimos comprobar tu sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrar con tu cuenta' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('cuenta que el proveedor autentica pero la aplicación no admite', () => {
  // Los `detail` no coinciden a propósito con los del backend: la pantalla decide por el `type` y escribe su propio texto.
  const deactivated = {
    status: 401,
    body: { type: PROBLEM_TYPES.accessDeactivated, status: 401, title: 'No autenticado', detail: 'Otro texto A.' },
  }
  const noMembership = {
    status: 401,
    body: { type: PROBLEM_TYPES.noMembership, status: 401, title: 'No autenticado', detail: 'Otro texto B.' },
  }
  const generic = {
    status: 401,
    body: { type: 'about:blank', status: 401, title: 'No autenticado', detail: 'Inicia sesión para usar la API.' },
  }
  // El texto de una cuenta desactivada en un problema que no lo es: no puede producir el aviso.
  const genericWithDeactivatedText = {
    status: 401,
    body: { status: 401, title: 'No autenticado', detail: 'Tu acceso a esta organización fue desactivado' },
  }

  afterEach(() => setCsrfCookie(null))

  it('muestra el motivo en un aviso, anunciado, y ofrece cerrar sesión para usar otra cuenta', async () => {
    setCsrfCookie('token-1')
    mockApi({
      'GET /api/me': deactivated,
      'POST /api/logout': { body: { logoutUrl: 'https://idp.example/logout' } },
    })
    const spy = vi.spyOn(globalThis, 'fetch')
    renderRoutes('/entrar')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Esta cuenta no tiene acceso')
    expect(alert).toHaveTextContent('Tu acceso a esta organización fue desactivado')
    expect(alert).not.toHaveTextContent('Otro texto A.')

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' }))
    await waitFor(() => expect(navigation.assign).toHaveBeenCalledWith('https://idp.example/logout'))
    const logout = spy.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.url.endsWith('/api/logout'))!
    expect(logout.headers.get('X-XSRF-TOKEN')).toBe('token-1')
  })

  it('una cuenta sin ninguna membresía se explica con su propio texto y también ofrece cerrar sesión', async () => {
    setCsrfCookie('token-1')
    mockApi({ 'GET /api/me': noMembership })
    renderRoutes('/entrar')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Esta cuenta no tiene acceso')
    expect(alert).toHaveTextContent('no pertenece a ninguna organización de Resolve')
    expect(alert).not.toHaveTextContent('desactivado')
    expect(alert).not.toHaveTextContent('Otro texto B.')
    expect(screen.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' })).toBeInTheDocument()
  })

  it('el texto de «desactivado» en un 401 sin ese type no produce aviso ni botón de cerrar sesión', async () => {
    setCsrfCookie('token-1')
    mockApi({ 'GET /api/me': genericWithDeactivatedText })
    renderRoutes('/entrar')
    await settled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).not.toBeInTheDocument()
  })

  it('sin sesión OIDC (sin cookie de CSRF) explica el motivo pero no ofrece cerrar sesión', async () => {
    mockApi({ 'GET /api/me': deactivated })
    renderRoutes('/entrar')
    expect(await screen.findByRole('alert')).toHaveTextContent('fue desactivado')
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).not.toBeInTheDocument()
  })

  it('el 401 genérico no muestra aviso ni botón de cerrar sesión, aunque haya cookie', async () => {
    setCsrfCookie('token-1')
    mockApi({ 'GET /api/me': generic })
    renderRoutes('/entrar')
    await settled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar sesión/ })).not.toBeInTheDocument()
  })

  it('si cerrar sesión falla avisa y deja la pantalla como estaba', async () => {
    setCsrfCookie('token-1')
    mockApi({
      'GET /api/me': deactivated,
      'POST /api/logout': { status: 500, body: { status: 500, title: 'Error interno' } },
    })
    renderRoutes('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión y usar otra cuenta' }))
    expect(await screen.findByText('No pudimos cerrar la sesión')).toBeInTheDocument()
    expect(navigation.assign).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' })).toBeEnabled()
  })
})

describe('otra pestaña entra', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeChannel.open.clear()
  })

  it('al recibir «signed-in» vuelve a comprobar la sesión y pasa al resumen', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    let signedIn = false
    mockApi({ 'GET /api/me': () => (signedIn ? { body: adminMe } : unauthorized) })
    const router = renderRoutes('/entrar')
    await screen.findByRole('heading', { name: 'Entra a Resolve' })
    signedIn = true
    fromAnotherTab('signed-in')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('otros mensajes de otras pestañas no la mueven', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const spy = mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    await screen.findByRole('heading', { name: 'Entra a Resolve' })
    const before = requestedPaths(spy).length
    fromAnotherTab('logout')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(requestedPaths(spy)).toHaveLength(before)
  })
})

describe('con sesión', () => {
  it('/entrar vuelve al resumen y no deja un bucle con la shell', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: { open: 0, unassigned: 0, overdue: 0, resolvedToday: 0 } },
    })
    const router = renderRoutes('/entrar')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('heading', { name: 'Entra a Resolve' })).not.toBeInTheDocument()
  })
})

describe('inicio de sesión de demostración', () => {
  it('en desarrollo permite elegir un usuario y entrar con él', async () => {
    // El backend de demostración responde 401 hasta que la cabecera lleva un usuario conocido.
    mockApi({ 'GET /api/me': () => (localStorage.getItem('resolve-demo-user') ? { body: adminMe } : unauthorized) })
    const router = renderRoutes('/entrar')
    const demo = await screen.findByRole('region', { name: 'Demostración' })
    await userEvent.selectOptions(
      within(demo).getByRole('combobox', { name: 'Usuario de demostración' }),
      'laura.mendez@acme.example',
    )
    await userEvent.click(within(demo).getByRole('button', { name: 'Usar este usuario' }))
    await waitFor(() => expect(localStorage.getItem('resolve-demo-user')).toBe('laura.mendez@acme.example'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    // El selector desaparece con el foco: debe quedar en el contenido de la shell, no en body.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('en el build de producción no existe el selector', async () => {
    stubProductionBuild()
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    await screen.findByRole('heading', { name: 'Entra a Resolve' })
    expect(screen.queryByRole('region', { name: 'Demostración' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it.each(['smoke', 'staging'])('el modo «%s» se comporta como la lista de permitidos del cliente', async (mode) => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', mode)
    mockApi({ 'GET /api/me': unauthorized })
    renderRoutes('/entrar')
    await screen.findByRole('heading', { name: 'Entra a Resolve' })
    expect(screen.queryByRole('region', { name: 'Demostración' }) !== null).toBe(mode === 'smoke')
  })
})
