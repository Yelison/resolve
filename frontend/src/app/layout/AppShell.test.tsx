import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuery } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, unwrap } from '../../api/client'
import { customerKeys } from '../../features/customers/queries'
import { setDemoMaintenance } from '../../lib/demoMaintenance'
import { queryClient } from '../../lib/queryClient'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { AppShell } from './AppShell'

/** Una vista con su propia consulta, para ver qué le pasa durante el reinicio de la demostración. */
function Probe() {
  const probe = useQuery({
    queryKey: customerKeys.metrics(),
    queryFn: () => unwrap(api.GET('/customers/metrics')),
    retry: false,
  })
  return <h1>{probe.data ? 'Sondeo cargado' : probe.error ? 'Sondeo con error' : 'Sondeo cargando'}</h1>
}

function renderShell(path = '/tickets') {
  return renderShellWith(undefined, path).router
}

function renderShellWith(client?: QueryClient, path = '/tickets') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Resumen</h1>, handle: { crumb: 'Resumen' } },
          { path: 'tickets', element: <h1>Tickets</h1>, handle: { crumb: 'Tickets' } },
          { path: 'clientes', element: <h1>Clientes</h1>, handle: { crumb: 'Clientes' } },
          { path: 'sondeo', element: <Probe />, handle: { crumb: 'Sondeo' } },
        ],
      },
      { path: '/entrar', element: <h1>Entrar</h1> },
    ],
    { initialEntries: [path] },
  )
  const rendered = renderWithProviders(<RouterProvider router={router} />, client)
  return { router, queryClient: rendered.queryClient }
}

