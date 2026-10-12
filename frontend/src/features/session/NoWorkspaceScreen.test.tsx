import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROBLEM_TYPES } from '../../api/client'
import type { Me } from '../../api/schema'
import { AppShell } from '../../app/layout/AppShell'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { metrics } from '../../test/ticketFixtures'
import { LoginPage } from './LoginPage'
import { releaseWrites, navigation } from './sessionLifecycle'
import { setCsrfCookie, stubViewportWidth } from './shellHarness'

const identity = { email: 'ana@lumen.example', name: 'Ana' }
const noMembership = (extra: object) => ({
  status: 401,
  body: {
    type: PROBLEM_TYPES.noMembership,
    status: 401,
    title: 'No autenticado',
    detail: 'Texto del servidor.',
    ...extra,
  },
})
const open = noMembership({ canCreateOrganization: true, ...identity })
const closed = noMembership({ canCreateOrganization: false, ...identity })
const oldServer = noMembership({})

const meInNew = {
  ...adminMe,
  user: { id: 'u-ana', name: 'Ana', email: identity.email },
  organization: { ...adminMe.organization, id: 'org-new', name: 'Lumen Diseño', timeZone: 'Europe/Madrid' },
  organizationCreation: { allowed: true, created: 1, limit: 3 },
} as Me

/** `/` (la shell con un Inicio mínimo) y `/entrar` con la pantalla real, como en la aplicación. */
function renderApp(path = '/') {
  stubViewportWidth()
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [{ index: true, element: <h1>Inicio</h1>, handle: { crumb: 'Inicio' } }],
      },
      { path: '/entrar', element: <LoginPage /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...renderWithProviders(<RouterProvider router={router} />) }
}

const posts = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => input as Request).filter((request) => request.url.endsWith('/api/organizations'))

beforeEach(() => {
  sessionStorage.clear()
  setCsrfCookie('token-1')
  vi.spyOn(navigation, 'assign').mockImplementation(() => {})
})

afterEach(() => {
  releaseWrites()
  vi.restoreAllMocks()
  setCsrfCookie(null)
})

