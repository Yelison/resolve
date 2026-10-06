import type { Me } from '../../src/api/schema'
import { customersMock } from './customers'
import { knowledgeMock, type ArticleStore } from './knowledge'
import { reportsMock } from './reports'
import { sessionMock, type SessionOptions } from './session'
import { settingsMock } from './settings'
import { json, type MockFeature, type MockRequest } from './shared'
import { teamMock } from './team'
import { ticketsMock } from './tickets'

/**
 * Las features de la API simulada y el despachador que las recorre. Lo comparten los e2e (`fixtures.ts`, que lo engancha
 * a `page.route`) y la demostración estática (`src/showcase`, que lo engancha a `fetch`): no hay una segunda copia de los
 * datos ni del orden de los manejadores. No importa nada de Playwright como valor.
 */

/**
 * `role` es el de la sesión simulada; las features que dependen de él (sesión, conocimiento) lo reciben.
 * `options.articleStore` reutiliza el estado de otra llamada (un `createArticleStore()` del test): cambiar de rol sobre
 * la misma página, como al abrir la sesión de un cliente, sigue viendo lo que el equipo acaba de publicar. El resto de
 * `options` ajusta cómo arranca la sesión (sin iniciar, varias organizaciones, nombres largos, cuenta desactivada).
 * El estado se crea en cada llamada, nunca en el módulo.
 */
export function createMockFeatures(
  role: Me['role'] = 'admin',
  options: { articleStore?: ArticleStore } & SessionOptions = {},
): MockFeature[] {
  const customers = customersMock()
  const settings = settingsMock(role)
  return [
    // La sesión va primero (gana el primer manejador): sirve `/me`, el cierre de sesión y la elección de organización
    // a partir del `Me` que cambian los ajustes, que van justo después con el resto de `/me` (PATCH) y `/organization`.
    sessionMock(role, options, settings.session),
    settings,
    knowledgeMock(role, options.articleStore),
    reportsMock(),
    ticketsMock(customers.customerRef),
    teamMock(),
    customers,
  ]
}

/** Responde con el primer manejador que atiende la petición; si ninguno lo hace, 501 con la ruta que faltó. */
export function dispatchMock(features: MockFeature[], request: MockRequest): Promise<void> {
  for (const feature of features) {
    const handled = feature.handle(request)
    if (handled) return handled
  }
  return json(request.route, { status: 501, title: `Sin fixture para ${request.method} ${request.path}` }, 501)
}
