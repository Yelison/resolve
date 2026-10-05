import { useQuery, useQueryClient, type QueryObserverOptions } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import { shouldRetry } from '../../lib/queryClient'

/** Tiempo máximo de una petición de /me antes de abortarla. */
export const ME_TIMEOUT_MS = 10_000

/**
 * Combina la señal de la consulta con un plazo. `AbortSignal.any` no existe en Safari/iOS anteriores a 17.4 ni en
 * Chrome 111–115 o Firefox 114–123, que entran en el destino de build: sin él se usa un controlador propio.
 */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, AbortSignal.timeout(ms)])
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Tiempo agotado', 'TimeoutError')), ms)
  const onAbort = () => {
    clearTimeout(timer)
    controller.abort(signal.reason)
  }
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}

/**
 * Mantiene la política de reintentos del cliente (la de `lib/queryClient.ts` en producción) salvo para un
 * TimeoutError: un host que no respondió en el plazo no suele hacerlo un segundo después.
 */
export function retryUnlessTimeout(base: QueryObserverOptions['retry']) {
  return (failureCount: number, error: unknown): boolean => {
    if (error instanceof DOMException && error.name === 'TimeoutError') return false
    if (typeof base === 'function') return base(failureCount, error as Error)
    if (typeof base === 'number') return failureCount < base
    return base ?? shouldRetry(failureCount, error)
  }
}

export const sessionKeys = {
  me: ['session', 'me'] as const,
}

/** Usuario, organización y rol actuales. Cambia rara vez, así que no se revalida solo. */
export function useMe() {
  const defaultRetry = useQueryClient().getDefaultOptions().queries?.retry
  return useQuery({
    queryKey: sessionKeys.me,
    // Cada intento tiene su propio plazo. Si el host no responde (p. ej. un puerto que descarta paquetes), el
    // TimeoutError cuenta como fallo y el shell muestra la página de reintento en lugar de cargar para siempre.
    queryFn: ({ signal }) => unwrap(api.GET('/me', { signal: withTimeout(signal, ME_TIMEOUT_MS) })),
    retry: retryUnlessTimeout(defaultRetry),
    staleTime: Infinity,
    // Sin datos la consulta siempre cuenta como obsoleta: sin esto, cada vez que la pestaña recupera el foco se
    // reintentaría /me y la página de error volvería a anunciarse. Reintentar es una acción explícita del usuario.
    refetchOnWindowFocus: false,
  })
}
