import { describe, expect, it, vi } from 'vitest'
import { createMockFeatures } from '../../e2e/mocks/api'
import { isApiUrl, respondToApi } from './adapter'

const APP_URL = 'https://yelison.github.io/resolve'

function call(path: string, init?: RequestInit, signedIn = true) {
  const setCookie = vi.fn()
  const features = createMockFeatures('admin', { signedIn })
  const request = new Request(`https://yelison.github.io/api${path}`, init)
  return { setCookie, response: respondToApi({ features, request, appUrl: APP_URL, setCookie }) }
}

describe('respondToApi', () => {
  it('responde 501 a una petición que ningún manejador atiende, como el despachador de los e2e', async () => {
    const { response } = call('/ruta-que-no-existe')
    const result = await response
    expect(result.status).toBe(501)
    expect(await result.json()).toMatchObject({ title: 'Sin fixture para GET /ruta-que-no-existe' })
  })

  it('atiende una petición con los manejadores de los e2e', async () => {
    const result = await call('/me').response
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ role: 'admin' })
  })

  it('sin sesión iniciada /me responde 401', async () => {
    expect((await call('/me', undefined, false).response).status).toBe(401)
  })

  it('entrega la cookie del token CSRF a quien la escribe, no en la respuesta (set-cookie está prohibida)', async () => {
    const { response, setCookie } = call('/me')
    const result = await response
    expect(setCookie).toHaveBeenCalledWith(expect.stringMatching(/^XSRF-TOKEN=.+; Path=\//))
    expect(result.headers.get('set-cookie')).toBeNull()
  })

  it('lee las cabeceras (en minúsculas) y el cuerpo JSON que piden los manejadores', async () => {
    // Cierre de sesión: el manejador exige `x-xsrf-token` y responde con la dirección pública de la demostración.
    const token = 'e2e-csrf-token'
    const result = await call('/logout', { method: 'POST', headers: { 'X-XSRF-TOKEN': token } }).response
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ logoutUrl: `${APP_URL}/entrar` })
  })

  it('una escritura sin token CSRF recibe el 403 de CSRF', async () => {
    expect((await call('/logout', { method: 'POST' }).response).status).toBe(403)
  })
})

describe('isApiUrl', () => {
  const origin = 'https://yelison.github.io'
  it('solo toma /api del mismo origen', () => {
    expect(isApiUrl(new URL(`${origin}/api/me`), origin)).toBe(true)
    expect(isApiUrl(new URL(`${origin}/api`), origin)).toBe(true)
    expect(isApiUrl(new URL(`${origin}/apiary`), origin)).toBe(false)
    expect(isApiUrl(new URL(`${origin}/resolve/assets/a.js`), origin)).toBe(false)
    expect(isApiUrl(new URL('https://otro.example/api/me'), origin)).toBe(false)
  })
})
