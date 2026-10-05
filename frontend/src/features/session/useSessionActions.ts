import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, isApiError, unwrap } from '../../api/client'
import type { Me } from '../../api/schema'
import { useToast } from '../../components/ui'
import { refreshSessionOnForbidden, sessionKeys } from './queries'
import { clearSessionData, navigation, sessionState } from './sessionLifecycle'

/**
 * Texto de un error al cambiar de organización: un 401 es la sesión caducada (el aviso «Tu sesión caducó» ofrece
 * volver a entrar), un 403 que ya no pertenece a ella y lo demás, la red o el servidor.
 */
export function organizationErrorText(error: unknown) {
  if (isApiError(error, 401)) return 'Tu sesión caducó. Vuelve a entrar y repite el cambio.'
  if (isApiError(error, 403)) return 'Ya no tienes acceso a esa organización. Elige otra.'
  return 'Revisa tu conexión e inténtalo de nuevo.'
}

/** Acciones de la sesión del usuario: cerrar sesión y cambiar de organización. */
export function useSessionActions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()

  /**
   * Cierra la sesión en el servidor y en el proveedor: la API responde 200 con `logoutUrl` y hay que navegar allí, no
   * darla por terminada. Si falla, la sesión sigue abierta y se avisa.
   */
  const signOut = useMutation({
    mutationFn: async () => {
      sessionState.ending = true
      return unwrap(api.POST('/logout'))
    },
    onSuccess: async ({ logoutUrl }) => {
      await clearSessionData(queryClient)
      navigation.assign(logoutUrl)
    },
    onError: () => {
      sessionState.ending = false
      toast.show({
        tone: 'error',
        title: 'No pudimos cerrar la sesión',
        description: 'Tu sesión sigue abierta. Revisa tu conexión e inténtalo de nuevo.',
      })
    },
  })

  /**
   * Cambia la organización activa. El `Me` nuevo sustituye al anterior tras vaciar la caché y los borradores, y se
   * vuelve al resumen: una ruta como /tickets/1046 apuntaría al ticket del mismo número en la otra organización.
   */
  const switchOrganization = useMutation({
    mutationFn: (organizationId: string) => unwrap(api.POST('/session/organization', { body: { organizationId } })),
    onSuccess: async (me: Me) => {
      await clearSessionData(queryClient)
      queryClient.setQueryData(sessionKeys.me, me)
      void navigate('/', { replace: true })
      toast.show({ title: `Ahora trabajas en ${me.organization.name}` })
    },
    onError: (error) => refreshSessionOnForbidden(queryClient, error),
  })

  return { signOut, switchOrganization }
}
