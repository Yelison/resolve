import type { ReactNode } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation, staff, type NavigationItem } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import { PendingPage } from './pages/PendingPage'
import { IndexRedirect, RequireRole } from './pages/RequireRole'
import { NewTicketPage } from '../features/tickets/NewTicketPage'
import { TicketDetailPage } from '../features/tickets/TicketDetailPage'
import { TicketsPage } from '../features/tickets/TicketsPage'

/**
 * Ruta de una sección de la navegación. Siempre pasa por `RequireRole` con los roles y el título de la entrada, de modo
 * que una sección nueva no puede quedar sin guardia. Sin `children`, `element` es la vista; con ellos, `element` se
 * omite y la guardia envuelve a las rutas hijas.
 */
function sectionRoute(
  item: NavigationItem,
  { element, children }: { element?: ReactNode; children?: RouteObject[] },
): RouteObject {
  const handle: RouteHandle = { crumb: item.label }
  const guarded = (
    <RequireRole roles={item.roles} title={item.label}>
      {children ? <Outlet /> : element}
    </RequireRole>
  )
  if (item.to === '/') return { index: true, element: <IndexRedirect fallback={guarded} />, handle }
  const path = item.to.slice(1)
  return children ? { path, element: guarded, handle, children } : { path, element: guarded, handle }
}

const ticketChildren: RouteObject[] = [
  { index: true, element: <TicketsPage /> },
  {
    path: 'nuevo',
    element: (
      <RequireRole
        roles={staff}
        title="Crear ticket"
        description="Solo los agentes y administradores pueden registrar tickets."
      >
        <NewTicketPage />
      </RequireRole>
    ),
    handle: { crumb: 'Nuevo ticket' } satisfies RouteHandle,
  },
  {
    path: ':number',
    element: <TicketDetailPage />,
    handle: { crumb: (params) => `#${params.number}` } satisfies RouteHandle,
  },
]

/** Todas las secciones salen de `mainNavigation`; las que aún no tienen vista muestran «Vista en construcción». */
const sectionRoutes: RouteObject[] = mainNavigation.map((item) =>
  item.to === '/tickets'
    ? sectionRoute(item, { children: ticketChildren })
    : sectionRoute(item, { element: <PendingPage title={item.label} icon={item.icon} /> }),
)

/** Rutas de la aplicación; se exportan para probar el cableado real (guardias y redirecciones) sin navegador. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [...sectionRoutes, { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } }],
  },
  {
    path: '/catalogo',
    lazy: async () => ({ Component: (await import('./catalog/CatalogPage')).default }),
  },
]

export const router = createBrowserRouter(appRoutes)
