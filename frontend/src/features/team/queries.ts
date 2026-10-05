import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, isApiError, unwrap } from '../../api/client'
import type { MemberInvite, TeamMember, TeamRole } from '../../domain/member'
import { sessionKeys } from '../session/queries'
import { invalidateOverview, ticketKeys } from '../tickets/queries'
import { reportKeys } from '../reports/queries'

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

/**
 * Un 403 significa que el rol de la sesión ya no permite la acción (p. ej. otra persona degradó a quien la hace): la
 * sesión se lee de nuevo para que las acciones de administración desaparezcan en lugar de repetir el 403.
 */
export function refreshSessionOnForbidden(queryClient: QueryClient, error: unknown) {
  if (isApiError(error, 403)) void queryClient.invalidateQueries({ queryKey: sessionKeys.me })
}

/** Una invitación fallida (p. ej. el correo ya es de un miembro) deja la lista como estaba: no hay nada que releer. */
export function useInviteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invite: MemberInvite) => unwrap(api.POST('/members', { body: invite })),
    // Un invitado aún no cuenta como personal ni como responsable asignable: cambia la lista. El informe y la
    // actividad se invalidan por la regla de §3.4 (invitar, cambiar el rol y retirar), aunque hoy invitar no cambie
    // lo que muestra el resumen; así la regla no depende de cómo evolucione el informe.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.list() })
      invalidateOverview(queryClient)
    },
    onError: (error) => refreshSessionOnForbidden(queryClient, error),
  })
}

/** Tras un 404 o un 409 otra persona ya cambió al miembro: se lee de nuevo para mostrar lo real. Un 403 relee la sesión. */
function useMemberChange<TVariables>(
  request: (variables: TVariables) => Promise<TeamMember>,
  onSuccess: (queryClient: ReturnType<typeof useQueryClient>) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => onSuccess(queryClient),
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
      refreshSessionOnForbidden(queryClient, error)
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
      invalidateOverview(queryClient)
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
      // `ticketKeys.all` incluye el feed, donde queda `assignee_changed`; el informe se lee aparte.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      void queryClient.invalidateQueries({ queryKey: reportKeys.all })
    },
  )
}
