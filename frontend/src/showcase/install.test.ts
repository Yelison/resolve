import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_USER_EVENT, DEMO_USER_STORAGE_KEY } from '../api/client'
import { NUEVA_PERSONA } from '../../e2e/mocks/session'
import { installShowcase } from './install'
import { showcaseUsers } from './users'

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

  it('la administración es administradora en Acme y Kora Fitness, agente en Lumen Diseño y cliente en Norte Viajes', async () => {
    await signIn(ADMIN)
    const session = await me()
    expect(session.organizations.map((org: { name: string; role: string }) => [org.name, org.role])).toEqual([
      ['Acme Studio', 'admin'],
      ['Kora Fitness', 'admin'],
      ['Lumen Diseño', 'agent'],
      ['Norte Viajes', 'customer'],
    ])
    expect(session.organizations[3].memberCount).toBeNull()
  })

  it('el rol de la sesión sigue al espacio activo: en Norte Viajes es cliente, y las demás features lo respetan', async () => {
    const token = await signIn(ADMIN)
    const [, , lumen, norte] = (await me()).organizations
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
    const [, , lumen] = (await me()).organizations
    expect((await leave(lumen.id, token)).status).toBe(204)
    expect((await me()).organizations.map((org: { name: string }) => org.name)).toEqual([
      'Acme Studio',
      'Kora Fitness',
      'Norte Viajes',
    ])
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
    const [acme, , , norte] = (await me()).organizations
    expect((await leave(norte.id, token)).status).toBe(403)
    const refused = await leave(acme.id, token)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ type: LAST_ADMIN })
    expect((await me()).organizations).toHaveLength(4)
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

