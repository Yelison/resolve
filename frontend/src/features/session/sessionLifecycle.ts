import type { QueryClient } from '@tanstack/react-query'
import type { Me } from '../../api/schema'

/** Inicio de sesión: el backend redirige al proveedor (OIDC) y, al volver, deja la cookie de sesión. */
export const LOGIN_PATH = '/api/oauth2/authorization/resolve'

/**
 * Navegaciones del navegador agrupadas para poder sustituirlas en las pruebas: jsdom no deja espiar `location.assign`.
 */
export const navigation = {
  /** Sale de la aplicación hacia `url` en la misma pestaña (cierre de sesión, inicio de sesión). */
  assign: (url: string) => window.location.assign(url),
  /**
   * Abre `url` en otra pestaña para que la pestaña actual conserve lo que hay escrito; si el navegador bloquea la
   * ventana, navega en la misma como último recurso.
   */
  openInNewTab: (url: string) => {
    // `noopener` en la lista de características hace que open() devuelva siempre null y no permite saber si se
    // bloqueó: se abre normal y se corta el vínculo con esta pestaña a mano.
    const opened = window.open(url, '_blank')
    if (opened) opened.opener = null
    else navigation.assign(url)
  },
}

/**
 * Estado compartido del cierre de sesión: mientras dura, un 401 de la API es esperado (la sesión acaba de morir) y no
 * debe avisar de que «caducó».
 */
export const sessionState = { ending: false }

/** Prefijos de los borradores que las pantallas guardan en sessionStorage (`useDraft`): respuesta de ticket y artículo. */
const DRAFT_PREFIXES = ['resolve-draft-', 'resolve-article-']

/** Borra los borradores de la pestaña: no llevan usuario ni organización, así que no deben pasar a otra sesión. */
export function clearDrafts() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key)
    }
  } catch {
    // Sin almacenamiento no hay borradores que borrar.
  }
}

/** Clave (sin el prefijo de los borradores, para que `clearDrafts` no la borre) con el dueño de los borradores de la pestaña. */
const DRAFT_OWNER_KEY = 'resolve-session-owner'

/**
 * Los borradores no llevan persona ni organización en su clave: sin esto, los de una persona reaparecerían en el
 * redactor de otra que entra después en la misma pestaña (o los de una organización, en otra con el mismo número de
 * ticket). Anota quién es el dueño y, si el `Me` actual no coincide con el anotado, borra los borradores. La misma
 * persona en la misma organización los conserva (un 401 y volver a entrar no pierde lo escrito).
 *
 * Debe llamarse en el render de quien protege las pantallas, antes de que ninguna lea su borrador: `useDraft` lo lee al
 * montarse. Es idempotente. Sin dueño anotado (primera carga de la pestaña) solo lo adopta: no hay otra sesión de la que
 * proteger, porque ninguna pantalla con borrador se monta antes de que `/me` cargue.
 */
export function reconcileDraftOwner(me: Me) {
  const owner = `${me.user.id}:${me.organization.id}`
  try {
    const stored = sessionStorage.getItem(DRAFT_OWNER_KEY)
    if (stored === owner) return
    if (stored !== null) clearDrafts()
    sessionStorage.setItem(DRAFT_OWNER_KEY, owner)
  } catch {
    // Sin almacenamiento no hay borradores que proteger.
  }
}

/**
 * Olvida todo lo del usuario o la organización anteriores: peticiones en vuelo, caché y borradores. Se llama al cerrar
 * sesión, al cambiar de organización y al cambiar de usuario de demostración; nunca ante un 401, donde lo escrito debe
 * sobrevivir.
 */
export async function clearSessionData(queryClient: QueryClient) {
  await queryClient.cancelQueries()
  queryClient.clear()
  clearDrafts()
}

/**
 * Lleva el foco al contenido principal cuando la shell lo pinta y el foco puede moverse allí: tras un cambio que
 * desmonta a quien lo tenía (el selector de usuario de demostración). Tres trampas, por eso no basta un `focus()`:
 * mientras un `<dialog>` modal sigue abierto el resto de la página es inerte y `focus()` no hace nada sin avisar; la
 * shell puede tardar en montarse tras navegar; y al cerrarse, `Modal` devuelve el foco a su disparador, que puede
 * ocurrir justo después. Se reintenta hasta que el foco llega y se confirma una vez más poco después.
 */
export function focusContentWhenReady(attempts = 40, delay = 0, confirming = false) {
  window.setTimeout(() => {
    const content = document.getElementById('contenido')
    if (content && !document.querySelector('dialog[open]')) {
      if (document.activeElement === content && confirming) return
      content.focus({ preventScroll: true })
      if (document.activeElement === content) {
        focusContentWhenReady(attempts, 100, true)
        return
      }
    }
    if (attempts > 0) focusContentWhenReady(attempts - 1, 50)
  }, delay)
}
