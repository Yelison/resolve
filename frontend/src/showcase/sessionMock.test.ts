import { describe, expect, it, vi } from 'vitest'
import { acme, CSRF_TOKEN, lumen, sessionMock, type SessionLinks } from '../../e2e/mocks/session'
import { respondToApi } from './adapter'

const APP_URL = 'https://yelison.github.io/resolve'

/** La sesión simulada con dos espacios (la persona es agente en Lumen y administra Acme junto con otra persona). */
function leave(organizationId: string, links: SessionLinks) {
  const features = [sessionMock('admin', { organizations: [acme, lumen] }, undefined, links)]
  const request = new Request(`https://yelison.github.io/api/me/organizations/${organizationId}`, {
    method: 'DELETE',
    headers: { 'x-xsrf-token': CSRF_TOKEN },
  })
  return respondToApi({ features, request, appUrl: APP_URL, setCookie: vi.fn() })
}

describe('sessionMock · salir libera lo asignado', () => {
  it('salir de otro espacio no libera nada: los datos simulados son los del espacio de la fixture', async () => {
    const release = vi.fn()
    expect((await leave(lumen.id, { current: { role: 'admin' }, release })).status).toBe(204)
    expect(release).not.toHaveBeenCalled()
  })

  it('salir del espacio de la fixture sí libera lo que la persona tenía asignado', async () => {
    const release = vi.fn()
    const response = await leave(acme.id, { current: { role: 'admin' }, release, lastAdmin: () => false })
    expect(response.status).toBe(204)
    expect(release).toHaveBeenCalledExactlyOnceWith(acme.id)
  })

  it('si se le impide salir (último administrador) tampoco libera nada', async () => {
    const release = vi.fn()
    const response = await leave(acme.id, { current: { role: 'admin' }, release, lastAdmin: () => true })
    expect(response.status).toBe(409)
    expect(release).not.toHaveBeenCalled()
  })
})
