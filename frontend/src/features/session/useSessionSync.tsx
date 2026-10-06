import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { isApiError, setSessionMatcher, setWriteGuard, UNAUTHORIZED_EVENT } from '../../api/client'
import type { Me } from '../../api/schema'
import { Button, useToast } from '../../components/ui'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { fetchMe, sessionKeys } from './queries'
import { subscribeSessionMessages, type SessionMessageType } from './sessionChannel'
import { clearSessionData, holdWrites, LOGIN_PATH, navigation, releaseWrites, sessionState } from './sessionLifecycle'
import styles from './session.module.css'

/** `setTimeout` no admite más de 2³¹ − 1 ms (≈ 24 días): con un valor mayor dispara al instante. */
const PERSISTENT = 2_147_483_647

/** Varias peticiones suelen fallar a la vez con el mismo 401: dentro de este margen cuentan como un solo aviso. */
const GROUP_MS = 2_000

/** De dónde viene la comprobación que encuentra otra persona u organización. */
type Source = 'return' | 'focus' | 'tab'

/** Aviso de que se descartó lo abierto porque la sesión del servidor ya es otra. */
function changedNotice(source: Source, previous: Me, current: Me) {
  const personChanged = previous.user.id !== current.user.id
  if (source === 'return') {
    return {
      title: `Entraste como ${current.user.name} en ${current.organization.name}`,
      description: 'Lo que tenías abierto se descartó para no mezclar datos de otra sesión.',
    }
  }
  return personChanged
    ? {
        title: `Ahora usas Resolve como ${current.user.name} en ${current.organization.name}`,
        description: 'Cambió en otra pestaña. Lo que tenías abierto se descartó para no mezclar datos de otra sesión.',
      }
    : {
        title: `Cambiaste a ${current.organization.name} en otra pestaña`,
        description: 'Lo que tenías abierto se descartó para no mezclar datos de la otra organización.',
      }
}

/**
 * Mantiene esta pestaña de acuerdo con la sesión del servidor, que es común a todas las del navegador:
 *
 * 1. **401 de la API** con una sesión ya cargada: toast persistente «Tu sesión caducó» con «Volver a entrar». No navega
 *    ni toca la caché: las pantallas siguen como estaban y lo escrito se conserva. «Volver a entrar» abre el inicio de
 *    sesión en otra pestaña. Sin sesión previa (el primer /me) no hay nada que «caducar»: lo muestra `LoginPage`.
 *    Mientras se cierra sesión, el 401 es esperado y tampoco avisa.
 * 2. **Comprobación** (`reconcile`): se relee `/me` y se compara persona y organización con las de la caché. Si cambian,
 *    la caché y los borradores son de la sesión anterior: se descartan, se vuelve al resumen y se avisa. Repetir una
 *    acción no puede publicar lo escrito en una organización o con una identidad que no eran las suyas. Si coinciden,
 *    solo se retira el aviso de caducidad que hubiera. La disparan, y esta es la única función de descarte:
 *    - los mensajes de las otras pestañas (`BroadcastChannel`: cerrar sesión, cambiar de organización, entrar);
 *    - el respaldo sin canal: cada vez que esta pestaña recupera el foco o la visibilidad, con sesión en caché (sin
 *      ella `useMe` no relee a propósito, para no reanunciar la página de error de sesión).
 */
