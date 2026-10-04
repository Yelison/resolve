import { describe, expect, it } from 'vitest'
import { ApiError, isApiError, toApiPage, unwrap, versionFromEtag } from './client'

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
