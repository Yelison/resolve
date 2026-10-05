import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import type { MemberInvite, TeamMember, TeamRole } from '../../domain/member'
import { sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'

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

/** Todo el equipo, retirados incluidos y sin paginar; la interfaz oculta los retirados por defecto. */
export function useTeam() {
  return useQuery({
    queryKey: memberKeys.list(),
    queryFn: ({ signal }) => unwrap(api.GET('/members', { signal })),
  })
}

export function useTeamMetrics() {
  return useQuery({
    queryKey: memberKeys.metrics(),
    queryFn: ({ signal }) => unwrap(api.GET('/members/metrics', { signal })),
  })
}

/** Una invitación fallida (p. ej. el correo ya es de un miembro) deja la lista como estaba: no hay nada que releer. */
export function useInviteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invite: MemberInvite) => unwrap(api.POST('/members', { body: invite })),
    // Un invitado aún no cuenta como personal ni como responsable asignable: solo cambia la lista.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: memberKeys.list() }),
  })
}

/** Tras un 404 o un 409 otra persona ya cambió al miembro: se lee de nuevo para mostrar lo real. */
function useMemberChange<TVariables>(
  request: (variables: TVariables) => Promise<TeamMember>,
  onSuccess: (queryClient: ReturnType<typeof useQueryClient>) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => onSuccess(queryClient),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}

export function useChangeRole() {
  return useMemberChange(
    ({ userId, role }: { userId: string; role: TeamRole }) =>
      unwrap(api.POST('/members/{userId}/role', { params: { path: { userId } }, body: { role } })),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.list() })
      // Un administrador puede cambiar su propio rol: la sesión se lee de nuevo para que el menú y las acciones lo reflejen.
      void queryClient.invalidateQueries({ queryKey: sessionKeys.me })
    },
  )
}

/**
 * Retirar libera en el servidor los tickets sin resolver del miembro: además del equipo, cambian las listas, los
 * detalles y las métricas de tickets (`ticketKeys.all`) y los responsables asignables (`memberKeys.assignees`).
 */
export function useRemoveMember() {
  return useMemberChange(
    (userId: string) => unwrap(api.POST('/members/{userId}/remove', { params: { path: { userId } } })),
    (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
    },
  )
}
