import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  ApiError,
  DEMO_USER_STORAGE_KEY,
  isApiError,
  PROBLEM_TYPES,
  readCsrfToken,
  SESSION_CHANGED_DETAIL,
  setSessionWatch,
  setWriteGuard,
  toApiPage,
  UNAUTHORIZED_EVENT,
  unwrap,
  versionFromEtag,
  type UnauthorizedDetail,
} from './client'
import type { Me } from './schema'
import { adminMe } from '../test/api'

describe('unwrap', () => {
  it('devuelve los datos de una respuesta correcta', async () => {
    const response = new Response('{}', { status: 200 })
    await expect(unwrap(Promise.resolve({ data: { ok: true }, response }))).resolves.toEqual({ ok: true })
  })

  it('convierte los Problem Details en ApiError con errores por campo', async () => {
    const response = new Response(null, { status: 400 })
    const problem = {
      status: 400,
      title: 'Petición no válida',
      errors: [{ field: 'subject', message: 'Es obligatorio.' }],
    }
    const error = await unwrap(Promise.resolve({ error: problem, response })).catch((caught: unknown) => caught)
    expect(isApiError(error, 400)).toBe(true)
    expect((error as ApiError).fieldError('subject')).toBe('Es obligatorio.')
  })

  it('crea un problema genérico cuando el cuerpo no lo es', async () => {
    const response = new Response(null, { status: 502, statusText: 'Bad Gateway' })
    const error = await unwrap(Promise.resolve({ error: 'html', response })).catch((caught: unknown) => caught)
    expect((error as ApiError).problem).toEqual({ status: 502, title: 'Bad Gateway' })
  })
})

describe('helpers', () => {
  it.each([
    ['"3"', 3],
    ['W/"3"', undefined],
    [null, undefined],
  ])('versionFromEtag(%j) → %j', (etag, version) => {
    expect(versionFromEtag(etag)).toBe(version)
  })

  it('convierte la página de la interfaz a la de la API', () => {
    expect(toApiPage(1)).toBe(0)
    expect(toApiPage(3)).toBe(2)
    expect(toApiPage(0)).toBe(0)
  })
})

describe('usuario de demostración', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  /** Hace una petición con el modo indicado y devuelve el valor que X-Demo-User llevó a la red (o null). */
  async function demoHeaderSentIn(mode: string, dev = false) {
    vi.stubEnv('MODE', mode)
    // DEV solo es true en el servidor de desarrollo; el build smoke lo lleva en false y aun así debe enviar la cabecera.
    vi.stubEnv('DEV', dev)
    localStorage.setItem(DEMO_USER_STORAGE_KEY, 'maria.perez@cliente.example')
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    await api.GET('/me')
    const request = (fetchMock.mock.calls[0] as unknown as [Request])[0]
    return request.headers.get('X-Demo-User')
  }

  it('lo envía en el build smoke, que no es el servidor de desarrollo', async () => {
    await expect(demoHeaderSentIn('smoke')).resolves.toBe('maria.perez@cliente.example')
  })

  it('lo envía en desarrollo', async () => {
    await expect(demoHeaderSentIn('development', true)).resolves.toBe('maria.perez@cliente.example')
  })

  it('no lo envía en un modo desconocido', async () => {
    await expect(demoHeaderSentIn('staging')).resolves.toBeNull()
  })

  it('nunca lo envía en producción aunque haya un usuario guardado', async () => {
    await expect(demoHeaderSentIn('production')).resolves.toBeNull()
  })
})

