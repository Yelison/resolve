import { Outlet, type RouteObject } from 'react-router'
import type { FeatureRoutes } from '../../app/router'
import type { RouteHandle } from '../../app/layout/AppShell'
import { staff } from '../../app/navigation'
import { RequireRole } from '../../app/pages/RequireRole'

/**
 * Las vistas de conocimiento se cargan bajo demanda: así `react-markdown` queda fuera del paquete principal. `nuevo` y
 * `editar` son estáticos y el servidor reserva esos slugs, de modo que no pueden chocar con un artículo. La guardia de
 * personal oculta la interfaz del editor a un cliente, pero React Router resuelve `lazy` al casar la ruta: el paquete
 * del editor se descarga igualmente y los datos los protege el servidor.
 *
 * `lazyRoute` llega por parámetro: importarlo del router crearía un ciclo `app` ↔ `features`.
 */
export const knowledgeRoutes: FeatureRoutes = ({ lazyRoute }) => {
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
      lazyRoute(async () => ({ Component: (await import('./ArticleEditorPage')).ArticleEditorPage }), {
        index: true,
      }),
    ],
  })
  const children: RouteObject[] = [
    lazyRoute(async () => ({ Component: (await import('./KnowledgePage')).KnowledgePage }), { index: true }),
    { path: 'nuevo', ...editor('Nuevo artículo', 'Nuevo artículo') },
    {
      path: ':slug',
      // El `crumb` recibe solo los parámetros de la ruta, no el artículo cargado: el título no está disponible aquí.
      handle: { crumb: 'Artículo' } satisfies RouteHandle,
      children: [
        lazyRoute(async () => ({ Component: (await import('./ArticlePage')).ArticlePage }), { index: true }),
        { path: 'editar', ...editor('Editar artículo', 'Editar') },
      ],
    },
  ]
  return { children }
}
