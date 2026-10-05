import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, DEMO_USER_STORAGE_KEY, isApiError, toApiPage, unwrap, versionFromEtag } from './client'

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

  it('nunca lo envía en producción aunque haya un usuario guardado', async () => {
    await expect(demoHeaderSentIn('production')).resolves.toBeNull()
  })
})