describe('CSRF', () => {
  const organization = { organizationId: '0192f000-0000-7000-8000-000000000001' }

  function setCookie(value: string | null) {
    document.cookie = value === null ? 'XSRF-TOKEN=; Max-Age=0; Path=/' : `XSRF-TOKEN=${value}; Path=/`
  }

  const problem = (status: number, detail: string, type?: string) =>
    new Response(JSON.stringify({ ...(type && { type }), status, title: 'Problema', detail }), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    })
  // El `detail` no se parece al del backend a propósito: lo que identifica el rechazo es el `type`.
  const csrfRejection = () => problem(403, 'Texto de otro idioma o de otra versión.', PROBLEM_TYPES.csrf)

  afterEach(() => {
    setCookie(null)
    setSessionWatch(null)
    setWriteGuard(null)
    vi.unstubAllGlobals()
  })

  const urlOf = (input: RequestInfo | URL) => (input instanceof Request ? input.url : String(input))

  /** Sustituye fetch con las respuestas dadas, en orden, y devuelve las peticiones que llegaron a la red. */
  function stubFetch(...responses: Response[]) {
    const sent: (Request | URL)[] = []
    vi.stubGlobal('fetch', (input: Request | URL) => {
      sent.push(input)
      return Promise.resolve(responses.shift() ?? new Response('{}', { status: 200 }))
    })
    /** La petición `index` que llegó a la red, que en estas pruebas siempre es un Request o la URL de /me. */
    const at = (index: number) => sent[index] as Request
    return { sent, at }
  }

  it('la petición que llega a fetch conserva su cuerpo legible y sus cabeceras, sin clones colgando', async () => {
    setCookie('token-1')
    const network = stubFetch()
    await api.PATCH('/me', { body: { name: 'Laura' } })
    const sent = network.at(0)
    expect(sent.method).toBe('PATCH')
    expect(sent.headers.get('Content-Type')).toMatch(/json/)
    expect(sent.headers.get('X-XSRF-TOKEN')).toBe('token-1')
    await expect(sent.json()).resolves.toEqual({ name: 'Laura' })
  })

  it('conserva las opciones de la petición original (cache, keepalive, mode, referrer…) en el primer envío y en el reintento', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }), new Response('{}', { status: 200 }))
    const respond = globalThis.fetch
    vi.stubGlobal('fetch', (input: Request | URL) => {
      if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
      return respond(input)
    })
    await api.POST('/session/organization', {
      body: organization,
      cache: 'no-store',
      keepalive: true,
      referrerPolicy: 'no-referrer',
      integrity: 'sha256-abc',
    })
    for (const index of [0, 2]) {
      const sent = network.at(index)
      expect(sent.cache, `cache del envío ${index}`).toBe('no-store')
      expect(sent.keepalive, `keepalive del envío ${index}`).toBe(true)
      expect(sent.referrerPolicy, `referrerPolicy del envío ${index}`).toBe('no-referrer')
      expect(sent.integrity, `integrity del envío ${index}`).toBe('sha256-abc')
      expect(sent.mode, `mode del envío ${index}`).toBe('cors')
    }
    expect(network.sent).toHaveLength(3)
  })

  it('una escritura sin cuerpo sale sin cuerpo', async () => {
    const network = stubFetch()
    await api.POST('/logout')
    expect(network.at(0).body).toBeNull()
  })

  it('el reintento lleva el mismo cuerpo que el primer envío, leído del mismo buffer', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }), new Response('{}', { status: 200 }))
    const respond = globalThis.fetch
    vi.stubGlobal('fetch', (input: Request | URL) => {
      if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
      return respond(input)
    })
    await api.POST('/session/organization', { body: organization })
    await expect(network.at(0).json()).resolves.toEqual(organization)
    await expect(network.at(2).json()).resolves.toEqual(organization)
    expect(network.at(2).headers.get('Content-Type')).toBe(network.at(0).headers.get('Content-Type'))
  })

  it('lee el token de la cookie XSRF-TOKEN', () => {
    expect(readCsrfToken()).toBeNull()
    setCookie('a%2Bb')
    expect(readCsrfToken()).toBe('a+b')
  })

  it.each(['POST', 'PATCH'] as const)('envía X-XSRF-TOKEN en %s', async (method) => {
    setCookie('token-1')
    const network = stubFetch()
    if (method === 'POST') await api.POST('/session/organization', { body: organization })
    else await api.PATCH('/me', { body: { name: 'Laura' } })
    expect(network.at(0).headers.get('X-XSRF-TOKEN')).toBe('token-1')
  })

  it('no lo envía en GET ni sin cookie', async () => {
    setCookie('token-1')
    const network = stubFetch()
    await api.GET('/me')
    expect(network.at(0).headers.has('X-XSRF-TOKEN')).toBe(false)
    setCookie(null)
    await api.POST('/session/organization', { body: organization })
    expect(network.at(1).headers.has('X-XSRF-TOKEN')).toBe(false)
  })

  it('si una escritura recibe el 403 de CSRF, relee /me y la reintenta una vez con el token nuevo y el mismo cuerpo', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }), new Response('{}', { status: 200 }))
    // La cookie llega con la respuesta de /me: el navegador la guarda mientras el reintento está en curso.
    const respond = globalThis.fetch
    vi.stubGlobal('fetch', (input: Request | URL) => {
      if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
      return respond(input)
    })
    const { response } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(200)
    expect(network.sent).toHaveLength(3)
    expect(urlOf(network.sent[1]!)).toMatch(/\/api\/me$/)
    const retry = network.at(2)
    expect(retry.method).toBe('POST')
    expect(retry.headers.get('X-XSRF-TOKEN')).toBe('token-nuevo')
    await expect(retry.json()).resolves.toEqual(organization)
  })

  it('un segundo 403 de CSRF se devuelve tal cual: no hay más reintentos', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }), csrfRejection())
    setCookie('token-viejo')
    const { response } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(403)
    expect(network.sent).toHaveLength(3)
  })

  it('un 403 de permisos no se reintenta', async () => {
    const network = stubFetch(problem(403, 'Tu rol no permite esta acción.'))
    setCookie('token-1')
    const { response } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(403)
    expect(network.sent).toHaveLength(1)
  })

  it('una escritura sin token cuyo 403 no trae el type de CSRF no relee /me ni se reintenta, diga lo que diga el detail', async () => {
    const network = stubFetch(problem(403, 'Falta el token CSRF o no es válido.'), new Response('{}', { status: 200 }))
    setCookie(null)
    const { response, error } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(403)
    expect(error).toMatchObject({ detail: 'Falta el token CSRF o no es válido.' })
    expect(network.sent).toHaveLength(1)
  })

  it('una escritura sin token cuyo 403 trae el type de CSRF relee /me y se reintenta con el token nuevo, diga lo que diga el detail', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }), new Response('{}'))
    const respond = globalThis.fetch
    vi.stubGlobal('fetch', (input: Request | URL) => {
      if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
      return respond(input)
    })
    setCookie(null)
    const { response } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(200)
    expect(network.sent).toHaveLength(3)
    expect(network.at(0).headers.has('X-XSRF-TOKEN')).toBe(false)
    expect(network.at(2).headers.get('X-XSRF-TOKEN')).toBe('token-nuevo')
  })

  it('sin cookie ni siquiera tras releer /me devuelve el 403 original: un GET más y nada de reintento', async () => {
    const network = stubFetch(csrfRejection(), new Response('{}', { status: 200 }))
    const { response, error } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(403)
    expect(error).toMatchObject({ type: PROBLEM_TYPES.csrf })
    expect(network.sent).toHaveLength(2)
    expect(urlOf(network.sent[1]!)).toMatch(/\/api\/me$/)
  })

  describe('la organización que muestra la pantalla viaja en X-Organization-Id (issue #60)', () => {
    const mismatch = (detail = 'Texto que no se compara.') => problem(409, detail, PROBLEM_TYPES.organizationMismatch)
    /** Un `Me` completo (el contrato no admite campos de más ni de menos) en esa organización. */
    const meIn = (organizationId: string) =>
      new Response(JSON.stringify({ ...adminMe, organization: { ...adminMe.organization, id: organizationId } }), {
        status: 200,
      })

    /** La pantalla muestra `org-a`; `refreshed` cuenta las veces que la aplicación se puso al día. */
    function showing(organization: string | null) {
      const watch = {
        organization,
        refreshed: 0,
      }
      setSessionWatch({
        identity: () => (watch.organization ? `${adminMe.user.id}:${watch.organization}` : null),
        organization: () => watch.organization,
        observe: () => {},
        refresh: () => void (watch.refreshed += 1),
      })
      return watch
    }

    it.each(['POST', 'PATCH'] as const)('cada escritura (%s) lleva la organización de la pantalla', async (method) => {
      showing('org-a')
      const network = stubFetch()
      if (method === 'POST')
        await api.POST('/tickets', { body: { customerId: 'c-1', subject: 'Asunto', description: 'x' } })
      else await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(network.at(0).headers.get('X-Organization-Id')).toBe('org-a')
    })

    it('las lecturas no la llevan', async () => {
      showing('org-a')
      const network = stubFetch()
      await api.GET('/me')
      expect(network.at(0).headers.has('X-Organization-Id')).toBe(false)
    })

    it('elegir organización y cerrar sesión no la llevan', async () => {
      showing('org-a')
      const network = stubFetch()
      await api.POST('/session/organization', { body: organization })
      await api.POST('/logout')
      expect(network.at(0).headers.has('X-Organization-Id')).toBe(false)
      expect(network.at(1).headers.has('X-Organization-Id')).toBe(false)
    })

    it('sin sesión cargada no hay organización que enviar', async () => {
      showing(null)
      const network = stubFetch()
      await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(network.at(0).headers.has('X-Organization-Id')).toBe(false)
    })

    it('sin nadie que vigile la sesión tampoco se envía', async () => {
      const network = stubFetch()
      await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(network.at(0).headers.has('X-Organization-Id')).toBe(false)
    })

    it('lleva la organización del momento en que se compuso, no la que haya al salir tras esperar la guardia', async () => {
      const watch = showing('org-a')
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      // La guardia espera una comprobación en vuelo; mientras tanto la pantalla ya muestra otra organización.
      setWriteGuard(async () => {
        await held
        return false
      })
      const network = stubFetch()
      const write = api.PATCH('/me', { body: { name: 'Laura' } })
      watch.organization = 'org-b'
      release()
      await write
      expect(network.at(0).headers.get('X-Organization-Id')).toBe('org-a')
    })

    it('el reintento de CSRF conserva la organización con la que se compuso la escritura', async () => {
      const watch = showing('org-a')
      const network = stubFetch(csrfRejection(), meIn('org-a'), new Response('{}', { status: 200 }))
      const respond = globalThis.fetch
      vi.stubGlobal('fetch', (input: Request | URL) => {
        if (urlOf(input).endsWith('/api/me')) {
          setCookie('token-nuevo')
          watch.organization = 'org-a'
        }
        return respond(input)
      })
      await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(network.sent).toHaveLength(3)
      expect(network.at(2).headers.get('X-Organization-Id')).toBe('org-a')
    })

    it('el 409 de organización distinta llega como el aviso de sesión cambiada y la aplicación se pone al día', async () => {
      const watch = showing('org-a')
      stubFetch(mismatch('Otro texto, de otro idioma.'))
      const { response, error } = await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(response.status).toBe(409)
      expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
      expect(watch.refreshed).toBe(1)
    })

    it('un 409 de otra cosa llega tal cual y no pone nada al día, diga lo que diga el detail', async () => {
      const watch = showing('org-a')
      stubFetch(problem(409, 'La organización cambió'))
      const { response, error } = await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(response.status).toBe(409)
      expect(error).toMatchObject({ detail: 'La organización cambió' })
      expect(watch.refreshed).toBe(0)
    })

    it('también si lo recibe el segundo intento, tras reintentar por CSRF', async () => {
      const watch = showing('org-a')
      const network = stubFetch(csrfRejection(), meIn('org-a'), mismatch())
      const respond = globalThis.fetch
      vi.stubGlobal('fetch', (input: Request | URL) => {
        if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
        return respond(input)
      })
      const { response, error } = await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(network.sent).toHaveLength(3)
      expect(response.status).toBe(409)
      expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
      expect(watch.refreshed).toBe(1)
    })

    it('el 409 que da el propio cliente (el reintento de CSRF ve otra organización) no vuelve a pedir ponerse al día', async () => {
      const watch = showing('org-a')
      const network = stubFetch(csrfRejection(), meIn('org-b'), new Response('{}', { status: 200 }))
      const respond = globalThis.fetch
      vi.stubGlobal('fetch', (input: Request | URL) => {
        if (urlOf(input).endsWith('/api/me')) setCookie('token-nuevo')
        return respond(input)
      })
      const { response, error } = await api.PATCH('/me', { body: { name: 'Laura' } })
      expect(response.status).toBe(409)
      expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
      expect(network.sent).toHaveLength(2) // el PATCH y el GET /me: el reintento no sale
      expect(watch.refreshed).toBe(0) // `observe` ya pone la pestaña al día; no hace falta pedirlo otra vez
    })
  })

  describe('el reintento también pasa por la comprobación de la sesión (H-2, L-1)', () => {
    const meResponse = (organizationId: string) =>
      new Response(JSON.stringify({ user: { id: 'u1' }, organization: { id: organizationId } }), { status: 200 })

    /** La sesión que la pantalla muestra, cambiable por el test; `observed` recoge lo que ve el reintento. */
    function watchSession(initial: string | null) {
      const watch = { shown: initial, observed: [] as Me[] }
      setSessionWatch({
        identity: () => watch.shown,
        organization: () => watch.shown?.split(':')[1] ?? null,
        observe: (me) => watch.observed.push(me),
        refresh: () => {},
      })
      return watch
    }

    /** La cookie llega con la respuesta de `/me`, como en el navegador. */
    function cookieArrivesWithMe(onMe?: () => void) {
      const respond = globalThis.fetch
      vi.stubGlobal('fetch', (input: Request | URL) => {
        if (urlOf(input).endsWith('/api/me')) {
          setCookie('token-nuevo')
          onMe?.()
        }
        return respond(input)
      })
    }

    it('si el /me del reintento es otra organización, no hay segundo POST y recibe el 409 de sesión cambiada', async () => {
      const network = stubFetch(csrfRejection(), meResponse('org-b'), new Response('{}', { status: 200 }))
      cookieArrivesWithMe()
      const watch = watchSession('u1:org-a')
      const { response, error } = await api.POST('/session/organization', { body: organization })
      expect(response.status).toBe(409)
      expect(error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
      expect(network.sent).toHaveLength(2) // el POST y el GET /me: el reintento no sale
      expect(watch.observed).toHaveLength(1) // la aplicación vio ese /me para ponerse al día
    })

    it('compara con la sesión del momento del envío: aunque la pantalla ya se haya puesto al día, no reintenta (L-1)', async () => {
      const network = stubFetch(csrfRejection(), meResponse('org-b'), new Response('{}', { status: 200 }))
      // Mientras el /me del reintento está en vuelo, la pestaña recibe el cambio por el canal y actualiza su caché a org-b.
      const watch = watchSession('u1:org-a')
      cookieArrivesWithMe(() => (watch.shown = 'u1:org-b'))
      const { response } = await api.POST('/session/organization', { body: organization })
      expect(response.status).toBe(409)
      expect(network.sent).toHaveLength(2)
    })

    it('si el /me del reintento es la misma sesión que al enviar, se reintenta como antes', async () => {
      const network = stubFetch(csrfRejection(), meResponse('org-a'), new Response('{}', { status: 200 }))
      cookieArrivesWithMe()
      watchSession('u1:org-a')
      const { response } = await api.POST('/session/organization', { body: organization })
      expect(response.status).toBe(200)
      expect(network.sent).toHaveLength(3)
    })

    it('sin sesión al enviar (nada que comparar) se reintenta como antes', async () => {
      const network = stubFetch(csrfRejection(), meResponse('org-b'), new Response('{}', { status: 200 }))
      cookieArrivesWithMe()
      watchSession(null)
      expect((await api.POST('/session/organization', { body: organization })).response.status).toBe(200)
      expect(network.sent).toHaveLength(3)
    })

    it('si la guardia de escrituras se cierra mientras se relee /me, tampoco se reintenta', async () => {
      const network = stubFetch(csrfRejection(), meResponse('org-a'), new Response('{}', { status: 200 }))
      cookieArrivesWithMe()
      watchSession('u1:org-a')
      let consulted = 0
      setWriteGuard(() => Promise.resolve(++consulted > 1)) // abierta al enviar, cerrada al reintentar
      const { response } = await api.POST('/session/organization', { body: organization })
      expect(response.status).toBe(409)
      expect(network.sent).toHaveLength(2)
    })

    it.each([
      ['HTML', () => new Response('<html>portal</html>', { status: 200 })],
      ['un JSON que no es un Me', () => new Response('{"ok":true}', { status: 200 })],
    ])('un /me 200 que es %s: no se reintenta y se devuelve el 403 original', async (_name, answer) => {
      const network = stubFetch(csrfRejection(), answer(), new Response('{}'))
      cookieArrivesWithMe()
      watchSession('u1:org-a')
      const { response, error } = await api.POST('/session/organization', { body: organization })
      expect(response.status).toBe(403)
      expect(error).toMatchObject({ type: PROBLEM_TYPES.csrf })
      expect(network.sent).toHaveLength(2) // el POST y el GET /me: nada de reintento
    })

    it('un /me que no es un Me, sin sesión al enviar (nada que comparar), no impide el reintento', async () => {
      const network = stubFetch(csrfRejection(), new Response('no es json', { status: 200 }), new Response('{}'))
      cookieArrivesWithMe()
      watchSession(null)
      expect((await api.POST('/session/organization', { body: organization })).response.status).toBe(200)
      expect(network.sent).toHaveLength(3)
    })

    it('un 401 en el /me del reintento no lo impide: el reintento recibe el 401 de la sesión muerta', async () => {
      const network = stubFetch(
        csrfRejection(),
        new Response('{}', { status: 401 }),
        new Response('{}', { status: 401 }),
      )
      cookieArrivesWithMe()
      watchSession('u1:org-a')
      expect((await api.POST('/session/organization', { body: organization })).response.status).toBe(401)
      expect(network.sent).toHaveLength(3)
    })
  })

  it('un 403 de CSRF en un GET no se reintenta', async () => {
    const network = stubFetch(csrfRejection())
    const { response } = await api.GET('/me')
    expect(response.status).toBe(403)
    expect(network.sent).toHaveLength(1)
  })
})

describe('401', () => {
  afterEach(() => vi.unstubAllGlobals())

  function collectEvents() {
    const events: UnauthorizedDetail[] = []
    const listener = (event: Event) => events.push((event as CustomEvent<UnauthorizedDetail>).detail)
    window.addEventListener(UNAUTHORIZED_EVENT, listener)
    return { events, stop: () => window.removeEventListener(UNAUTHORIZED_EVENT, listener) }
  }

  it('avisa del 401 con el método y la ruta de la API', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 401 })))
    const { events, stop } = collectEvents()
    await api.GET('/me')
    await api.PATCH('/me', { body: { name: 'Laura' } })
    stop()
    expect(events).toEqual([
      { method: 'GET', path: '/me' },
      { method: 'PATCH', path: '/me' },
    ])
  })

  it('no avisa con otras respuestas', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 403 })))
    const { events, stop } = collectEvents()
    await api.GET('/me')
    stop()
    expect(events).toEqual([])
  })
})
