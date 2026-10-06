import { vi } from 'vitest'

export interface MockRoute {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

type Handler = MockRoute | ((request: Request) => MockRoute | Promise<MockRoute>)

/**
 * Sustituye fetch con respuestas por «MÉTODO /ruta» (sin query string). Las peticiones no previstas fallan el test
 * con un 501 para que no pasen desapercibidas. Devuelve el espía para inspeccionar las llamadas.
 */
export function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost'), init)
    const url = new URL(request.url)
    const key = `${request.method} ${url.pathname}`
    const handler = routes[key]
    if (!handler) {
      return new Response(JSON.stringify({ status: 501, title: `Sin mock para ${key}` }), {
        status: 501,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    }
    const route = typeof handler === 'function' ? await handler(request) : handler
    const status = route.status ?? 200
    const isProblem = status >= 400
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status,
      headers: { 'Content-Type': isProblem ? 'application/problem+json' : 'application/json', ...route.headers },
    })
  })
}

export const adminMe = {
  user: { id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example' },
  organization: { id: 'org-1', name: 'Acme Studio', timeZone: 'America/Bogota', supportEmail: null, demo: false },
  role: 'admin',
  customerId: null,
}

export const customerMe = {
  user: { id: 'u-maria', name: 'María Pérez', email: 'maria@cliente.example' },
  organization: { id: 'org-1', name: 'Acme Studio', timeZone: 'America/Bogota', supportEmail: null, demo: false },
  role: 'customer',
  customerId: 'c-maria',
}
