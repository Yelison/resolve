import { isApiError } from '../api/client'

/**
 * Texto de un error de mutación para un `Alert`: el `detail` del Problem cuando el servidor explica la negativa (403
 * sin permiso, 404 y 409 de estado) y el aviso de conexión en cualquier otro caso.
 */
export function mutationErrorDetail(error: unknown): string {
  if (isApiError(error, 403) || isApiError(error, 404) || isApiError(error, 409)) {
    return error.problem.detail ?? error.problem.title
  }
  return 'Revisa tu conexión e inténtalo de nuevo.'
}