// En jsdom matchMedia no coincide con ninguna query, así que el shell está en modo móvil.
describe('AppShell en móvil', () => {
  beforeEach(() => {
    mockApi({ 'GET /api/me': { body: adminMe } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pone el título del documento y un enlace para saltar al contenido', () => {
    renderShell()
    expect(document.title).toBe('Tickets · Resolve')
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido')
  })

  it('abre el drawer, se cierra al navegar y devuelve el foco al botón', async () => {
    const router = renderShell()
    const menuButton = screen.getByRole('button', { name: 'Abrir menú' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menuButton)
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    await within(drawer).findByText('Yelisson Ortiz')
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(document.documentElement).toHaveClass('scroll-locked')

    await userEvent.click(within(drawer).getByRole('link', { name: 'Clientes' }))
    expect(router.state.location.pathname).toBe('/clientes')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()
    expect(document.documentElement).not.toHaveClass('scroll-locked')
  })

  it('cierra el drawer con su botón', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el atajo de búsqueda lleva a la bandeja de tickets', async () => {
    const router = renderShell('/clientes')
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(router.state.location.pathname).toBe('/tickets')
    expect(router.state.location.state).toEqual({ focusSearch: expect.any(Number) })
  })
})

describe('AppShell en escritorio', () => {
  beforeEach(() => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    // Con todas las media queries coincidiendo, el shell usa el sidebar y la barra superior completa.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('el encabezado no tiene campana de notificaciones', async () => {
    renderShell()
    expect(await screen.findByRole('button', { name: /^Cambiar a tema/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })
})

describe('AppShell para clientes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('solo muestra las secciones a las que tiene acceso', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    await within(drawer).findByText('María Pérez')
    expect(within(drawer).getByRole('link', { name: 'Tickets' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument()
  })
})

describe('AppShell sin sesión', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si /me falla se muestra un aviso con reintento y no la vista de cliente', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
    renderShell()
    expect(await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickets' })).not.toBeInTheDocument()
    const meCalls = () =>
      fetchSpy.mock.calls.filter(([input]) => new URL((input as Request).url).pathname === '/api/me').length
    expect(meCalls()).toBe(1)

    fetchSpy.mockImplementation(async () => Response.json(adminMe))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    expect(meCalls()).toBe(2)
    expect(screen.queryByRole('heading', { name: 'No pudimos cargar tu sesión' })).not.toBeInTheDocument()
  })

  it('mientras reintenta conserva el aviso y el foco, y anuncia el fallo al terminar', async () => {
    let calls = 0
    mockApi({
      'GET /api/me': async () => {
        calls += 1
        if (calls > 1) await new Promise((resolve) => setTimeout(resolve, 150))
        return { status: 500, body: { status: 500, title: 'Error interno' } }
      },
    })
    renderShell()
    await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
    const description = 'El servidor no respondió como esperábamos. Vuelve a intentarlo en unos segundos.'
    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    screen.getByRole('button', { name: 'Reintentar' }).focus()
    await userEvent.keyboard('{Enter}')
    const button = await screen.findByRole('button', { name: 'Reintentando…' })
    expect(button).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'No pudimos cargar tu sesión' })).toBeInTheDocument()
    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickets' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'No pudimos cargar tu sesión' })).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toHaveFocus()
    expect(calls).toBe(2)
  })

  describe('sin acciones del usuario', () => {
    afterEach(() => {
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    })

    const meCalls = (fetchSpy: ReturnType<typeof mockApi>) =>
      fetchSpy.mock.calls.filter(([input]) => new URL((input as Request).url).pathname === '/api/me').length

    it('recuperar el foco de la ventana no reintenta /me ni anuncia el fallo', async () => {
      const fetchSpy = mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
      renderShell()
      await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
      expect(meCalls(fetchSpy)).toBe(1)

      act(() => focusManager.setFocused(false))
      act(() => focusManager.setFocused(true))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(meCalls(fetchSpy)).toBe(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('tras un reintento pedido fallido, un refetch automático lento no vuelve a poner role="alert"', async () => {
      let calls = 0
      const fetchSpy = mockApi({
        'GET /api/me': async () => {
          calls += 1
          if (calls > 1) await new Promise((resolve) => setTimeout(resolve, 150))
          return { status: 500, body: { status: 500, title: 'Error interno' } }
        },
      })
      renderShell()
      await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      const alert = await screen.findByRole('alert')

      const roles: (string | null)[] = []
      const observer = new MutationObserver(() => roles.push(alert.getAttribute('role')))
      observer.observe(alert, { attributes: true, attributeFilter: ['role'] })
      act(() => onlineManager.setOnline(false))
      act(() => onlineManager.setOnline(true))
      await waitFor(() => expect(meCalls(fetchSpy)).toBe(3))
      await new Promise((resolve) => setTimeout(resolve, 300))
      observer.disconnect()

      expect(roles).not.toContain('alert')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un reintento automático al volver la conexión no se anuncia como pedido por el usuario', async () => {
      const fetchSpy = mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
      renderShell()
      await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })

      act(() => onlineManager.setOnline(false))
      act(() => onlineManager.setOnline(true))
      await waitFor(() => expect(meCalls(fetchSpy)).toBe(2))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('sin conexión', () => {
    afterEach(() => onlineManager.setOnline(true))

    it('«Reintentar» indica que espera la conexión, conserva el foco y reintenta al volver', async () => {
      const fetchSpy = mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
      renderShell()
      await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
      const meCalls = () =>
        fetchSpy.mock.calls.filter(([input]) => new URL((input as Request).url).pathname === '/api/me').length

      act(() => onlineManager.setOnline(false))
      screen.getByRole('button', { name: 'Reintentar' }).focus()
      await userEvent.keyboard('{Enter}')
      const button = await screen.findByRole('button', { name: 'Esperando conexión…' })
      expect(button).toHaveFocus()
      expect(meCalls()).toBe(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      act(() => onlineManager.setOnline(true))
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByRole('button', { name: 'Reintentar' })).toHaveFocus()
      expect(meCalls()).toBe(2)
    })
  })

  it('mientras la sesión está en error el menú no ofrece las secciones del personal', async () => {
    mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
    renderShell()
    await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    expect(within(within(drawer).getByRole('navigation', { name: 'Principal' })).queryAllByRole('link')).toHaveLength(0)
    expect(within(drawer).getByText('Espacio de trabajo')).toBeInTheDocument()
    expect(within(drawer).getByText('Sesión no disponible')).toBeInTheDocument()
    expect(within(drawer).queryByText('Gestión')).not.toBeInTheDocument()
  })

  it('un 401 en /me lleva a /entrar en lugar de mostrar el aviso de sesión no disponible', async () => {
    mockApi({ 'GET /api/me': { status: 401, body: { status: 401, title: 'No autenticado' } } })
    const router = renderShell()
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(screen.queryByRole('heading', { name: 'No pudimos cargar tu sesión' })).not.toBeInTheDocument()
  })
})

const demoMe = { ...adminMe, organization: { ...adminMe.organization, demo: true } }

describe('AppShell en la demostración pública', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setDemoMaintenance(false)
    queryClient.clear()
  })

  it('muestra el aviso persistente como región con nombre, sin interrumpir', async () => {
    mockApi({ 'GET /api/me': { body: demoMe } })
    renderShell()
    const banner = await screen.findByRole('region', { name: 'Demostración pública' })
    expect(banner).toHaveTextContent('Demostración pública · los datos se reinician cada noche')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument()
  })

  it('no aparece si demo es false', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    await within(screen.getByRole('dialog', { name: 'Menú principal' })).findByText('Yelisson Ortiz')
    expect(screen.queryByRole('region', { name: 'Demostración pública' })).not.toBeInTheDocument()
  })

  it('no aparece mientras carga /me y llega con la respuesta', async () => {
    let respond!: (value: { body: unknown }) => void
    mockApi({ 'GET /api/me': () => new Promise((resolve) => (respond = resolve)) })
    renderShell()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Demostración pública' })).not.toBeInTheDocument()
    await waitFor(() => expect(respond).toBeTypeOf('function'))
    await act(async () => respond({ body: demoMe }))
    expect(await screen.findByRole('region', { name: 'Demostración pública' })).toBeInTheDocument()
  })

  it('no aparece si /me falla', async () => {
    mockApi({ 'GET /api/me': { status: 500, body: { status: 500, title: 'Error interno' } } })
    renderShell()
    await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
    expect(screen.queryByRole('region', { name: 'Demostración pública' })).not.toBeInTheDocument()
  })

  it('durante el reinicio avisa para toda la aplicación y «Reintentar» relee /me y retira el aviso', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: demoMe } })
    const { queryClient: client } = renderShellWith(queryClient)
    await screen.findByRole('region', { name: 'Demostración pública' })
    expect(client).toBe(queryClient)

    act(() => setDemoMaintenance(true))
    const notice = await screen.findByRole('status')
    expect(within(notice).getByText('Estamos reiniciando la demostración; vuelve en un minuto.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tickets' })).toBeInTheDocument()

    const meCalls = () =>
      fetchSpy.mock.calls.filter(([input]) => new URL((input as Request).url).pathname === '/api/me').length
    const before = meCalls()
    await userEvent.click(within(notice).getByRole('button', { name: 'Reintentar la conexión con la demostración' }))
    await waitFor(() => expect(meCalls()).toBe(before + 1))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    // El aviso se fue con el foco en «Reintentar»: el foco pasa al título, nunca a `body`.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tickets' })).toHaveFocus())
  })

  it('abrir la aplicación durante el reinicio muestra solo el aviso global, no el error de sesión', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': {
        status: 503,
        headers: { 'Retry-After': '60' },
        body: { status: 503, title: 'Reinicio de la demostración en curso' },
      },
    })
    renderShell()
    const notice = await screen.findByRole('status')
    expect(within(notice).getByText('Estamos reiniciando la demostración; vuelve en un minuto.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No pudimos cargar tu sesión' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Reintentar/ })).toHaveLength(1)

    fetchSpy.mockImplementation(async () => Response.json(demoMe))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar la conexión con la demostración' }))
    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Demostración pública' })).toBeInTheDocument()
  })

  it('si la demostración sigue reiniciando, el aviso se queda tras reintentar', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: demoMe } })
    renderShellWith(queryClient)
    await screen.findByRole('region', { name: 'Demostración pública' })
    act(() => setDemoMaintenance(true))
    fetchSpy.mockImplementation(async () =>
      Response.json(
        { status: 503, title: 'Reinicio de la demostración en curso' },
        { status: 503, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '60' } },
      ),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar la conexión con la demostración' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reintentar la conexión con la demostración' })).toBeEnabled(),
    )
    expect(screen.getByText('Estamos reiniciando la demostración; vuelve en un minuto.')).toBeInTheDocument()
  })

  it('al volver la demostración, la vista que falló durante el reinicio se recupera con «Reintentar»', async () => {
    let reset = true
    mockApi({
      'GET /api/me': { body: demoMe },
      'GET /api/customers/metrics': () =>
        reset
          ? {
              status: 503,
              headers: { 'Retry-After': '60' },
              body: { status: 503, title: 'Reinicio de la demostración en curso' },
            }
          : { body: { total: 0, active: 0, newThisMonth: 0, withOpenTickets: 0 } },
    })
    renderShellWith(queryClient, '/sondeo')
    expect(await screen.findByRole('heading', { name: 'Sondeo con error' })).toBeInTheDocument()
    const notice = await screen.findByRole('status')

    reset = false
    await userEvent.click(within(notice).getByRole('button', { name: 'Reintentar la conexión con la demostración' }))
    expect(await screen.findByRole('heading', { name: 'Sondeo cargado' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
