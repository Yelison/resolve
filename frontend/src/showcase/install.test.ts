import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_USER_EVENT, DEMO_USER_STORAGE_KEY } from '../api/client'
import { installShowcase } from './install'

const CUSTOMER = 'maria.perez@cliente.example'
const originalFetch = window.fetch

/** Vuelve a instalar sobre el `fetch` original: cada prueba arranca como una carga de página nueva. */
function load() {
  window.fetch = originalFetch
  installShowcase()
}

const api = (path: string, init?: RequestInit) => window.fetch(`${window.location.origin}/api${path}`, init)

async function csrfToken() {
  await api('/me')
  return /XSRF-TOKEN=([^;]+)/.exec(document.cookie)?.[1] ?? ''
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  window.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('installShowcase · sesión de la pestaña', () => {
  it('sin elección guardada arranca sin sesión', async () => {
    load()
    expect((await api('/me')).status).toBe(401)
  })

  it('con una elección guardada arranca con sesión y con el rol elegido', async () => {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    load()
    const response = await api('/me')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ role: 'customer' })
  })

  it('una elección en localStorage de otra visita no cuenta: solo la de la pestaña', async () => {
    localStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    load()
    expect((await api('/me')).status).toBe(401)
    expect(localStorage.getItem(DEMO_USER_STORAGE_KEY)).toBeNull()
  })

  it('deja la elección de la pestaña en el selector para que se preseleccione', () => {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    load()
    expect(localStorage.getItem(DEMO_USER_STORAGE_KEY)).toBe(CUSTOMER)
  })

  it('elegir un usuario guarda la elección en la pestaña y sustituye la anterior', async () => {
    load()
    localStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    window.dispatchEvent(new Event(DEMO_USER_EVENT))
    expect(sessionStorage.getItem(DEMO_USER_STORAGE_KEY)).toBe(CUSTOMER)
    expect(await (await api('/me')).json()).toMatchObject({ role: 'customer' })

    localStorage.setItem(DEMO_USER_STORAGE_KEY, 'laura.mendez@acme.example')
    window.dispatchEvent(new Event(DEMO_USER_EVENT))
    expect(sessionStorage.getItem(DEMO_USER_STORAGE_KEY)).toBe('laura.mendez@acme.example')
  })

  it('cerrar sesión borra la elección: la recarga siguiente no entra', async () => {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    load()
    const token = await csrfToken()
    const result = await api('/logout', { method: 'POST', headers: { 'X-XSRF-TOKEN': token } })
    expect(result.status).toBe(200)
    expect(sessionStorage.getItem(DEMO_USER_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(DEMO_USER_STORAGE_KEY)).toBeNull()

    load()
    expect((await api('/me')).status).toBe(401)
  })

  it('un cierre de sesión rechazado (sin token CSRF) conserva la elección', async () => {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, CUSTOMER)
    load()
    expect((await api('/logout', { method: 'POST' })).status).toBe(403)
    expect(sessionStorage.getItem(DEMO_USER_STORAGE_KEY)).toBe(CUSTOMER)
  })

  it('si el almacenamiento lanza, no rompe y arranca sin sesión', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denegado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denegado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denegado', 'SecurityError')
    })
    expect(() => load()).not.toThrow()
    expect((await api('/me')).status).toBe(401)
    expect(() => window.dispatchEvent(new Event(DEMO_USER_EVENT))).not.toThrow()
    expect((await api('/me')).status).toBe(200)
  })
})
