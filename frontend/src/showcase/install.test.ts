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

describe('installShowcase · espacios de la demostración', () => {
  const ADMIN = 'yelisson.ortiz@acme.example'
  const AGENT = 'laura.mendez@acme.example'
  const LAST_ADMIN = 'https://resolve.example/problems/last-admin'
  const LAST_ORGANIZATION = 'https://resolve.example/problems/last-organization'

  async function signIn(email: string) {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, email)
    load()
    return csrfToken()
  }
  const me = async () => (await api('/me')).json()
  const leave = (id: string, token: string) =>
    api(`/me/organizations/${id}`, { method: 'DELETE', headers: { 'X-XSRF-TOKEN': token } })
  const choose = (organizationId: string, token: string) =>
    api('/session/organization', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    })

  it('la administración es administradora en Acme, agente en Lumen Diseño y cliente en Norte Viajes', async () => {
    await signIn(ADMIN)
    const session = await me()
    expect(session.organizations.map((org: { name: string; role: string }) => [org.name, org.role])).toEqual([
      ['Acme Studio', 'admin'],
      ['Lumen Diseño', 'agent'],
      ['Norte Viajes', 'customer'],
    ])
    expect(session.organizations[2].memberCount).toBeNull()
  })

  it('el rol de la sesión sigue al espacio activo: en Norte Viajes es cliente, y las demás features lo respetan', async () => {
    const token = await signIn(ADMIN)
    const [, lumen, norte] = (await me()).organizations
    expect((await choose(norte.id, token)).status).toBe(200)
    expect(await me()).toMatchObject({
      role: 'customer',
      customerId: 'c-maria',
      organization: { name: 'Norte Viajes' },
    })
    expect((await api('/tickets/attention?scope=mine')).status).toBe(403)
    expect((await choose(lumen.id, token)).status).toBe(200)
    expect(await me()).toMatchObject({ role: 'agent', customerId: null })
    expect((await api('/tickets/attention?scope=mine')).status).toBe(200)
  })

  it('salir de un espacio lo quita de la lista; salir otra vez es el mismo 404', async () => {
    const token = await signIn(ADMIN)
    const [, lumen] = (await me()).organizations
    expect((await leave(lumen.id, token)).status).toBe(204)
    expect((await me()).organizations.map((org: { name: string }) => org.name)).toEqual(['Acme Studio', 'Norte Viajes'])
    expect((await leave(lumen.id, token)).status).toBe(404)
    expect((await leave('desconocido', token)).status).toBe(404)
  })

  it('salir del espacio actual pasa al siguiente utilizable, con su rol', async () => {
    const token = await signIn(ADMIN)
    const [, lumen] = (await me()).organizations
    await choose(lumen.id, token)
    expect((await leave(lumen.id, token)).status).toBe(204)
    expect(await me()).toMatchObject({ role: 'admin', organization: { name: 'Acme Studio' } })
  })

  it('un cliente no sale (403) y el último administrador tampoco (409 last-admin)', async () => {
    const token = await signIn(ADMIN)
    const [acme, , norte] = (await me()).organizations
    expect((await leave(norte.id, token)).status).toBe(403)
    const refused = await leave(acme.id, token)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ type: LAST_ADMIN })
    expect((await me()).organizations).toHaveLength(3)
  })

  it('con otra persona que también administra, el último administrador sale: cambia el rol y puede salir', async () => {
    const token = await signIn(ADMIN)
    const [acme] = (await me()).organizations
    const members = await (await api('/members')).json()
    const laura = members.find((member: { name: string }) => member.name === 'Laura Méndez')
    const promoted = await api(`/members/${laura.id}/role`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(promoted.status).toBe(200)
    expect((await leave(acme.id, token)).status).toBe(204)
    expect((await me()).organization.name).toBe('Lumen Diseño')
  })

  it('quien tiene un solo espacio no puede salir (409 last-organization)', async () => {
    const token = await signIn(AGENT)
    const session = await me()
    expect(session.organizations).toHaveLength(1)
    const refused = await leave(session.organization.id, token)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ type: LAST_ORGANIZATION })
  })

  it('salir sin token CSRF se rechaza como cualquier escritura', async () => {
    await signIn(ADMIN)
    const [, lumen] = (await me()).organizations
    expect((await api(`/me/organizations/${lumen.id}`, { method: 'DELETE' })).status).toBe(403)
  })
})