describe('installShowcase · crear espacios en la demostración', () => {
  const ADMIN = 'yelisson.ortiz@acme.example'
  const AGENT = 'laura.mendez@acme.example'
  const LIMIT = 'https://resolve.example/problems/organization-limit'
  const COLORS = ['blue', 'green', 'magenta', 'orange', 'violet', 'teal', 'brick', 'slate']

  async function signIn(email: string) {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, email)
    load()
    return csrfToken()
  }
  const me = async () => (await api('/me')).json()
  const create = (token: string | null, body: unknown) =>
    api('/organizations', {
      method: 'POST',
      headers: { ...(token ? { 'X-XSRF-TOKEN': token } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const gettingStarted = async () => (await (await api('/tickets/metrics')).json()).gettingStarted
  const write = (token: string, path: string, body: unknown) =>
    api(path, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('la demostración corre en el modo abierto: el administrador ha creado 2 de 3 y puede crear otro, y el agente también', async () => {
    await signIn(ADMIN)
    expect((await me()).organizationCreation).toEqual({ allowed: true, created: 2, limit: 3 })
    await signIn(AGENT)
    expect((await me()).organizationCreation).toEqual({ allowed: true, created: 0, limit: 3 })
  })

  it('crea el espacio: 201 con el Me nuevo, administrador, con su color calculado, y la sesión pasa a él', async () => {
    const token = await signIn(ADMIN)
    const response = await create(token, { name: '  Taller Sur  ', timeZone: 'Europe/Madrid' })
    expect(response.status).toBe(201)
    const session = await response.json()
    expect(session).toMatchObject({
      role: 'admin',
      organization: { name: 'Taller Sur', timeZone: 'Europe/Madrid' },
      organizationCreation: { allowed: false, created: 3, limit: 3 },
    })
    const created = session.organizations.at(-1)
    expect(created).toMatchObject({ name: 'Taller Sur', role: 'admin', memberCount: 1 })
    expect(created.id).toBe(session.organization.id)
    // `keys[último byte del id mod 8]`.
    expect(created.color).toBe(COLORS[Number.parseInt(created.id.replaceAll('-', '').slice(-2), 16) % 8])
    expect(session.organizations).toHaveLength(5)
    expect(await me()).toMatchObject({ organization: { name: 'Taller Sur' } })
  })

  it('Me.organizations va por nombre sin distinguir mayúsculas, como el servidor (y no por alta)', async () => {
    const token = await signIn(ADMIN)
    const names = async () => (await me()).organizations.map((org: { name: string }) => org.name)
    expect(await names()).toEqual(['Acme Studio', 'Kora Fitness', 'Lumen Diseño', 'Norte Viajes'])
    // «acme estudio» va antes que «Acme Studio» aunque sea minúscula (una comparación por código la pondría la última) y
    // el espacio nuevo no entra al final de la lista.
    expect((await create(token, { name: 'acme estudio', timeZone: 'Europe/Madrid' })).status).toBe(201)
    expect(await names()).toEqual(['acme estudio', 'Acme Studio', 'Kora Fitness', 'Lumen Diseño', 'Norte Viajes'])
  })

  it('al límite responde 409 con el type organization-limit y no crea nada; salir de uno creado devuelve el hueco', async () => {
    const token = await signIn(ADMIN)
    expect((await create(token, { name: 'Uno', timeZone: 'America/Bogota' })).status).toBe(201)
    const refused = await create(token, { name: 'Dos', timeZone: 'America/Bogota' })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ type: LIMIT })
    expect((await me()).organizations).toHaveLength(5)
    // Kora Fitness es de los que creó: salir de él libera un hueco (hay otros administradores activos de sobra: no es el actual).
    const kora = (await me()).organizations.find((org: { name: string }) => org.name === 'Kora Fitness')
    const left = await api(`/me/organizations/${kora.id}`, { method: 'DELETE', headers: { 'X-XSRF-TOKEN': token } })
    expect(left.status).toBe(204)
    expect((await me()).organizationCreation).toEqual({ allowed: true, created: 2, limit: 3 })
    expect((await create(token, { name: 'Tres', timeZone: 'America/Bogota' })).status).toBe(201)
  })

  it('los errores van en el orden del contrato: 400 por campo y después el 409; en el modo abierto no hay 403', async () => {
    const token = await signIn(AGENT)
    const invalid = await create(token, { name: '   ', timeZone: 'No/Existe' })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).errors.map((error: { field: string }) => error.field)).toEqual(['name', 'timeZone'])
    const tooLong = await create(token, { name: 'x'.repeat(121), timeZone: 'Europe/Madrid' })
    expect(tooLong.status).toBe(400)
    // Con el cuerpo válido, un agente sin espacios de administración también crea: en `open` no hay 403.
    const agent = await create(token, { name: 'Mío', timeZone: 'Europe/Madrid' })
    expect(agent.status).toBe(201)
    expect(await agent.json()).toMatchObject({ role: 'admin', organization: { name: 'Mío' } })
    // Sin token CSRF se rechaza como cualquier escritura, antes que el cuerpo.
    expect((await create(null, { name: '', timeZone: '' })).status).toBe(403)
  })

  it('crear no lleva X-Organization-Id: no se compara con el espacio que va a dejar de serlo', async () => {
    const token = await signIn(ADMIN)
    const response = await api('/organizations', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json', 'X-Organization-Id': 'otro-espacio' },
      body: JSON.stringify({ name: 'Sin cabecera', timeZone: 'Europe/Madrid' }),
    })
    expect(response.status).toBe(201)
  })

  it('un espacio recién creado arranca con «Primeros pasos»; los demás, y el agente, sin ellos', async () => {
    const token = await signIn(ADMIN)
    expect(await gettingStarted()).toBeNull()
    await create(token, { name: 'Taller Sur', timeZone: 'Europe/Madrid' })
    expect(await gettingStarted()).toEqual({ invitedTeam: false, addedCustomer: false, publishedArticle: false })
  })

  it('cada paso se hace con su escritura real y, con los tres, el servidor deja de mandarlo', async () => {
    const token = await signIn(ADMIN)
    await create(token, { name: 'Taller Sur', timeZone: 'Europe/Madrid' })
    // Una escritura rechazada no hace el paso.
    expect((await write(token, '/members', { email: 'laura@acme.example', role: 'agent' })).status).toBe(400)
    expect((await gettingStarted()).invitedTeam).toBe(false)
    expect((await write(token, '/members', { email: 'nueva@taller.example', role: 'agent' })).status).toBe(201)
    expect(await gettingStarted()).toEqual({ invitedTeam: true, addedCustomer: false, publishedArticle: false })
    expect(
      (await write(token, '/customers', { name: 'Cliente Uno', email: 'uno@cliente.example', company: null })).status,
    ).toBe(201)
    expect(await gettingStarted()).toEqual({ invitedTeam: true, addedCustomer: true, publishedArticle: false })
    const drafts = await (await api('/knowledge/articles?status=draft')).json()
    const draft = drafts.items?.[0] ?? drafts[0]
    expect((await write(token, `/knowledge/articles/${draft.slug}/publish`, {})).status).toBe(200)
    expect(await gettingStarted()).toBeNull()
  })
})

