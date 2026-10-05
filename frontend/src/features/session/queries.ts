import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'

export const sessionKeys = {
  me: ['session', 'me'] as const,
}

/** Usuario, organización y rol actuales. Cambia rara vez, así que no se revalida solo. */
export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: () => unwrap(api.GET('/me')),
    staleTime: Infinity,
    // Sin datos la consulta siempre cuenta como obsoleta: sin esto, cada vez que la pestaña recupera el foco se
    // reintentaría /me y la página de error volvería a anunciarse. Reintentar es una acción explícita del usuario.
    refetchOnWindowFocus: false,
  })
}
