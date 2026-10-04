import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell, type RouteHandle } from './layout/AppShell'
import { mainNavigation } from './navigation'
import { NotFoundPage } from './pages/NotFoundPage'
import { PendingPage } from './pages/PendingPage'

const sectionRoutes: RouteObject[] = mainNavigation.map((item) => {
  const handle: RouteHandle = { crumb: item.label }
  const element = <PendingPage title={item.label} icon={item.icon} />
  return item.to === '/' ? { index: true, element, handle } : { path: item.to.slice(1), element, handle }
})

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [...sectionRoutes, { path: '*', element: <NotFoundPage />, handle: { crumb: 'No encontrada' } }],
  },
  {
    path: '/catalogo',
    lazy: async () => ({ Component: (await import('./catalog/CatalogPage')).default }),
  },
])