describe('installShowcase · «Persona nueva (sin espacio)»', () => {
  const NEWCOMER = 'nueva.persona@demo.example'
  const NO_MEMBERSHIP = 'https://resolve.example/problems/no-membership'

  async function signIn() {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, NEWCOMER)
    load()
    return csrfToken()
  }
  const create = (token: string, body: unknown) =>
    api('/organizations', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('su correo es el de la cuenta sin espacio de la API (V1009) y es una opción del selector', () => {
    expect(NEWCOMER).toBe(NUEVA_PERSONA.email)
    expect(showcaseUsers.find((user) => user.email === NEWCOMER)).toMatchObject({
      label: 'Persona nueva (sin espacio)',
      withoutWorkspace: true,
    })
  })

  it('/me responde el 401 no-membership con su correo, su nombre y canCreateOrganization: true (modo abierto)', async () => {
    await signIn()
    const response = await api('/me')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      type: NO_MEMBERSHIP,
      canCreateOrganization: true,
      email: NEWCOMER,
      name: 'Nueva Persona',
    })
  })

  it('ninguna otra escritura la admite, solo crear: el resto es el mismo 401', async () => {
    const token = await signIn()
    const select = await api('/session/organization', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: '0192f000-0000-7000-8000-000000000001' }),
    })
    expect(select.status).toBe(401)
    expect(await select.json()).toMatchObject({ type: NO_MEMBERSHIP })
  })

  it('crear su espacio: 400 por campo antes que nada, y con el cuerpo válido 201 con ella como administradora', async () => {
    const token = await signIn()
    expect((await create(token, { name: '', timeZone: 'Europe/Madrid' })).status).toBe(400)
    const response = await create(token, { name: 'Lumen Diseño', timeZone: 'Europe/Madrid' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      role: 'admin',
      user: { name: 'Nueva Persona', email: NEWCOMER },
      organization: { name: 'Lumen Diseño', timeZone: 'Europe/Madrid' },
      organizationCreation: { allowed: true, created: 1, limit: 3 },
      organizations: [{ name: 'Lumen Diseño', role: 'admin' }],
    })
    // Desde entonces la sesión es de ese espacio, con «Primeros pasos».
    expect(await (await api('/me')).json()).toMatchObject({ organization: { name: 'Lumen Diseño' } })
    expect((await (await api('/tickets/metrics')).json()).gettingStarted).toEqual({
      invitedTeam: false,
      addedCustomer: false,
      publishedArticle: false,
    })
  })

  it('al recargar vuelve al estado inicial: el espacio creado no se guarda', async () => {
    const token = await signIn()
    await create(token, { name: 'Lumen Diseño', timeZone: 'Europe/Madrid' })
    expect((await api('/me')).status).toBe(200)
    load()
    const reloaded = await api('/me')
    expect(reloaded.status).toBe(401)
    expect(await reloaded.json()).toMatchObject({ type: NO_MEMBERSHIP })
  })

  it('cerrar sesión la deja fuera y borra la elección', async () => {
    const token = await signIn()
    const logout = await api('/logout', { method: 'POST', headers: { 'X-XSRF-TOKEN': token } })
    expect(logout.status).toBe(200)
    expect(sessionStorage.getItem(DEMO_USER_STORAGE_KEY)).toBeNull()
    // Ya no es «sin espacio»: es el 401 de quien no tiene sesión, que lleva al selector.
    const after = await api('/me')
    expect(after.status).toBe(401)
    expect((await after.json()).type ?? 'about:blank').toBe('about:blank')
  })
})
