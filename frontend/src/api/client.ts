import createClient, { type Middleware } from 'openapi-fetch'
import type { Me, paths, Problem } from './schema'

/** Error de la API con su Problem Details (RFC 9457). */
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }

  /** Mensaje de un campo concreto en un error de validación. */
  fieldError(field: string): string | undefined {
    return this.problem.errors?.find((error) => error.field === field)?.message
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status)
}

/** Clave de almacenamiento del usuario de demostración (solo en desarrollo y en el build `smoke`, ver docs/api). */
export const DEMO_USER_STORAGE_KEY = 'resolve-demo-user'

/** Evento de `window` que avisa de un cambio de usuario de demostración. */
export const DEMO_USER_EVENT = 'resolve:demo-user'

/**
 * Elige el usuario de demostración (`null` vuelve al predeterminado del backend) y avisa del cambio para que la
 * caché de consultas del usuario anterior no se mezcle con la del nuevo. Solo tiene efecto en desarrollo y en el build `smoke`.
 */
export function setDemoUser(email: string | null) {
  try {
    if (email) localStorage.setItem(DEMO_USER_STORAGE_KEY, email)
    else localStorage.removeItem(DEMO_USER_STORAGE_KEY)
  } catch {
    // Sin almacenamiento no hay usuario que recordar; el evento se emite igualmente.
  }
  window.dispatchEvent(new Event(DEMO_USER_EVENT))
}

/**
 * En desarrollo y en el build `smoke` de la prueba full-stack, el backend con perfil `dev` acepta X-Demo-User para
 * elegir un usuario sembrado. En cualquier otro modo (`production` y cualquier otro que se invente) no existe
 * autenticación de demostración. Es una puerta de seguridad con lista de permitidos: DEV y el modo se sustituyen en el
 * build, así que fuera de esos casos el minificador elimina este bloque entero (y la clave de almacenamiento con él).
 * La misma condición, escrita en el propio punto de uso, protege el selector de usuarios de `features/session`
 * (`AccountMenu` y `LoginPage`): una función compartida no se evalúa en el build y dejaría la cabecera, la clave y los
 * correos en el bundle de producción. No la cambies por una variable de entorno en runtime.
 */
const demoUser: Middleware = {
  onRequest({ request }) {
    if (!(import.meta.env.DEV || import.meta.env.MODE === 'smoke')) return request
    try {
      const email = localStorage.getItem(DEMO_USER_STORAGE_KEY)
      if (email) request.headers.set('X-Demo-User', email)
    } catch {
      // Sin almacenamiento se usa el usuario de demostración por defecto del backend.
    }
    return request
  },
}

/** Nombre de la cookie con el token CSRF (legible, `SameSite=Lax`) y de la cabecera que debe llevar su valor. */
export const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'

/** `detail` con el que el backend rechaza una petición sin token CSRF válido; el título es el de cualquier 403. */
export const CSRF_REJECTION_DETAIL = 'Falta el token CSRF o no es válido.'

/** Evento de `window` que avisa de un 401 de la API. Su `detail` es un {@link UnauthorizedDetail}. */
export const UNAUTHORIZED_EVENT = 'resolve:unauthorized'

export interface UnauthorizedDetail {
  /** Método HTTP de la petición que recibió el 401. */
  method: string
  /** Ruta de la API sin el prefijo `/api` (`/me`, `/tickets/1046/messages`…). */
  path: string
}

const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/** Valor de la cookie `XSRF-TOKEN`, o `null` si el navegador aún no la tiene (hasta el primer GET tras iniciar sesión). */
export function readCsrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator !== -1 && part.slice(0, separator).trim() === CSRF_COOKIE) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim())
      } catch {
        return part.slice(separator + 1).trim()
      }
    }
  }
  return null
}

/** Reenvía el token CSRF en las peticiones que cambian datos. Sin cookie (sin sesión OIDC) no añade nada. */
const csrf: Middleware = {
  onRequest({ request }) {
    const token = UNSAFE_METHODS.has(request.method) ? readCsrfToken() : null
    if (token) request.headers.set(CSRF_HEADER, token)
    return request
  },
}

