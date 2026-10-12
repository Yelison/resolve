import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, isApiError, PROBLEM_TYPES, unwrap } from '../../api/client'
import type { Me, NewOrganization } from '../../api/schema'
import { useToast } from '../../components/ui'
import { ticketKeys } from '../tickets/queries'
import { fetchMe, refreshSessionOnForbidden, sessionKeys } from './queries'
import { postSessionMessage } from './sessionChannel'
import { clearSessionData, holdWrites, navigation, sessionState } from './sessionLifecycle'

/**
 * Texto de un error al cambiar de espacio: un 401 es la sesión caducada (el aviso «Tu sesión caducó» ofrece volver a
 * entrar), un 403 que ya no pertenece a él y lo demás, la red o el servidor.
 */
export function organizationErrorText(error: unknown) {
  if (isApiError(error, 401)) return 'Tu sesión caducó. Vuelve a entrar y repite el cambio.'
  if (isApiError(error, 403)) return 'Ya no tienes acceso a ese espacio. Elige otro.'
  return 'Revisa tu conexión e inténtalo de nuevo.'
}

/** Por qué no se pudo salir de un espacio, según el `type` del Problem (nunca por su texto). */
export type LeaveFailure = 'last-admin' | 'last-organization' | 'customer' | 'gone' | 'other'

export function leaveFailure(error: unknown): LeaveFailure {
  if (isApiError(error, 409)) {
    if (error.problem.type === PROBLEM_TYPES.lastAdmin) return 'last-admin'
    if (error.problem.type === PROBLEM_TYPES.lastOrganization) return 'last-organization'
  }
  if (isApiError(error, 403)) return 'customer'
  if (isApiError(error, 404)) return 'gone'
  return 'other'
}

/** Cuánto se espera, como máximo, a las métricas del espacio nuevo (menos que la guardia de escrituras). */
const METRICS_WAIT_MS = 4000

