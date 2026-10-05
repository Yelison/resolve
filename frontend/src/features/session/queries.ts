import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'

/** Tiempo máximo de una petición de /me antes de abortarla. */
export const ME_TIMEOUT_MS = 10_000

export const sessionKeys = {
  me: ['session', 'me'] as const,
}

/** Usuario, organización y rol actuales. Cambia rara vez, así que no se revalida solo. */
export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me,
    // Cada intento tiene su propio plazo. Si el host no responde (p. ej. un puerto que descarta paquetes), el
    // TimeoutError cuenta como fallo y el shell muestra la página de reintento en lugar de cargar para siempre.
    queryFn: ({ signal }) =>
      unwrap(api.GET('/me', { signal: AbortSignal.any([signal, AbortSignal.timeout(ME_TIMEOUT_MS)]) })),
    staleTime: Infinity,
    // Sin datos la consulta siempre cuenta como obsoleta: sin esto, cada vez que la pestaña recupera el foco se
    // reintentaría /me y la página de error volvería a anunciarse. Reintentar es una acción explícita del usuario.
    refetchOnWindowFocus: false,
  })
}