/** Explica por qué una escritura no salió: la sesión cambió en otra pestaña mientras se comprobaba. */
export const SESSION_CHANGED_DETAIL =
  'Tu sesión cambió en otra pestaña (otra persona u otra organización). Lo que ibas a enviar no se envió: revisa lo que ves y repítelo.'

/**
 * Comprobación de la sesión que la aplicación puede tener en vuelo: resuelve a `true` si la persona o la organización
 * cambiaron. La registra `features/session` (esta capa no importa de ella).
 */
export type WriteGuard = () => Promise<boolean>
let writeGuard: WriteGuard | null = null

/** Registra (o quita, con `null`) la comprobación que las escrituras esperan antes de salir. */
export function setWriteGuard(guard: WriteGuard | null) {
  writeGuard = guard
}

/** Identidad de una sesión: persona y organización. Es lo que cambia cuando la sesión «es otra». */
export const identityOf = (me: Me) => `${me.user.id}:${me.organization.id}`

/**
 * Lo que `features/session` registra para el reintento de CSRF (esta capa no importa de ella):
 * - `identity`: la sesión que muestra la pantalla ahora (`identityOf`), o `null` sin sesión;
 * - `observe`: recibe el `Me` que devolvió el `GET /me` del reintento, para que la aplicación se ponga al día sin esperar
 *   al canal si no coincide con la suya.
 */
export interface SessionWatch {
  identity: () => string | null
  observe: (me: Me) => void
}
let sessionWatch: SessionWatch | null = null

/** Registra (o quita, con `null`) lo que el reintento de CSRF consulta de la sesión. */
export function setSessionWatch(watch: SessionWatch | null) {
  sessionWatch = watch
}

/** La respuesta de una escritura cancelada porque la sesión cambió: un 409 con el motivo, sin tocar la red. */
function sessionChangedResponse(): Response {
  return new Response(
    JSON.stringify({ status: 409, title: 'La sesión cambió', detail: SESSION_CHANGED_DETAIL } satisfies Problem),
    { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

/**
 * Una escritura no sale mientras la sesión se está comprobando o cambiando: si al terminar la persona o la organización
 * son otras, lo que la pantalla mostraba era de la sesión anterior y enviarlo lo escribiría en la nueva. En ese caso se
 * cancela y la llamada recibe un 409 con el motivo (un `Response` devuelto por el middleware sustituye a la petición).
 * Sin comprobación en vuelo no cuesta nada.
 */
const sessionGuard: Middleware = {
  async onRequest({ request }) {
    if (!UNSAFE_METHODS.has(request.method) || !writeGuard) return undefined
    return (await writeGuard()) ? sessionChangedResponse() : undefined
  },
}

/** Avisa de cualquier 401 para que la aplicación pida volver a entrar sin que cada pantalla lo gestione. */
const unauthorized: Middleware = {
  onResponse({ request, response }) {
    if (response.status === 401) {
      const path = new URL(request.url).pathname.replace(/^\/api(?=\/|$)/, '')
      const detail: UnauthorizedDetail = { method: request.method, path }
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail }))
    }
    return undefined
  },
}

async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  try {
    const problem = (await response.clone().json()) as Problem
    return problem.detail === CSRF_REJECTION_DETAIL
  } catch {
    return false
  }
}

/**
 * Envía la petición y reintenta **una sola vez** una escritura rechazada por falta de token CSRF. Justo tras iniciar
 * sesión la cookie aún no existe hasta el primer GET: se relee `/me` para que el navegador la reciba y se reenvía la
 * escritura con ella. Se reintenta en dos casos:
 * - la escritura salió **sin** token y recibió cualquier 403 (no depende del texto del backend);
 * - salió con token y el 403 trae el `detail` de CSRF (token caducado), como respaldo mientras el Problem no tenga un
 *   `type` estable.
 * El segundo intento no se vigila: un segundo 403 llega tal cual a quien llamó, nunca hay bucle. Sin cookie tras releer
 * `/me` (p. ej. el backend de demostración, sin CSRF) se devuelve el 403 original: cuesta un GET más por cada 403 de
 * una escritura en ese modo.
 */
