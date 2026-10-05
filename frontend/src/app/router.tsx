import type { ComponentType, ReactNode } from 'react'
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
import { ReportsPage } from '../features/reports/ReportsPage'
import { TeamPage } from '../features/team/TeamPage'
import { NewTicketPage } from '../features/tickets/NewTicketPage'
import { TicketDetailPage } from '../features/tickets/TicketDetailPage'
import { TicketsPage } from '../features/tickets/TicketsPage'

/**
 * Esqueleto que se pinta dentro del contenido mientras llega el chunk de una ruta diferida. React Router sustituye el
 * elemento de la ruta que declara el fallback (y todo lo de debajo), no el de las de arriba: por eso va en la propia
 * ruta `lazy` y no en la raíz, donde sustituiría a la shell entera.
 */
const lazyFallback = (
  <div className={pageStyles.page}>
    <Skeleton lines={3} label="Cargando…" />
  </div>
)

/**
 * Ruta diferida con su fallback. Toda ruta `lazy` debe declararse así: sin `hydrateFallbackElement`, una carga directa
 * deja la app en blanco y React Router avisa en la consola.
 */
function lazyRoute(load: () => Promise<{ Component: ComponentType }>, route: RouteObject = {}): RouteObject {
  return { ...route, lazy: load, hydrateFallbackElement: lazyFallback } as RouteObject
}

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
 * Las vistas de conocimiento se cargan bajo demanda: así `react-markdown` queda fuera del paquete principal. `nuevo` y
 * `editar` son estáticos y el servidor reserva esos slugs, de modo que no pueden chocar con un artículo. La guardia de
 * personal oculta la interfaz del editor a un cliente, pero React Router resuelve `lazy` al casar la ruta: el paquete
 * del editor se descarga igualmente y los datos los protege el servidor.
 */
const knowledgeChildren = (): RouteObject[] => {
  const editor = (title: string, crumb: string) => ({
    element: (
      <RequireRole
        roles={staff}
        title={title}
        description="Solo los agentes y administradores pueden escribir artículos."
      >
        <Outlet />
      </RequireRole>
    ),
    handle: { crumb } satisfies RouteHandle,
    children: [
      lazyRoute(
        async () => ({ Component: (await import('../features/knowledge/ArticleEditorPage')).ArticleEditorPage }),
        {
          index: true,
        },
      ),
    ],
  })
  return [
    lazyRoute(async () => ({ Component: (await import('../features/knowledge/KnowledgePage')).KnowledgePage }), {
      index: true,
    }),
    { path: 'nuevo', ...editor('Nuevo artículo', 'Nuevo artículo') },
    {
      path: ':slug',
      // El `crumb` recibe solo los parámetros de la ruta, no el artículo cargado: el título no está disponible aquí.
      handle: { crumb: 'Artículo' } satisfies RouteHandle,
      children: [
        lazyRoute(async () => ({ Component: (await import('../features/knowledge/ArticlePage')).ArticlePage }), {
          index: true,
        }),
        { path: 'editar', ...editor('Editar artículo', 'Editar') },
      ],
    },
  ]
}

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
            ? sectionRoute(item, { children: knowledgeChildren() })
            : item.to === '/reportes'
              ? sectionRoute(item, { element: <ReportsPage /> })
              : item.to === '/configuracion'
                ? sectionRoute(item, { children: settingsChildren(item) })
                : sectionRoute(item, { element: <PendingPage title={item.label} icon={item.icon} /> }),
)

/** Rutas de la aplicación; se exportan para probar el cableado real (guardias y redirecciones) sin navegador. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [...sectionRoutes, { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } }],
  },
  lazyRoute(async () => ({ Component: (await import('./catalog/CatalogPage')).default }), { path: '/catalogo' }),
]

export const router = createBrowserRouter(appRoutes)
