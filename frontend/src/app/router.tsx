import type { ReactNode } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { Skeleton } from '../components/ui'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation, staff, type NavigationItem } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import pageStyles from './pages/Page.module.css'
import { PendingPage } from './pages/PendingPage'
import { IndexRedirect, RequireRole } from './pages/RequireRole'
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage'
import { CustomersPage } from '../features/customers/CustomersPage'
import { NewCustomerDialog } from '../features/customers/NewCustomerDialog'
import { OverviewPage } from '../features/overview/OverviewPage'
import { TeamPage } from '../features/team/TeamPage'
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

const customerChildren: RouteObject[] = [
  {
    // La lista sigue montada bajo el diálogo de alta (`nuevo`), que se pinta en su `Outlet`.
    element: <CustomersPage />,
    children: [
      { index: true },
      { path: 'nuevo', element: <NewCustomerDialog />, handle: { crumb: 'Nuevo cliente' } satisfies RouteHandle },
    ],
  },
  // El `crumb` recibe solo los parámetros de la ruta, no el cliente cargado: el nombre no está disponible aquí.
  { path: ':id', element: <CustomerDetailPage />, handle: { crumb: 'Detalle del cliente' } satisfies RouteHandle },
]

/**
 * La lista de conocimiento se carga bajo demanda, igual que el lector y el editor que vendrán: así `react-markdown`
 * queda fuera del paquete principal. `nuevo` y los artículos muestran la vista pendiente hasta que existan.
 */
const knowledgeChildren = (item: NavigationItem): RouteObject[] => [
  {
    index: true,
    lazy: async () => ({ Component: (await import('../features/knowledge/KnowledgePage')).KnowledgePage }),
  },
  {
    path: 'nuevo',
    element: (
      <RequireRole
        roles={staff}
        title="Nuevo artículo"
        description="Solo los agentes y administradores pueden escribir artículos."
      >
        <PendingPage title="Nuevo artículo" icon={item.icon} />
      </RequireRole>
    ),
    handle: { crumb: 'Nuevo artículo' } satisfies RouteHandle,
  },
  {
    path: ':slug',
    element: <PendingPage title="Artículo" icon={item.icon} />,
    handle: { crumb: 'Artículo' } satisfies RouteHandle,
  },
]

/**
 * `/configuracion/permisos` es el destino del aviso «Permisos por rol» de Equipo. La página aún no existe: muestra la
 * misma vista pendiente que las secciones sin construir. La guardia es la de `/configuracion`.
 */
const settingsChildren = (item: NavigationItem): RouteObject[] => [
  { index: true, element: <PendingPage title={item.label} icon={item.icon} /> },
  {
    path: 'permisos',
    element: <PendingPage title="Permisos por rol" icon={item.icon} />,
    handle: { crumb: 'Permisos por rol' } satisfies RouteHandle,
  },
]

/** Todas las secciones salen de `mainNavigation`; las que aún no tienen vista muestran «Vista en construcción». */
const sectionRoutes: RouteObject[] = mainNavigation.map((item) =>
  item.to === '/'
    ? sectionRoute(item, { element: <OverviewPage /> })
    : item.to === '/tickets'
      ? sectionRoute(item, { children: ticketChildren })
      : item.to === '/clientes'
        ? sectionRoute(item, { children: customerChildren })
        : item.to === '/equipo'
          ? sectionRoute(item, { element: <TeamPage /> })
          : item.to === '/conocimiento'
            ? sectionRoute(item, { children: knowledgeChildren(item) })
            : item.to === '/configuracion'
              ? sectionRoute(item, { children: settingsChildren(item) })
              : sectionRoute(item, { element: <PendingPage title={item.label} icon={item.icon} /> }),
)

/** Rutas de la aplicación; se exportan para probar el cableado real (guardias y redirecciones) sin navegador. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    // Una ruta `lazy` en una carga directa deja el router sin inicializar: sin esto no se pinta nada hasta que llega el chunk.
    hydrateFallbackElement: (
      <div className={pageStyles.page}>
        <Skeleton lines={3} label="Cargando…" />
      </div>
    ),
    children: [...sectionRoutes, { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } }],
  },
  {
    path: '/catalogo',
    lazy: async () => ({ Component: (await import('./catalog/CatalogPage')).default }),
  },
]

export const router = createBrowserRouter(appRoutes)
