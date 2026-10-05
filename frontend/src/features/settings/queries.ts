import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import type { Me, OrganizationPatch, OrganizationSettings } from '../../api/schema'
import { customerKeys } from '../customers/queries'
import { memberKeys } from '../team/queries'
import { reportKeys } from '../reports/queries'
import { refreshSessionOnForbidden, sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'

export const organizationKeys = {
  all: ['organization'] as const,
  settings: () => [...organizationKeys.all, 'settings'] as const,
}

/**
 * Ajustes de la organización (personal). `enabled` debe ser falso mientras no se sepa el rol: un cliente recibiría un
 * 403 y `/me` pendiente no distingue a nadie.
 */
export function useOrganizationSettings(enabled: boolean) {
  return useQuery({
    queryKey: organizationKeys.settings(),
    queryFn: ({ signal }) => unwrap(api.GET('/organization', { signal })),
    enabled,
  })
}

/** Guarda la respuesta solo si no es más antigua que la que ya hay: una lectura lenta no hace retroceder la caché. */
function writeSettingsIfNewer(queryClient: QueryClient, settings: OrganizationSettings) {
  const cached = queryClient.getQueryData<OrganizationSettings>(organizationKeys.settings())
  if (settings.version >= (cached?.version ?? -1)) queryClient.setQueryData(organizationKeys.settings(), settings)
}

/**
 * Edita la organización (admin) con `If-Match` y merge-patch: solo viajan los campos cambiados, así repetir el envío
 * tras un 412 no pisa lo que cambió otra persona. Al guardar se actualizan los ajustes y `/me` (el sidebar muestra el
 * nombre del espacio) y se leen de nuevo lo que depende de la zona y del objetivo: los informes (`byDay`, `period`) y
 * las métricas de tickets y de equipo (llevan el objetivo de primera respuesta) y las de clientes (el mes se cuenta en la zona).
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: organizationKeys.settings(), exact: true })
    },
    mutationFn: ({ version, changes }: { version: number; changes: OrganizationPatch }) =>
      unwrap(
        api.PATCH('/organization', {
          params: { header: { 'If-Match': `"${version}"` } },
          body: changes,
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }),
      ),
    onSuccess: (settings) => {
      writeSettingsIfNewer(queryClient, settings)
      queryClient.setQueryData<Me>(
        sessionKeys.me,
        (me) =>
          me && {
            ...me,
            organization: {
              ...me.organization,
              name: settings.name,
              timeZone: settings.timeZone,
              supportEmail: settings.supportEmail,
            },
          },
      )
      void queryClient.invalidateQueries({ queryKey: reportKeys.all })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
      void queryClient.invalidateQueries({ queryKey: memberKeys.metrics() })
      // «Nuevos este mes» se calcula en la zona de la organización.
      void queryClient.invalidateQueries({ queryKey: customerKeys.metrics() })
    },
    // Tras un 412 se lee de nuevo para mostrar lo real; un 403 significa que el rol cambió y se relee la sesión.
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.settings(), exact: true })
      refreshSessionOnForbidden(queryClient, error)
    },
  })
}

/**
 * Cambia el nombre de quien tiene la sesión (todos los roles). La respuesta es el `Me` completo y sustituye al de la
 * caché; el nombre aparece en el equipo, los responsables asignables, los tickets y el informe por agente, que se
 * leen de nuevo. El historial de actividad conserva el nombre de cada momento y no se toca.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => unwrap(api.PATCH('/me', { body: { name } })),
    onSuccess: (me) => {
      queryClient.setQueryData(sessionKeys.me, me)
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      void queryClient.invalidateQueries({ queryKey: reportKeys.all })
    },
    onError: (error) => refreshSessionOnForbidden(queryClient, error),
  })
}
