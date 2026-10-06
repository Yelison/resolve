import { test as base, type Page } from '@playwright/test'
import type { Me } from '../src/api/schema'
import { createMockFeatures, dispatchMock } from './mocks/api'
import type { ArticleStore } from './mocks/knowledge'
import type { SessionOptions } from './mocks/session'

export { articles, createArticleStore } from './mocks/knowledge'
export { customers } from './mocks/customers'
export { me } from './mocks/session'
export { team } from './mocks/team'
export { tickets } from './mocks/tickets'

/**
 * API simulada para las pruebas e2e deterministas: respuestas tipadas con el contrato (src/api/schema.ts), así que
 * si el contrato cambia, estas fixtures dejan de compilar. La prueba con backend real va aparte.
 *
 * Los datos y manejadores de cada feature viven en `e2e/mocks/<feature>.ts` y se reúnen en `mocks/api.ts`; aquí solo se
 * enganchan a Playwright. Una feature nueva añade su módulo y lo incorpora a la lista de `createMockFeatures`.
 */

/** Ver `createMockFeatures` para `role` y `options`. */
export async function mockApi(
  page: Page,
  role: Me['role'] = 'admin',
  options: { articleStore?: ArticleStore } & SessionOptions = {},
) {
  const features = createMockFeatures(role, options)

  // En el contexto y no en la página: una ventana que abre la aplicación (el inicio de sesión en otra pestaña) también la usa.
  // Las rutas de página de cada test siguen teniendo prioridad.
  // Por ruta y no con `**/api/**`: el servidor de desarrollo sirve módulos como `/src/api/client.ts`, que no son la API.
  await page.context().route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/^\/api/, '')
      await dispatchMock(features, { route, request, url, appUrl: url.origin, path, method: request.method() })
    },
  )
}

/** Test con la API simulada en cada página. */
export const test = base.extend({
  page: async ({ page }, run) => {
    await mockApi(page)
    await run(page)
  },
})

export { expect } from '@playwright/test'
