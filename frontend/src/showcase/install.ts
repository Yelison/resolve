import { DEMO_USER_EVENT, DEMO_USER_STORAGE_KEY } from '../api/client'
import { createArticleStore } from '../../e2e/mocks/knowledge'
import { createMockFeatures } from '../../e2e/mocks/api'
import { isApiUrl, respondToApi } from './adapter'
import { roleFor } from './users'

/**
 * La elección de usuario se guarda en `sessionStorage`: sobrevive a recargar y a abrir un enlace interno en la misma
 * pestaña, y una pestaña nueva o un navegador reabierto empiezan sin ella, en /entrar. El selector de `features/session`
 * escribe en `localStorage` (`setDemoUser`); `install` lo traslada aquí y lo limpia al arrancar y al cerrar sesión.
 */
function readStored(storage: () => Storage) {
  try {
    return storage().getItem(DEMO_USER_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(storage: () => Storage, email: string | null) {
  try {
    if (email) storage().setItem(DEMO_USER_STORAGE_KEY, email)
    else storage().removeItem(DEMO_USER_STORAGE_KEY)
  } catch {
    // Sin almacenamiento la demostración funciona igual, pero cada recarga vuelve a /entrar.
  }
}

const session = () => sessionStorage
const picker = () => localStorage

/** Escribe la cookie del token CSRF acotada a la base de la aplicación: `Path=/` la compartiría con otras páginas de `github.io`. */
function writeCookie(cookie: string) {
  document.cookie = cookie.replace(/;\s*Path=[^;]*/i, `; Path=${import.meta.env.BASE_URL}`)
}

/**
 * Sustituye `fetch` para que `/api` lo atiendan los manejadores de los e2e en lugar de la red. Se instala antes de
 * pintar nada. Los datos simulados (y la organización activa) viven en memoria y se reinician al recargar, como anuncia
 * el aviso «los cambios no se guardan»; solo se conserva quién está dentro. Si la pestaña guarda una elección de
 * usuario, la sesión arranca iniciada con ese rol y la recarga (o el enlace profundo) se queda en su ruta; si no, arranca
 * sin iniciar y la demostración empieza en /entrar. Cada elección en el selector (`DEMO_USER_EVENT`) reconstruye la
 * sesión con el rol elegido y ya iniciada, aunque sea el mismo usuario (tras cerrar sesión, volver a elegirlo tiene que
 * entrar), y sustituye la elección guardada. Un `POST /logout` correcto la borra. Los artículos se conservan entre
 * usuarios, como en los e2e.
 */
export function installShowcase() {
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
  const articleStore = createArticleStore()
  const build = (signedIn: boolean) => createMockFeatures(roleFor(readStored(picker)), { articleStore, signedIn })

  // El selector se preselecciona con `localStorage`: se deja el usuario de la pestaña, o nada si no hay.
  const remembered = readStored(session)
  writeStored(picker, remembered)
  let features = build(remembered !== null)
  window.addEventListener(DEMO_USER_EVENT, () => {
    writeStored(session, readStored(picker))
    features = build(true)
  })

  const network = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init)
    const url = new URL(request.url, window.location.href)
    if (!isApiUrl(url, window.location.origin)) return network(request)
    request.signal.throwIfAborted()
    const response = await respondToApi({ features, request, appUrl, setCookie: writeCookie })
    request.signal.throwIfAborted()
    if (request.method === 'POST' && /^\/api\/logout\/?$/.test(url.pathname) && response.ok) {
      writeStored(session, null)
      writeStored(picker, null)
    }
    return response
  }
}
