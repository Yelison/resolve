import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../../components/ui'
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
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
  return router
}

// En jsdom matchMedia no coincide con ninguna query, así que el shell está en modo móvil.
describe('AppShell en móvil', () => {
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

  it('avisa de que la búsqueda aún no está conectada', async () => {
    renderShell()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('region', { name: 'Notificaciones' })).toHaveTextContent('Búsqueda no disponible')
  })
})