async function fetchWithCsrfRetry(request: Request): Promise<Response> {
  if (!UNSAFE_METHODS.has(request.method)) return globalThis.fetch(request)
  const sentWithToken = request.headers.has(CSRF_HEADER)
  // La sesión con la que la pantalla compuso la escritura: es con la que se compara tras releer `/me`, no con la de ese
  // momento (la pestaña pudo ponerse al día entre tanto y entonces la comparación daría «misma sesión»).
  const sentAs = sessionWatch?.identity() ?? null
  // El cuerpo se lee una sola vez y cada envío (el primero y el posible reintento) se construye desde ese buffer. Nada de
  // `request.clone()`: un clon que se descarta sin 403 deja inutilizable el cuerpo de la original cuando undici (Node,
  // los tests) lo recolecta, y el test que lo lee falla de forma intermitente bajo carga.
  const body = request.body === null ? null : await request.arrayBuffer()
  const build = (headers: Headers) =>
    new Request(request.url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      credentials: request.credentials,
      redirect: request.redirect,
    })
  const response = await globalThis.fetch(build(request.headers))
  if (response.status !== 403) return response
  if (sentWithToken && !(await isCsrfRejection(response))) return response
  let me: Response
  try {
    me = await globalThis.fetch(new URL('/api/me', window.location.origin))
  } catch {
    return response
  }
  // El reintento también pasa por la guardia: la respuesta de `/me` dice quién y en qué organización está la sesión
  // ahora. Si no es la que tenía la pantalla al enviar (otra pestaña cambió mientras tanto) no se reintenta y se
  // devuelve el mismo 409 que la guardia.
  if (sessionWatch && me.ok) {
    let current: Me | null = null
    try {
      const parsed = (await me.clone().json()) as Partial<Me> | null
      if (parsed?.user?.id && parsed.organization?.id) current = parsed as Me
    } catch {
      // No es JSON.
    }
    if (current) {
      sessionWatch.observe(current)
      if (sentAs !== null && identityOf(current) !== sentAs) return sessionChangedResponse()
    } else if (sentAs !== null) {
      // Un 200 que no es un `Me` (un portal cautivo, un proxy) no dice quién es la sesión: sin saberlo no se reintenta una
      // escritura hecha con la sesión de la pantalla, y quien llamó recibe el 403 original.
      return response
    }
  }
  if (writeGuard && (await writeGuard())) return sessionChangedResponse()
  const token = readCsrfToken()
  if (!token) return response
  const headers = new Headers(request.headers)
  headers.set(CSRF_HEADER, token)
  return globalThis.fetch(build(headers))
}

// URL absoluta: el navegador resuelve la relativa, pero Request de Node (tests) no.
export const api = createClient<paths>({
  baseUrl: new URL('/api', window.location.origin).href,
  // Se resuelve en cada llamada (no al importar), así los tests y las herramientas pueden sustituir fetch.
  fetch: fetchWithCsrfRetry,
})
api.use(sessionGuard, demoUser, csrf, unauthorized)

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Devuelve los datos de una respuesta correcta o lanza un {@link ApiError}. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request
  if (response.ok) return data as T
  throw new ApiError(response.status, toProblem(response, error))
}

function toProblem(response: Response, error: unknown): Problem {
  if (error && typeof error === 'object' && 'status' in error && 'title' in error) return error as Problem
  return { status: response.status, title: response.statusText || 'Error de red' }
}

/** Versión de un ETag fuerte (`"3"` → 3). */
export function versionFromEtag(etag: string | null): number | undefined {
  const match = etag?.match(/^"(\d+)"$/)
  return match ? Number(match[1]) : undefined
}

/** La interfaz numera las páginas desde 1; la API, desde 0. */
export const toApiPage = (uiPage: number) => Math.max(uiPage, 1) - 1
