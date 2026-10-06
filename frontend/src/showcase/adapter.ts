import { dispatchMock } from '../../e2e/mocks/api'
import type { MockFeature, MockPlaywrightRequest, MockRoute } from '../../e2e/mocks/shared'

type FulfillOptions = NonNullable<Parameters<MockRoute['fulfill']>[0]>

/** Estados que, por especificación, no admiten cuerpo: `new Response('', { status: 204 })` lanza. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/**
 * `set-cookie` es una cabecera prohibida en una `Response` construida a mano: se descartaría y el navegador nunca
 * recibiría la cookie del token CSRF. Se separa de las demás y se entrega a `setCookie`, que la escribe en el documento.
 */
function toResponse(options: FulfillOptions, setCookie: (cookie: string) => void): Response {
  const status = options.status ?? 200
  const headers = new Headers(options.headers)
  const cookie = headers.get('set-cookie')
  if (cookie) {
    setCookie(cookie)
    headers.delete('set-cookie')
  }
  if (options.contentType) headers.set('content-type', options.contentType)
  const raw = options.json !== undefined ? JSON.stringify(options.json) : options.body
  const body = NULL_BODY_STATUSES.has(status) || raw === undefined || raw.length === 0 ? null : raw.toString()
  return new Response(body, { status, headers })
}

export interface ApiCall {
  features: MockFeature[]
  request: Request
  /** Dirección pública de la aplicación sin barra final (`https://yelison.github.io/resolve`). */
  appUrl: string
  setCookie: (cookie: string) => void
}

/**
 * Responde una petición a `/api` con los mismos manejadores que los e2e. Construye el objeto con la forma de `Route` que
 * esos manejadores esperan (`fulfill`, y una petición con `method`, `url`, `headers` y `postDataJSON` síncronos) sobre
 * `Request` y `Response`. Una petición que ningún manejador atiende recibe el 501 del despachador.
 */
export async function respondToApi({ features, request, appUrl, setCookie }: ApiCall): Promise<Response> {
  const url = new URL(request.url)
  const text = request.body === null ? '' : await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value
  })

  let response: Response | null = null
  const route: MockRoute = {
    fulfill: (options = {}) => {
      response = toResponse(options, setCookie)
      return Promise.resolve()
    },
  }
  const mockRequest: MockPlaywrightRequest = {
    method: () => request.method,
    url: () => request.url,
    headers: () => headers,
    postDataJSON: () => (text ? JSON.parse(text) : null),
  }
  await dispatchMock(features, {
    route,
    request: mockRequest,
    url,
    appUrl,
    path: url.pathname.replace(/^\/api(?=\/|$)/, ''),
    method: request.method,
  })
  // `dispatchMock` siempre responde (501 si nadie atiende); el respaldo solo cubre un manejador que no llama a `fulfill`.
  return response ?? new Response(null, { status: 501 })
}

/** ¿Es una petición a la API simulada (`/api/...` del mismo origen)? */
export const isApiUrl = (url: URL, origin: string) => url.origin === origin && /^\/api(\/|$)/.test(url.pathname)
