import { isApiError, type ApiError } from '../api/client'

/** Título del Problem con el que el backend responde el `503` de espera agotada por un bloqueo (`LockTimeout`). */
const LOCK_TIMEOUT_TITLE = 'Recurso ocupado'

/** Lo que se le dice a la persona cuando una escritura no pudo tomar el recurso a tiempo. */
export const LOCK_TIMEOUT_MESSAGE =
  'Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'

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

/** Título del Problem del `503` que la demostración pública responde mientras reinicia sus datos (filtro previo a la API). */
const DEMO_MAINTENANCE_TITLE = 'Reinicio de la demostración en curso'

/** Título del Problem del `409` con el que la demostración rechaza crear más recursos que su tope por organización. */
const DEMO_LIMIT_TITLE = 'Límite de la demostración'

/** Lo que se le dice a la persona durante el reinicio nocturno de la demostración. */
export const DEMO_MAINTENANCE_MESSAGE = 'Estamos reiniciando la demostración; vuelve en un minuto.'

/** Lo que se le dice a la persona cuando la demostración limita las escrituras seguidas (`429`). */
export const TOO_MANY_WRITES_MESSAGE = 'Has hecho muchos cambios seguidos; espera un momento.'

/**
 * ¿Es el `503` del reinicio de la demostración? No es el de «Recurso ocupado» (`isLockTimeout`): aquel se repite en un
 * segundo desde el propio formulario; este afecta a toda la API durante minutos y se avisa a toda la aplicación.
 */
export function isDemoMaintenance(error: unknown): boolean {
  return isApiError(error, 503) && error.problem.title === DEMO_MAINTENANCE_TITLE
}

/** ¿Es el `429` de la demostración por demasiadas escrituras en un minuto? No se reintenta solo: lo decide la persona. */
export function isTooManyWrites(error: unknown): boolean {
  return isApiError(error, 429)
}

/** ¿Es el `409` de la demostración por haber alcanzado el tope de un recurso? No es un conflicto de estado ni de slug. */
export function isDemoLimit(error: unknown): error is ApiError {
  return isApiError(error, 409) && error.problem.title === DEMO_LIMIT_TITLE
}

/**
 * Texto propio de los tres rechazos de la demostración pública, o `undefined` si el error es otro. El del tope usa el
 * `detail` del Problem (dice qué recurso y cuántos), y nada más.
 */
export function demoErrorMessage(error: unknown): string | undefined {
  if (isDemoMaintenance(error)) return DEMO_MAINTENANCE_MESSAGE
  if (isTooManyWrites(error)) return TOO_MANY_WRITES_MESSAGE
  if (isDemoLimit(error)) return error.problem.detail ?? error.problem.title
  return undefined
}

/**
 * Texto de un error de mutación para un `Alert`: el `detail` del Problem cuando el servidor explica la negativa (403
 * sin permiso, 404 y 409 de estado), el aviso de bloqueo en un 503 de «Recurso ocupado», los avisos de la demostración
 * pública (reinicio, demasiadas escrituras, tope) y el aviso de conexión en cualquier otro caso. Quien ofrece «Reintentar» usa `LockTimeoutAlert` en lugar de este texto.
 */
export function mutationErrorDetail(error: unknown): string {
  if (isLockTimeout(error)) return LOCK_TIMEOUT_MESSAGE
  const demo = demoErrorMessage(error)
  if (demo) return demo
  if (isApiError(error, 403) || isApiError(error, 404) || isApiError(error, 409)) {
    return error.problem.detail ?? error.problem.title
  }
  return 'Revisa tu conexión e inténtalo de nuevo.'
}
