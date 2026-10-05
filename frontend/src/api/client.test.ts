import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  ApiError,
  CSRF_REJECTION_DETAIL,
  DEMO_USER_STORAGE_KEY,
  isApiError,
  readCsrfToken,
  toApiPage,
  UNAUTHORIZED_EVENT,
  unwrap,
  versionFromEtag,
  type UnauthorizedDetail,
} from './client'

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

  const problem = (status: number, detail: string) =>
    new Response(JSON.stringify({ status, title: 'Problema', detail }), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    })
  const csrfRejection = () => problem(403, CSRF_REJECTION_DETAIL)

  afterEach(() => {
    setCookie(null)
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

  it('una escritura sin token que recibe cualquier 403 relee /me y se reintenta con el token nuevo, sin depender del texto', async () => {
    const network = stubFetch(
      problem(403, 'Cualquier otro texto.'),
      new Response('{}', { status: 200 }),
      new Response('{}'),
    )
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

  it('sin cookie ni siquiera tras releer /me (backend sin CSRF) devuelve el 403 original: un GET más y nada de reintento', async () => {
    const network = stubFetch(problem(403, 'Tu rol no permite esta acción.'), new Response('{}', { status: 200 }))
    const { response, error } = await api.POST('/session/organization', { body: organization })
    expect(response.status).toBe(403)
    expect(error).toMatchObject({ detail: 'Tu rol no permite esta acción.' })
    expect(network.sent).toHaveLength(2)
    expect(urlOf(network.sent[1]!)).toMatch(/\/api\/me$/)
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
