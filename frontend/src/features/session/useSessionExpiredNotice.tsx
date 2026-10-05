import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { UNAUTHORIZED_EVENT } from '../../api/client'
import type { Me } from '../../api/schema'
import { Button, useToast } from '../../components/ui'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { fetchMe, sessionKeys } from './queries'
import { clearSessionData, LOGIN_PATH, navigation, sessionState } from './sessionLifecycle'
import styles from './session.module.css'

/** `setTimeout` no admite más de 2³¹ − 1 ms (≈ 24 días): con un valor mayor dispara al instante. */
const PERSISTENT = 2_147_483_647

/** Varias peticiones suelen fallar a la vez con el mismo 401: dentro de este margen cuentan como un solo aviso. */
const GROUP_MS = 2_000

/**
 * Avisa con un toast persistente de que la sesión caducó cuando la API responde 401 y ya había una sesión cargada.
 * No navega ni toca la caché: las pantallas siguen como estaban y lo escrito se conserva. «Volver a entrar» abre el
 * inicio de sesión en otra pestaña y, al volver a esta, se comprueba la sesión y el aviso se retira solo.
 *
 * Si quien volvió a entrar es otra persona, o la sesión nueva resuelve en otra organización, la caché y los borradores
 * de esta pestaña son de la sesión anterior: se descartan y se vuelve al resumen, con un aviso que lo explica. Repetir
 * la acción no puede publicar lo escrito en una organización o con una identidad que no eran las suyas.
 *
 * Sin sesión previa (el primer /me) no hay nada que «caducar»: lo muestra `LoginPage`. Mientras se cierra sesión, el
 * 401 es esperado y tampoco avisa.
 */
export function useSessionExpiredNotice() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  /** `returnTo`: dónde estaba el foco al avisar, para devolvérselo cuando el aviso se retire solo. */
  const notice = useRef<{ id: string; shownAt: number; returnTo: HTMLElement | null } | null>(null)
  const checking = useRef(false)

  useEffect(() => {
    function onUnauthorized() {
      if (sessionState.ending || checking.current || !queryClient.getQueryData(sessionKeys.me)) return
      if (notice.current && Date.now() - notice.current.shownAt < GROUP_MS) return
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

    async function onReturn() {
      if (document.visibilityState === 'hidden' || !notice.current || checking.current) return
      checking.current = true
      const previous = queryClient.getQueryData<Me>(sessionKeys.me)
      try {
        const current = await queryClient.fetchQuery({
          queryKey: sessionKeys.me,
          queryFn: ({ signal }) => fetchMe(signal),
          staleTime: 0,
        })
        const { id, returnTo } = notice.current
        toast.dismiss(id)
        notice.current = null
        if (
          previous &&
          (previous.user.id !== current.user.id || previous.organization.id !== current.organization.id)
        ) {
          await clearSessionData(queryClient)
          queryClient.setQueryData(sessionKeys.me, current)
          void navigate('/', { replace: true })
          toast.show({
            title: `Entraste como ${current.user.name} en ${current.organization.name}`,
            description: 'Lo que tenías abierto se descartó para no mezclar datos de otra sesión.',
          })
        } else {
          restoreFocus(returnTo)
        }
      } catch {
        // Sigue sin sesión: el aviso se queda.
      } finally {
        checking.current = false
      }
    }

    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
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
