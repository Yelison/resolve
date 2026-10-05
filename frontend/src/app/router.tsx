import type { ComponentType, ReactNode } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { Skeleton } from '../components/ui'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation, type NavigationItem } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import pageStyles from './pages/Page.module.css'
import { PendingPage } from './pages/PendingPage'
import { IndexRedirect, RequireRole } from './pages/RequireRole'
import { customersRoutes } from '../features/customers/routes'
import { knowledgeRoutes } from '../features/knowledge/routes'
import { overviewRoutes } from '../features/overview/routes'
import { reportsRoutes } from '../features/reports/routes'
import { teamRoutes } from '../features/team/routes'
import { ticketsRoutes } from '../features/tickets/routes'

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

/** Contenido de una sección: una vista, o rutas hijas que la guardia envuelve con un `Outlet`. */
export type SectionContent = { element: ReactNode; children?: never } | { children: RouteObject[]; element?: never }

/** Lo que recibe una feature al declarar sus rutas; `lazyRoute` va por parámetro para no crear un ciclo de importación. */
export interface FeatureRoutesContext {
  item: NavigationItem
  lazyRoute: typeof lazyRoute
}

/** Rutas que una feature aporta a su sección de la navegación (`features/<feature>/routes.tsx`). */
export type FeatureRoutes = (context: FeatureRoutesContext) => SectionContent

/**
 * Registro de secciones: asocia la ruta de cada entrada de `navigation.ts` con las rutas de su feature. Una sección
 * sin entrada aquí muestra «Vista en construcción».
 */
const featureRoutes: Record<string, FeatureRoutes> = {
  '/': overviewRoutes,
  '/tickets': ticketsRoutes,
  '/clientes': customersRoutes,
  '/equipo': teamRoutes,
  '/conocimiento': knowledgeRoutes,
  '/reportes': reportsRoutes,
}

/**
 * Secciones sin feature que, aun así, declaran rutas hijas pendientes. Al construir una, se registra en
 * `featureRoutes` y se borra de aquí junto con sus rutas pendientes.
 */
const pendingRoutes: Record<string, FeatureRoutes> = {
  '/configuracion': ({ item }) => ({ children: settingsChildren(item) }),
}

/** ¿La sección `to` ya tiene su feature? Las pruebas lo usan para saber cuáles siguen mostrando la vista pendiente. */
export const hasFeatureRoutes = (to: string) => to in featureRoutes

/** Todas las secciones salen de `mainNavigation`; las que aún no tienen vista muestran «Vista en construcción». */
const sectionRoutes: RouteObject[] = mainNavigation.map((item) =>
  sectionRoute(
    item,
    (featureRoutes[item.to] ?? pendingRoutes[item.to])?.({ item, lazyRoute }) ?? {
      element: <PendingPage title={item.label} icon={item.icon} />,
    },
  ),
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
