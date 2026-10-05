import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'

export const memberKeys = {
  all: ['members'] as const,
  list: () => [...memberKeys.all, 'list'] as const,
  assignees: () => [...memberKeys.all, 'assignees'] as const,
  metrics: () => [...memberKeys.all, 'metrics'] as const,
}

/** Miembros a quienes se puede asignar un ticket. */
export function useAssignees(enabled = true) {
  return useQuery({
    queryKey: memberKeys.assignees(),
    queryFn: ({ signal }) => unwrap(api.GET('/assignees', { signal })),
    staleTime: 5 * 60_000,
    enabled,
  })
}
