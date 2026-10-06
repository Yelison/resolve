import { DEMO_USER_EVENT, DEMO_USER_STORAGE_KEY } from '../api/client'
import { createArticleStore } from '../../e2e/mocks/knowledge'
import { createMockFeatures } from '../../e2e/mocks/api'
import { isApiUrl, respondToApi } from './adapter'
import { roleFor } from './users'

/** El estado de la sesión simulada vive en memoria y se reinicia al recargar; la elección de usuario también. */
function storedUser() {
  try {
    return localStorage.getItem(DEMO_USER_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Escribe la cookie del token CSRF acotada a la base de la aplicación: `Path=/` la compartiría con otras páginas de `github.io`. */
function writeCookie(cookie: string) {
  document.cookie = cookie.replace(/;\s*Path=[^;]*/i, `; Path=${import.meta.env.BASE_URL}`)
}

/**
 * Sustituye `fetch` para que `/api` lo atiendan los manejadores de los e2e en lugar de la red. Se instala antes de
 * pintar nada. La sesión arranca sin iniciar (la demostración empieza en /entrar). Cada elección en el selector de
 * usuarios (`DEMO_USER_EVENT`) reconstruye la sesión simulada con el rol elegido y ya iniciada, aunque sea el mismo
 * usuario: tras cerrar sesión, volver a elegirlo tiene que entrar. Los
 * artículos se conservan entre usuarios, como en los e2e.
 */
export function installShowcase() {
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
  const articleStore = createArticleStore()
  const build = (signedIn: boolean) => createMockFeatures(roleFor(storedUser()), { articleStore, signedIn })

  try {
    localStorage.removeItem(DEMO_USER_STORAGE_KEY)
  } catch {
    // Sin almacenamiento se elige igual el rol por el evento.
  }
  let features = build(false)
  window.addEventListener(DEMO_USER_EVENT, () => {
    features = build(true)
  })

  const network = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init)
    if (!isApiUrl(new URL(request.url, window.location.href), window.location.origin)) return network(request)
    request.signal.throwIfAborted()
    const response = await respondToApi({ features, request, appUrl, setCookie: writeCookie })
    request.signal.throwIfAborted()
    return response
  }
}