/** Las métricas de tickets del espacio de la sesión, o `null` si fallan o tardan más de `ms` (se aborta). */
async function fetchMetricsWithin(ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await unwrap(api.GET('/tickets/metrics', { signal: controller.signal }))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Por qué no se pudo crear un espacio, según el estado y el `type` del Problem (nunca por su texto). */
export type CreateFailure = 'limit' | 'forbidden' | 'invalid' | 'other'

export function createFailure(error: unknown): CreateFailure {
  if (isApiError(error, 409) && error.problem.type === PROBLEM_TYPES.organizationLimit) return 'limit'
  if (isApiError(error, 403)) return 'forbidden'
  if (isApiError(error, 400)) return 'invalid'
  return 'other'
}

/** A qué espacio se cambia y, si no es el resumen, a dónde se va después (p. ej. `/equipo`). */
export interface SwitchTarget {
  organizationId: string
  to?: string
}

/** El espacio que se deja: de él depende qué se vacía y a dónde se vuelve. */
export interface LeaveTarget {
  organizationId: string
  name: string
  /** Si es el espacio de la sesión: el servidor resuelve la siguiente petición en otro espacio. */
  current: boolean
}

export interface SessionActionsOptions {
  /**
   * Se llama cuando `/logout` responde 403 o 404: la operación no existe en este backend (dev sin oidc). Solo se pasa
   * donde existe una alternativa (el selector de demostración); sin ella el fallo se avisa como cualquier otro.
   */
  onLogoutUnavailable?: () => void
}

/** Acciones de la sesión del usuario: cerrar sesión, cambiar de espacio, crear uno y salir de uno. */
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
   * Entra en el espacio que el servidor ya eligió: vacía la caché y los borradores, guarda el `Me` nuevo (y lo que `seed`
   * deje en la caché) y navega al resumen o a `to`, sin ningún `await` desde que llega el `Me`.
   */
  const enterOrganization = async (me: Me, to = '/', seed?: () => void) => {
    // La guardia de escrituras se cierra antes de vaciar nada y se abre al confirmarse la navegación a `/`.
    holdWrites()
    await clearSessionData(queryClient)
    queryClient.setQueryData(sessionKeys.me, me)
    seed?.()
    postSessionMessage('organization-changed')
    void navigate(to, { replace: true })
  }

  /**
   * Cambia el espacio activo. El `Me` nuevo sustituye al anterior tras vaciar la caché y los borradores, y se vuelve al
   * resumen (o a `to`): una ruta como /tickets/1046 apuntaría al ticket del mismo número en el otro espacio.
   */
  const switchOrganization = useMutation({
    mutationFn: ({ organizationId }: SwitchTarget) =>
      unwrap(api.POST('/session/organization', { body: { organizationId } })),
    onSuccess: async (me: Me, { to }) => {
      await enterOrganization(me, to)
      toast.show({ title: `Ahora trabajas en ${me.organization.name}` })
    },
    onError: (error) => {
      refreshSessionOnForbidden(queryClient, error)
      toast.show({
        tone: 'error',
        title: 'No pudimos cambiar de espacio',
        description: organizationErrorText(error),
      })
    },
  })

  /**
   * Crea un espacio y pasa a trabajar en él: el `201` trae el `Me` de ese espacio, así que se entra como al cambiar (caché
   * vacía, resumen del espacio nuevo) y el aviso lo dice. El diálogo que lo pidió se cierra; el foco lo lleva la shell al
   * contenido de la pantalla nueva, como en cualquier navegación. Los fallos los muestra el diálogo, bajo su campo; aquí
   * solo se relee la sesión si lo que se mostraba ya no es verdad (el límite o el permiso cambiaron en otra pestaña).
   */
  const createOrganization = useMutation({
    mutationFn: (body: NewOrganization) => unwrap(api.POST('/organizations', { body })),
    onSuccess: async (me: Me) => {
      // El servidor ya está en el espacio nuevo y la pantalla sigue en el anterior: las escrituras se retienen desde ya.
      holdWrites()
      // «Primeros pasos» sale de las métricas: se piden antes de cambiar de pantalla (el servidor ya responde en el espacio
      // nuevo) y se dejan en la caché, así Inicio pinta el panel de una vez y no empuja la página al llegar. Con tope de
      // espera; si falla o tarda, Inicio las pide como siempre.
      const metrics = await fetchMetricsWithin(METRICS_WAIT_MS)
      await enterOrganization(me, '/', () => {
        if (metrics) queryClient.setQueryData(ticketKeys.metrics(), metrics)
      })
      toast.show({ title: `Ya estás en ${me.organization.name}` })
    },
    onError: (error) => {
      const failure = createFailure(error)
      if (failure === 'limit' || failure === 'forbidden')
        void queryClient.invalidateQueries({ queryKey: sessionKeys.me })
    },
  })

  /**
   * Sale de un espacio. El `204` no trae `Me`. Si era el de la sesión, el servidor ya resuelve en otro: se vacía todo
   * (como al cambiar), se avisa a las demás pestañas, se lee `/me` y se vuelve al resumen; si ese `/me` falla (p. ej. un
   * 401 porque no queda acceso) la pantalla de entrada se encarga. Si era otro, solo se actualiza la lista de espacios.
   * Los fallos los muestra quien abrió el diálogo, que conoce el espacio; aquí solo se relee la sesión si lo que se
   * mostraba ya no es verdad (otra persona cambió el equipo).
   */
  const leaveOrganization = useMutation({
    mutationFn: ({ organizationId }: LeaveTarget) =>
      unwrap(api.DELETE('/me/organizations/{organizationId}', { params: { path: { organizationId } } })),
    onSuccess: async (_, { name, current }) => {
      if (current) {
        holdWrites()
        await clearSessionData(queryClient)
        postSessionMessage('organization-changed')
        try {
          await queryClient.fetchQuery({
            queryKey: sessionKeys.me,
            queryFn: ({ signal }) => fetchMe(signal),
            staleTime: 0,
            retry: false,
          })
        } catch {
          // Sin `/me` la puerta de sesión decide qué mostrar al volver al resumen.
        }
        void navigate('/', { replace: true })
      } else {
        await queryClient.invalidateQueries({ queryKey: sessionKeys.me })
      }
      toast.show({ title: `Saliste de ${name}` })
    },
    onError: (error) => {
      if (isApiError(error, 403) || isApiError(error, 404) || isApiError(error, 409)) {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.me })
      }
    },
  })

  return { signOut, switchOrganization, createOrganization, leaveOrganization }
}
