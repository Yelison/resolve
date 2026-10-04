import createClient, { type Middleware } from 'openapi-fetch'
import type { paths, Problem } from './schema'

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

/** Clave de almacenamiento del usuario de demostración (solo en desarrollo, ver docs/api). */
export const DEMO_USER_STORAGE_KEY = 'resolve-demo-user'

/**
 * En desarrollo, el backend acepta X-Demo-User para elegir un usuario sembrado. En producción no existe
 * autenticación todavía y la API responde 401.
 */
const demoUser: Middleware = {
  onRequest({ request }) {
    if (!import.meta.env.DEV) return request
    try {
      const email = localStorage.getItem(DEMO_USER_STORAGE_KEY)
      if (email) request.headers.set('X-Demo-User', email)
    } catch {
      // Sin almacenamiento se usa el usuario de demostración por defecto del backend.
    }
    return request
  },
}

// URL absoluta: el navegador resuelve la relativa, pero Request de Node (tests) no.
export const api = createClient<paths>({
  baseUrl: new URL('/api', window.location.origin).href,
  // Se resuelve en cada llamada (no al importar), así los tests y las herramientas pueden sustituir fetch.
  fetch: (request) => globalThis.fetch(request),
})
api.use(demoUser)

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
