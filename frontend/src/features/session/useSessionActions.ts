import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, isApiError, unwrap } from '../../api/client'
import type { Me } from '../../api/schema'
import { useToast } from '../../components/ui'
import { refreshSessionOnForbidden, sessionKeys } from './queries'
import { postSessionMessage } from './sessionChannel'
import { clearSessionData, holdWrites, navigation, sessionState } from './sessionLifecycle'

/**
 * Texto de un error al cambiar de organización: un 401 es la sesión caducada (el aviso «Tu sesión caducó» ofrece
 * volver a entrar), un 403 que ya no pertenece a ella y lo demás, la red o el servidor.
 */
export function organizationErrorText(error: unknown) {
  if (isApiError(error, 401)) return 'Tu sesión caducó. Vuelve a entrar y repite el cambio.'
  if (isApiError(error, 403)) return 'Ya no tienes acceso a esa organización. Elige otra.'
  return 'Revisa tu conexión e inténtalo de nuevo.'
}

export interface SessionActionsOptions {
  /**
   * Se llama cuando `/logout` responde 403 o 404: la operación no existe en este backend (dev sin oidc). Solo se pasa
   * donde existe una alternativa (el selector de demostración); sin ella el fallo se avisa como cualquier otro.
   */
  onLogoutUnavailable?: () => void
}

/** Acciones de la sesión del usuario: cerrar sesión y cambiar de organización. */
export function useSessionActions({ onLogoutUnavailable }: SessionActionsOptions = {}) {
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
      // Las demás pestañas comparten la sesión: se les avisa justo antes de salir hacia el proveedor.
      postSessionMessage('logout')
      navigation.assign(logoutUrl)
    },
    onError: (error) => {
      sessionState.ending = false
      if (onLogoutUnavailable && (isApiError(error, 403) || isApiError(error, 404))) {
        onLogoutUnavailable()
        return
      }
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
      // La guardia de escrituras se cierra antes de vaciar nada y se abre al confirmarse la navegación a `/`.
      holdWrites()
      await clearSessionData(queryClient)
      queryClient.setQueryData(sessionKeys.me, me)
      postSessionMessage('organization-changed')
      void navigate('/', { replace: true })
      toast.show({ title: `Ahora trabajas en ${me.organization.name}` })
    },
    onError: (error) => refreshSessionOnForbidden(queryClient, error),
  })

  return { signOut, switchOrganization }
}
