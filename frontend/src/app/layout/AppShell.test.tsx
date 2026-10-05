import { screen, within } from '@testing-library/react'
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
})
