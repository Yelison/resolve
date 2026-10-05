import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import { PendingPage } from './pages/PendingPage'
import { IndexRedirect, RequireRole } from './pages/RequireRole'
import { NewTicketPage } from '../features/tickets/NewTicketPage'
import { TicketDetailPage } from '../features/tickets/TicketDetailPage'
import { TicketsPage } from '../features/tickets/TicketsPage'

/** Secciones cuya vista aún no está implementada. */
const pendingRoutes: RouteObject[] = mainNavigation
  .filter((item) => item.to !== '/tickets')
  .map((item) => {
    const handle: RouteHandle = { crumb: item.label }
    const element = <PendingPage title={item.label} icon={item.icon} />
    return item.to === '/'
      ? { index: true, element: <IndexRedirect fallback={element} />, handle }
      : { path: item.to.slice(1), element, handle }
  })

const ticketRoutes: RouteObject[] = [
  {
    path: 'tickets',
    handle: { crumb: 'Tickets' } satisfies RouteHandle,
    children: [
      { index: true, element: <TicketsPage /> },
      {
        path: 'nuevo',
        element: (
          <RequireRole roles={['admin', 'agent']}>
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
    ],
  },
]

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...pendingRoutes,
      ...ticketRoutes,
      { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } },
    ],
  },
  {
    path: '/catalogo',
    lazy: async () => ({ Component: (await import('./catalog/CatalogPage')).default }),
  },
])
