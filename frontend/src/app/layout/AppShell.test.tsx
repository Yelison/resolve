import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { AppShell } from './AppShell'

function renderShell(path = '/tickets') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Resumen</h1>, handle: { crumb: 'Resumen' } },
          { path: 'tickets', element: <h1>Tickets</h1>, handle: { crumb: 'Tickets' } },
          { path: 'clientes', element: <h1>Clientes</h1>, handle: { crumb: 'Clientes' } },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return router
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

  it('un 401 no sugiere reintentar en unos segundos y conserva el botón', async () => {
    mockApi({ 'GET /api/me': { status: 401, body: { status: 401, title: 'No autenticado' } } })
    renderShell()
    await screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })
    expect(screen.getByText('No hay una sesión activa para esta organización.')).toBeInTheDocument()
    expect(screen.queryByText(/unos segundos/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
