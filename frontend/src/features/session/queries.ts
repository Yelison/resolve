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
  })
}
