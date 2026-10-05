import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { AppShell } from '../../app/layout/AppShell'
import { renderWithProviders } from '../../test/render'

/** Estado de un test de sesión: la shell real con unas pocas rutas y la pantalla de entrada. */
export function renderShell(path = '/tickets/1046') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Resumen</h1>, handle: { crumb: 'Resumen' } },
          { path: 'tickets', element: <h1>Tickets</h1>, handle: { crumb: 'Tickets' } },
          { path: 'tickets/:number', element: <h1>Ticket</h1>, handle: { crumb: 'Ticket' } },
        ],
      },
      { path: '/entrar', element: <h1>Entrar</h1> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...renderWithProviders(<RouterProvider router={router} />) }
}

/** Define la cookie de CSRF como lo haría el navegador tras el primer GET con sesión OIDC (`null` la borra). */
export function setCsrfCookie(value: string | null) {
  document.cookie = value === null ? 'XSRF-TOKEN=; Max-Age=0; Path=/' : `XSRF-TOKEN=${value}; Path=/`
}

/** Hace creer a la aplicación que es el build de producción: sin inicio de sesión de demostración. */
export function stubProductionBuild() {
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
}
