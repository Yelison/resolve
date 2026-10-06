import { isApiError } from '../api/client'

/** Título del Problem con el que el backend responde el `503` de espera agotada por un bloqueo (`LockTimeout`). */
const LOCK_TIMEOUT_TITLE = 'Recurso ocupado'

/** Lo que se le dice a la persona cuando una escritura no pudo tomar el recurso a tiempo. */
export const LOCK_TIMEOUT_MESSAGE = 'Otra persona está guardando este recurso; vuelve a intentarlo.'

/**
 * Espera antes de poder repetir tras un `503` de bloqueo. El backend responde `Retry-After: 1` y el contrato fija un
 * mínimo de 1: la cabecera no llega hasta aquí (`ApiError` solo guarda el Problem y `api/` no es de esta capa), así que
 * se usa ese valor fijo.
 */
export const LOCK_RETRY_DELAY_MS = 1000

/** Cuánto dura en pantalla un aviso (Toast) con «Reintentar»: más que el habitual, porque lo decide la persona. */
export const LOCK_TOAST_DURATION = 15_000

/**
 * ¿Es el `503` de «Recurso ocupado»? Nada se cambió y repetir la misma petición es seguro. El contrato no define un
 * `type` propio para este Problem (es `about:blank`), así que se reconoce por el estado 503 más el `title`. Otro 503
 * (un proxy, el servidor caído) no lo es: no se sabe que repetir sea inocuo y sigue el aviso genérico de conexión.
 */
export function isLockTimeout(error: unknown): boolean {
  return isApiError(error, 503) && error.problem.title === LOCK_TIMEOUT_TITLE
}

/**
 * Texto de un error de mutación para un `Alert`: el `detail` del Problem cuando el servidor explica la negativa (403
 * sin permiso, 404 y 409 de estado), el aviso de bloqueo en un 503 de «Recurso ocupado» y el aviso de conexión en
 * cualquier otro caso. Quien ofrece «Reintentar» usa `LockTimeoutAlert` en lugar de este texto.
 */
export function mutationErrorDetail(error: unknown): string {
  if (isLockTimeout(error)) return LOCK_TIMEOUT_MESSAGE
  if (isApiError(error, 403) || isApiError(error, 404) || isApiError(error, 409)) {
    return error.problem.detail ?? error.problem.title
  }
  return 'Revisa tu conexión e inténtalo de nuevo.'
}