describe('«Crea tu espacio» (la instalación deja crear)', () => {
  it('sin sesión de espacio lleva a /entrar y pinta la pantalla propia, fuera de la shell, con el foco en el título', async () => {
    mockApi({ 'GET /api/me': open })
    const { router } = renderApp('/')
    const heading = await screen.findByRole('heading', { level: 1, name: 'Crea tu espacio' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(router.state.location.pathname).toBe('/entrar')
    expect(document.title).toBe('Crea tu espacio · Resolve')
    expect(screen.getByText(/Hola, Ana\. Aún no estás en ningún espacio\./)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveValue('')
    expect((screen.getByRole('combobox', { name: 'Zona horaria' }) as HTMLSelectElement).value).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
    expect(screen.getByText(identity.email)).toBeInTheDocument()
    // No es el diálogo: sin «Cancelar», y sin barra lateral ni cuenta.
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    // No es la pantalla de entrada: nadie elige aquí un proveedor.
    expect(screen.queryByRole('button', { name: 'Entrar con tu cuenta' })).not.toBeInTheDocument()
  })

  it('sin nombre muestra el error bajo el campo, anunciado, y no envía nada (la validación del diálogo)', async () => {
    const spy = mockApi({ 'GET /api/me': open })
    renderApp('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Crear espacio' }))
    const field = screen.getByRole('textbox', { name: 'Nombre del espacio' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un nombre para el espacio.')
    expect(posts(spy)).toHaveLength(0)
  })

  it('crea: envía nombre y zona, entra en Inicio del espacio nuevo, avisa y deja el foco en el contenido', async () => {
    const spy = mockApi({
      'GET /api/me': open,
      'POST /api/organizations': { status: 201, body: meInNew },
      'GET /api/tickets/metrics': { body: { ...metrics, gettingStarted: null } },
    })
    const { router } = renderApp('/entrar')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre del espacio' }), '  Lumen Diseño  ')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona horaria' }), 'Europe/Madrid')
    await userEvent.click(screen.getByRole('button', { name: 'Crear espacio' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const post = posts(spy)[0]!
    expect(post.headers.get('X-XSRF-TOKEN')).toBe('token-1')
    await expect(post.clone().json()).resolves.toEqual({ name: 'Lumen Diseño', timeZone: 'Europe/Madrid' })
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Ya estás en Lumen Diseño')).toBeInTheDocument()
    // El formulario desapareció con el foco: va al contenido de la pantalla nueva, no a `body`.
    await waitFor(() => expect(document.getElementById('contenido')).toHaveFocus())
  })

  it('un `400` del servidor va bajo su campo y la pantalla sigue ahí para corregirlo', async () => {
    mockApi({
      'GET /api/me': open,
      'POST /api/organizations': {
        status: 400,
        body: { status: 400, title: 'Datos no válidos', errors: [{ field: 'name', message: 'Ese nombre no sirve.' }] },
      },
    })
    renderApp('/entrar')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre del espacio' }), 'Lumen')
    await userEvent.click(screen.getByRole('button', { name: 'Crear espacio' }))
    const field = await screen.findByRole('textbox', { name: 'Nombre del espacio' })
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(field).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Ese nombre no sirve.')
    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu espacio' })).toBeInTheDocument()
  })

  it('un `409` de límite (no debería darse sin espacios) se avisa, anunciado, sin salir de la pantalla', async () => {
    mockApi({
      'GET /api/me': open,
      'POST /api/organizations': {
        status: 409,
        body: { type: PROBLEM_TYPES.organizationLimit, status: 409, title: 'Límite' },
      },
    })
    renderApp('/entrar')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre del espacio' }), 'Otro')
    await userEvent.click(screen.getByRole('button', { name: 'Crear espacio' }))
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Ya creaste el máximo de espacios por persona.')
    expect(notice).toHaveTextContent('pide a alguien de tu equipo que te invite')
    expect(screen.queryByRole('button', { name: 'Ver tus espacios' })).not.toBeInTheDocument()
  })

  it('si la instalación se cierra entretanto, relee la sesión y pasa sola a «Aún no estás en ningún espacio», con el foco en su título', async () => {
    let reads = 0
    mockApi({
      'GET /api/me': () => (reads++ === 0 ? open : closed),
      'POST /api/organizations': noMembership({ canCreateOrganization: false, ...identity }),
    })
    renderApp('/entrar')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre del espacio' }), 'Lumen')
    await userEvent.click(screen.getByRole('button', { name: 'Crear espacio' }))
    const heading = await screen.findByRole('heading', { level: 1, name: 'Aún no estás en ningún espacio' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.queryByRole('textbox', { name: 'Nombre del espacio' })).not.toBeInTheDocument()
  })

  it('«Entrar con otra cuenta» cierra la sesión con el token de CSRF y sale hacia el proveedor', async () => {
    const spy = mockApi({
      'GET /api/me': open,
      'POST /api/logout': { body: { logoutUrl: 'https://idp.example/logout' } },
    })
    renderApp('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con otra cuenta' }))
    await waitFor(() => expect(navigation.assign).toHaveBeenCalledWith('https://idp.example/logout'))
    const logout = spy.mock.calls.map(([input]) => input as Request).find((r) => r.url.endsWith('/api/logout'))!
    expect(logout.headers.get('X-XSRF-TOKEN')).toBe('token-1')
  })
})

describe('«Aún no estás en ningún espacio» (la instalación no deja crear)', () => {
  it('pide una invitación con el correo, que se ve como texto, y ofrece entrar con otra cuenta; sin formulario', async () => {
    mockApi({ 'GET /api/me': closed })
    renderApp('/')
    const heading = await screen.findByRole('heading', { level: 1, name: 'Aún no estás en ningún espacio' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(document.title).toBe('Aún no estás en ningún espacio · Resolve')
    expect(screen.getByText('Pide a alguien de tu equipo que te invite con este correo:')).toBeInTheDocument()
    expect(screen.getByText(identity.email)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar con otra cuenta' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sin cookie de CSRF no ofrece cerrar sesión (no habría con qué)', async () => {
    setCsrfCookie(null)
    mockApi({ 'GET /api/me': closed })
    renderApp('/entrar')
    await screen.findByRole('heading', { level: 1, name: 'Aún no estás en ningún espacio' })
    expect(screen.queryByRole('button', { name: 'Entrar con otra cuenta' })).not.toBeInTheDocument()
  })

  it('un servidor anterior (sin correo en el 401) vuelve al aviso de siempre en la pantalla de entrada', async () => {
    mockApi({ 'GET /api/me': oldServer })
    renderApp('/entrar')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('no pertenece a ningún espacio de Resolve')
    expect(screen.getByRole('heading', { level: 1, name: 'Entra a Resolve' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Aún no estás en ningún espacio' })).not.toBeInTheDocument()
  })

  it('un correo de 120 caracteres se ve entero (se parte, no se recorta)', async () => {
    const long = `${'a'.repeat(100)}@${'b'.repeat(19)}.com`
    mockApi({ 'GET /api/me': noMembership({ canCreateOrganization: false, email: long, name: 'Ana' }) })
    renderApp('/entrar')
    expect(await screen.findByText(long)).toBeInTheDocument()
  })
})
