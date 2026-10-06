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

/**
 * `type` de los Problems que el cliente distingue (docs/api/README.md). Se compara siempre por `type`, nunca por el
 * `detail`, que es texto en español para personas y puede cambiar. Son identificadores, no direcciones.
 */
export const PROBLEM_TYPES = {
  /** 403: la escritura no trae un token CSRF válido. */
  csrf: 'https://resolve.example/problems/csrf',
  /** 401: la membresía se retiró o el cliente se archivó. */
  accessDeactivated: 'https://resolve.example/problems/access-deactivated',
  /** 401: el proveedor autenticó a la persona, pero no tiene ninguna membresía. */
  noMembership: 'https://resolve.example/problems/no-membership',
  /** 409: la organización que la pantalla mostraba al componer la escritura ya no es la de la sesión; nada se escribió. */
  organizationMismatch: 'https://resolve.example/problems/organization-mismatch',
} as const

/** Cabecera con la organización que muestra la pantalla que compone la escritura (opcional en el contrato). */
export const ORGANIZATION_HEADER = 'X-Organization-Id'

/**
 * Las dos escrituras que no la llevan: la que elige la organización de la sesión y la que cierra la sesión. El backend
 * las ignora; enviársela a la primera sería comparar con la organización que va a dejar de serlo.
 */
const WITHOUT_ORGANIZATION = new Set(['/session/organization', '/logout'])

/** Ruta de la API de una petición, sin el prefijo `/api` (`/me`, `/tickets/1046/messages`…). */
const apiPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api(?=\/|$)/, '')

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
 * Lo que `features/session` registra (esta capa no importa de ella):
 * - `identity`: la sesión que muestra la pantalla ahora (`identityOf`), o `null` sin sesión;
 * - `organization`: el id de la organización que muestra la pantalla, o `null` sin sesión: la que cada escritura envía en
 *   `X-Organization-Id`;
 * - `observe`: recibe el `Me` que devolvió el `GET /me` del reintento de CSRF, para que la aplicación se ponga al día sin
 *   esperar al canal si no coincide con la suya;
 * - `refresh`: relee `/me` y descarta lo abierto si la sesión cambió; lo llama una escritura que el backend rechazó por
 *   organización.
 */
export interface SessionWatch {
  identity: () => string | null
  organization: () => string | null
  observe: (me: Me) => void
  refresh: () => void
}
let sessionWatch: SessionWatch | null = null

/** Registra (o quita, con `null`) lo que el reintento de CSRF consulta de la sesión. */
export function setSessionWatch(watch: SessionWatch | null) {
  sessionWatch = watch
}

/**
 * La respuesta de una escritura que no debe publicarse porque la sesión cambió: un 409 con el motivo. La da el cliente sin
 * tocar la red (la guardia, el reintento de CSRF) o sustituye a la del backend cuando este la rechaza por organización:
 * quien llama ve lo mismo en los tres casos. No lleva el `type` de organización: la del reintento de CSRF sale de `fetch` y
 * pasa por `organizationMismatch`, que no debe tratarla como un rechazo del backend y pedir otra lectura de `/me`.
 */
function sessionChangedResponse(): Response {
  return new Response(
    JSON.stringify({ status: 409, title: 'La sesión cambió', detail: SESSION_CHANGED_DETAIL } satisfies Problem),
    { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

/**
 * Cada escritura lleva la organización que la pantalla muestra **al componerla**, para que el backend la compare con la de
 * la sesión y la rechace sin efecto si otra pestaña ya la cambió. Va la primera de las que se registran: la guardia de
 * sesión (`sessionGuard`) puede esperar una comprobación en vuelo, y para entonces la pantalla ya puede mostrar otra
 * organización; la que cuenta es la de cuando la persona la envió. Sin sesión cargada no hay organización y no se envía.
 */
const organizationHeader: Middleware = {
  onRequest({ request }) {
    if (!UNSAFE_METHODS.has(request.method) || WITHOUT_ORGANIZATION.has(apiPath(request))) return undefined
    const organization = sessionWatch?.organization()
    if (organization) request.headers.set(ORGANIZATION_HEADER, organization)
    return request
  },
}

/**
 * El 409 con el tipo de organización distinta es el aviso de sesión cambiada de siempre: la escritura no salió, la pantalla
 * mostraba otra organización. Se reemplaza por la misma respuesta que da la guardia y se pide a la aplicación que se ponga
 * al día sin esperar al canal ni al foco.
 */
const organizationMismatch: Middleware = {
  async onResponse({ response }) {
    if (response.status !== 409) return undefined
    try {
      const problem = (await response.clone().json()) as Problem
      if (problem.type !== PROBLEM_TYPES.organizationMismatch) return undefined
    } catch {
      return undefined
    }
    sessionWatch?.refresh()
    return sessionChangedResponse()
  },
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
      const detail: UnauthorizedDetail = { method: request.method, path: apiPath(request) }
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail }))
    }
    return undefined
  },
}

async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  try {
    const problem = (await response.clone().json()) as Problem
    return problem.type === PROBLEM_TYPES.csrf
  } catch {
    return false
  }
}

/**
 * Envía la petición y reintenta **una sola vez** una escritura rechazada por falta de token CSRF, que se reconoce por el
 * `type` del Problem (nunca por su texto). Justo tras iniciar sesión la cookie aún no existe hasta el primer GET, y un
 * token puede caducar: se relee `/me` para que el navegador reciba la cookie y se reenvía la escritura con ella. Un 403
 * de otra cosa (el rol, p. ej.) llega tal cual, sin releer nada. El segundo intento no se vigila: un segundo 403 llega
 * tal cual a quien llamó, nunca hay bucle. Sin cookie tras releer `/me` se devuelve el 403 original.
 */
async function fetchWithCsrfRetry(request: Request): Promise<Response> {
  if (!UNSAFE_METHODS.has(request.method)) return globalThis.fetch(request)
  // La sesión con la que la pantalla compuso la escritura: es con la que se compara tras releer `/me`, no con la de ese
  // momento (la pestaña pudo ponerse al día entre tanto y entonces la comparación daría «misma sesión»).
  const sentAs = sessionWatch?.identity() ?? null
  // El cuerpo se lee una sola vez y cada envío (el primero y el posible reintento) se construye desde ese buffer. Nada de
  // `request.clone()`: un clon que se descarta sin 403 deja inutilizable el cuerpo de la original cuando undici (Node,
  // los tests) lo recolecta, y el test que lo lee falla de forma intermitente bajo carga.
  const body = request.body === null ? null : await request.arrayBuffer()
  // Todas las opciones de la petición original, no solo las que hoy usa el cliente: `new Request(url, init)` parte de los
  // valores por defecto, y lo que no se copia (`keepalive`, `cache`, `mode`, `referrer`, `referrerPolicy`, `integrity`,
  // `priority`) se perdería sin que nada fallara si una llamada lo usara.
  const build = (headers: Headers) =>
    new Request(request.url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      credentials: request.credentials,
      redirect: request.redirect,
      mode: request.mode,
      cache: request.cache,
      keepalive: request.keepalive,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      integrity: request.integrity,
      ...('priority' in request ? { priority: (request as Request & { priority: RequestPriority }).priority } : {}),
    })
  const response = await globalThis.fetch(build(request.headers))
  if (response.status !== 403) return response
  if (!(await isCsrfRejection(response))) return response
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
api.use(organizationHeader, sessionGuard, demoUser, csrf, organizationMismatch, unauthorized)

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
