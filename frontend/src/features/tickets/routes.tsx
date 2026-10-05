import type { RouteObject } from 'react-router'
import type { FeatureRoutes } from '../../app/router'
import type { RouteHandle } from '../../app/layout/AppShell'
import { staff } from '../../app/navigation'
import { RequireRole } from '../../app/pages/RequireRole'
import { NewTicketPage } from './NewTicketPage'
import { TicketDetailPage } from './TicketDetailPage'
import { TicketsPage } from './TicketsPage'

const children: RouteObject[] = [
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

/** Tickets: bandeja, alta (solo personal) y detalle. */
export const ticketsRoutes: FeatureRoutes = () => ({ children })
