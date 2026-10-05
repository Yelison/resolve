import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '../app/router'
import { adminMe, type mockApi } from './api'
import { renderWithProviders } from './render'

/** Monta la aplicación real (shell, guardias y rutas) en `path`; devuelve el router para leer la ubicación. */
export function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

/** Sesiones del personal con las que se repiten los casos de cada sección. */
export const staffMes = [
  ['admin', adminMe],
  ['agent', { ...adminMe, role: 'agent' }],
] as const

/** Rutas de la API que ha pedido un `mockApi`. */
export const requestedPaths = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => new URL((input as Request).url).pathname)
