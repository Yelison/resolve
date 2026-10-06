import type { ComponentType, ReactNode } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { Skeleton } from '../components/ui'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation, type NavigationItem } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import pageStyles from './pages/Page.module.css'
import { IndexRedirect, RequireRole } from './pages/RequireRole'
import { customersRoutes } from '../features/customers/routes'
import { knowledgeRoutes } from '../features/knowledge/routes'
import { overviewRoutes } from '../features/overview/routes'
import { reportsRoutes } from '../features/reports/routes'
import { sessionRoutes } from '../features/session/routes'
import { settingsRoutes } from '../features/settings/routes'
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
 * Registro de secciones: asocia la ruta de cada entrada de `navigation.ts` con las rutas de su feature. Toda entrada de
 * la navegación necesita la suya.
 */
const featureRoutes: Record<string, FeatureRoutes> = {
  '/': overviewRoutes,
  '/tickets': ticketsRoutes,
  '/clientes': customersRoutes,
  '/equipo': teamRoutes,
  '/conocimiento': knowledgeRoutes,
  '/reportes': reportsRoutes,
  '/configuracion': settingsRoutes,
}

/** Todas las secciones salen de `mainNavigation`. */
const sectionRoutes: RouteObject[] = mainNavigation.map((item) => {
  const routes = featureRoutes[item.to]
  if (!routes) throw new Error(`La sección ${item.to} no tiene rutas registradas en featureRoutes`)
  return sectionRoute(item, routes({ item, lazyRoute }))
})

/** Rutas de la aplicación; se exportan para probar el cableado real (guardias y redirecciones) sin navegador. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [...sectionRoutes, { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } }],
  },
  ...sessionRoutes,
  lazyRoute(async () => ({ Component: (await import('./catalog/CatalogPage')).default }), { path: '/catalogo' }),
]

// La demostración estática vive bajo `/resolve/` (GitHub Pages); en cualquier otro modo no hay base.
export const router = createBrowserRouter(
  appRoutes,
  import.meta.env.MODE === 'showcase' ? { basename: import.meta.env.BASE_URL.replace(/\/$/, '') } : undefined,
)