export function useSessionSync() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  /** `returnTo`: dónde estaba el foco al avisar, para devolvérselo cuando el aviso se retire solo. */
  const notice = useRef<{ id: string; shownAt: number; returnTo: HTMLElement | null } | null>(null)
  /** La comprobación en vuelo (resuelve a «¿cambió la sesión?»): la esperan las escrituras y se evita lanzar otra. */
  const checking = useRef<Promise<boolean> | null>(null)
  /** Último mensaje de otra pestaña recibido mientras se comprobaba: se atiende al terminar, no se pierde. */
  const queued = useRef<{ source: Source; message?: SessionMessageType } | null>(null)

  // La navegación a `/` tras un cambio de sesión se confirma cuando cambia la ubicación (y con ella la pantalla): hasta
  // entonces la pantalla anterior sigue montada y las escrituras siguen cerradas (`holdWrites`).
  useEffect(() => releaseWrites, [])
  useEffect(() => {
    releaseWrites()
  }, [location.key])

  useEffect(() => {
    function showNotice() {
      const active = document.activeElement
      const returnTo = active instanceof HTMLElement && active !== document.body ? active : null
      if (notice.current) toast.dismiss(notice.current.id)
      const id = toast.show({
        tone: 'error',
        title: 'Tu sesión caducó',
        description: (
          <span className={styles.noticeBody}>
            Lo que escribiste sigue aquí. Vuelve a entrar en otra pestaña y después repite la acción.
            <Button variant="secondary" onClick={() => navigation.openInNewTab(LOGIN_PATH)}>
              Volver a entrar
            </Button>
          </span>
        ),
        duration: PERSISTENT,
      })
      notice.current = { id, shownAt: Date.now(), returnTo }
    }

    function onUnauthorized() {
      if (sessionState.ending || checking.current || !queryClient.getQueryData(sessionKeys.me)) return
      if (notice.current && Date.now() - notice.current.shownAt < GROUP_MS) return
      showNotice()
    }

    async function reconcile(source: Source, message?: SessionMessageType) {
      const previous = queryClient.getQueryData<Me>(sessionKeys.me)
      if (!previous || sessionState.ending) return
      if (checking.current) {
        // Un mensaje de otra pestaña no se descarta: p. ej. un `logout` que llega con la lectura ya respondida.
        // Foco y visibilidad llegan juntos y no se repiten; un `logout` pendiente no lo pisa otro mensaje.
        if (source === 'tab' && queued.current?.message !== 'logout') queued.current = { source, message }
        return
      }
      const run = check(previous, source, message)
      checking.current = run
      try {
        await run
      } finally {
        checking.current = null
      }
      const next = queued.current
      queued.current = null
      if (next) void reconcile(next.source, next.message)
    }

    /** Relee `/me` y descarta si cambió la sesión. Devuelve si cambió (o si terminó): las escrituras en espera no salen. */
    async function check(previous: Me, source: Source, message?: SessionMessageType): Promise<boolean> {
      try {
        const current = await queryClient.fetchQuery({
          queryKey: sessionKeys.me,
          queryFn: ({ signal }) => fetchMe(signal),
          staleTime: 0,
        })
        const changed = previous.user.id !== current.user.id || previous.organization.id !== current.organization.id
        if (changed) {
          holdWrites()
          await clearSessionData(queryClient)
          queryClient.setQueryData(sessionKeys.me, current)
          if (notice.current) toast.dismiss(notice.current.id)
          notice.current = null
          void navigate('/', { replace: true })
          toast.show(changedNotice(source, previous, current))
        } else if (notice.current) {
          const { id, returnTo } = notice.current
          toast.dismiss(id)
          notice.current = null
          restoreFocus(returnTo)
        }
        return changed
      } catch (error) {
        if (!isApiError(error, 401)) return false // Red o servidor: no se sabe nada; el siguiente intento lo dirá.
        if (message === 'logout') {
          // Cerraron sesión en otra pestaña: aquí no queda nada que enseñar. No se depende de que `useMe` reaccione.
          holdWrites()
          await clearSessionData(queryClient)
          void navigate('/entrar', { replace: true })
          return true
        }
        if (!notice.current) showNotice()
        return false
      }
    }

    const onReturn = () => {
      if (document.visibilityState !== 'hidden') void reconcile(notice.current ? 'return' : 'focus')
    }

    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    const stopListening = subscribeSessionMessages((type) => void reconcile('tab', type))
    // Cerrada mientras se cambia de sesión y mientras hay una comprobación en vuelo (resuelve a si la sesión cambió).
    // El reintento de CSRF compara la sesión de su `GET /me` con la de la caché; si no coincide, además de no reintentar,
    // esta pestaña se pone al día sin esperar al mensaje del canal.
    setSessionMatcher((me) => {
      const shown = queryClient.getQueryData<Me>(sessionKeys.me)
      const same = !shown || (shown.user.id === me.user.id && shown.organization.id === me.organization.id)
      if (!same) void reconcile('tab')
      return same
    })
    setWriteGuard(async () => sessionState.switching || ((await checking.current) ?? false))
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      stopListening()
      setWriteGuard(null)
      setSessionMatcher(null)
    }
  }, [toast, queryClient, navigate])
}

/**
 * Al retirarse el aviso, el botón «Volver a entrar» desaparece con el foco: se devuelve a donde estaba al avisar o, si
 * ya no existe, al título de la página; nunca queda en `body`.
 */
function restoreFocus(returnTo: HTMLElement | null) {
  window.setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body) return
    if (returnTo?.isConnected) returnTo.focus()
    else focusPageHeadingIfFocusLost()
  }, 0)
}
