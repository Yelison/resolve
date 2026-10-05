import { test as base, type Page } from '@playwright/test'
import type { Me } from '../src/api/schema'
import { customersMock } from './mocks/customers'
import { knowledgeMock } from './mocks/knowledge'
import { reportsMock } from './mocks/reports'
import { sessionMock } from './mocks/session'
import { json, type MockFeature } from './mocks/shared'
import { teamMock } from './mocks/team'
import { ticketsMock } from './mocks/tickets'

export { articles } from './mocks/knowledge'
export { customers } from './mocks/customers'
export { me } from './mocks/session'
export { team } from './mocks/team'
export { tickets } from './mocks/tickets'

/**
 * API simulada para las pruebas e2e deterministas: respuestas tipadas con el contrato (src/api/schema.ts), así que
 * si el contrato cambia, estas fixtures dejan de compilar. La prueba con backend real va aparte.
 *
 * Los datos y manejadores de cada feature viven en `e2e/mocks/<feature>.ts`; aquí solo se reúnen. Una feature nueva
 * añade su módulo y lo incorpora a la lista de `mockApi`. El estado se crea en cada llamada, nunca en el módulo.
 */

/**
 * `role` es el de la sesión simulada; las features que dependen de él (sesión, conocimiento) lo reciben.
 */
export async function mockApi(page: Page, role: Me['role'] = 'admin') {
  const customers = customersMock()
  const features: MockFeature[] = [
    sessionMock(role),
    knowledgeMock(role),
    reportsMock(),
    ticketsMock(customers.customerRef),
    teamMock(),
    customers,
  ]

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = request.method()

    for (const feature of features) {
      const handled = feature.handle({ route, request, url, path, method })
      if (handled) return handled
    }
    return json(route, { status: 501, title: `Sin fixture para ${method} ${path}` }, 501)
  })
}

/** Test con la API simulada en cada página. */
export const test = base.extend({
  page: async ({ page }, run) => {
    await mockApi(page)
    await run(page)
  },
})

export { expect } from '@playwright/test'
