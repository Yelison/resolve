import { DEMO_USER_EVENT, DEMO_USER_STORAGE_KEY } from '../api/client'
import { createArticleStore } from '../../e2e/mocks/knowledge'
import { createMockFeatures } from '../../e2e/mocks/api'
import { demoCreatedIn, demoWorkspaces, NUEVA_PERSONA } from '../../e2e/mocks/session'
import { isApiUrl, respondToApi } from './adapter'
import { entersWithoutWorkspace, roleFor } from './users'

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
  // La demostración corre en el modo `open` (`resolve.organizations.creation`): crear un espacio no pide ser administrador,
  // y quien no tiene ninguno entra a «Crea tu espacio» (el cliente no ve la opción en la interfaz).
  // Solo la administración tiene varios espacios (agente en uno, cliente en otro): el selector tiene algo que mostrar.
  const build = (signedIn: boolean) => {
    const chosen = readStored(picker)
    const role = roleFor(chosen)
    if (entersWithoutWorkspace(chosen)) {
      // Sin ninguna membresía: el servidor responde `401` `no-membership` con su correo y su nombre hasta que cree el primero.
      return createMockFeatures(role, {
        articleStore,
        signedIn,
        creation: 'open',
        organizations: [],
        refused: 'no-membership',
        identity: NUEVA_PERSONA,
      })
    }
    const organizations = demoWorkspaces[role]
    // El administrador de la demostración ya creó dos de sus espacios: crear otro es posible, y un cuarto, no.
    return createMockFeatures(role, {
      articleStore,
      signedIn,
      creation: 'open',
      organizations,
      createdIn: organizations && role === 'admin' ? demoCreatedIn : undefined,
    })
  }

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
