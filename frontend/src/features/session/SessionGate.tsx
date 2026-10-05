import { useEffect, useRef, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { isApiError } from '../../api/client'
import { useMe } from './queries'
import { postSessionMessage } from './sessionChannel'
import { reconcileDraftOwner } from './sessionLifecycle'

/** Ruta de la pantalla de entrada. */
export const LOGIN_ROUTE = '/entrar'

/**
 * Envuelve las pantallas que necesitan sesión: si /me responde 401 y nunca hubo una sesión en esta carga, lleva a
 * `/entrar` (con `replace`, para que Atrás no vuelva a un bucle). Un 401 posterior, con la sesión ya cargada, no pasa
 * por aquí: la interfaz conserva lo que había y avisa con «Tu sesión caducó».
 *
 * También decide, antes de pintar nada, de quién son los borradores guardados (`reconcileDraftOwner`).
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe()
  // En el render y no en un efecto: los hijos leen su borrador al montarse, y el efecto del padre llegaría después.
  if (me.data) reconcileDraftOwner(me.data)
  // Con el primer `Me` de esta carga se avisa a las demás pestañas: la que abrió «Volver a entrar» avisa así a la original.
  const announced = useRef(false)
  const signedIn = Boolean(me.data)
  useEffect(() => {
    if (signedIn && !announced.current) {
      announced.current = true
      postSessionMessage('signed-in')
    }
  }, [signedIn])
  if (!me.data && isApiError(me.error, 401)) return <Navigate to={LOGIN_ROUTE} replace />
  return children
}
