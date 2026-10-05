import type { Me, OrganizationPatch, OrganizationSettings } from '../../src/api/schema'
import { me } from './session'
import { json, problem, type MockFeature } from './shared'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sesión y ajustes simulados con las reglas del servidor: `PATCH /organization` es del administrador, exige `If-Match`
 * (428), compara la versión (412) y valida los campos (400 con error por campo). `GET /me` sale de aquí, no de
 * `sessionMock`, para que un cambio de nombre del espacio o del perfil llegue al sidebar al releer la sesión: va antes
 * que `sessionMock` en `mockApi`, porque gana el primer manejador.
 */
export function settingsMock(role: Me['role']): MockFeature & { session: () => Me } {
  let session: Me = {
    ...me,
    role,
    customerId: role === 'customer' ? 'c-maria' : null,
  }
  let organization: OrganizationSettings = {
    id: me.organization.id,
    name: me.organization.name,
    supportEmail: me.organization.supportEmail,
    timeZone: me.organization.timeZone,
    firstResponseTargetMinutes: 30,
    version: 3,
  }
  const withOrganization = (settings: OrganizationSettings): Me => ({
    ...session,
    organization: {
      ...session.organization,
      name: settings.name,
      timeZone: settings.timeZone,
      supportEmail: settings.supportEmail,
    },
  })
  session = withOrganization(organization)

  return {
    /** El `Me` actual, con los cambios de nombre del espacio y del perfil: lo lee `sessionMock` para servir `/me`. */
    session: () => session,
    handle: ({ route, request, path, method }) => {
      if (path === '/me' && method === 'GET') return json(route, session)
      if (path === '/me' && method === 'PATCH') {
        const { name } = request.postDataJSON() as { name: string }
        if (!name?.trim()) {
          return problem(route, 400, 'Datos no válidos', [{ field: 'name', message: 'Escribe tu nombre.' }])
        }
        session = { ...session, user: { ...session.user, name: name.trim() } }
        return json(route, session)
      }
      if (path !== '/organization') return undefined
      if (role === 'customer') return problem(route, 403, 'Prohibido')
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ETag: `"${organization.version}"` },
          body: JSON.stringify(organization),
        })
      }
      if (method !== 'PATCH') return undefined
      if (role !== 'admin') return problem(route, 403, 'Prohibido')
      const ifMatch = request.headers()['if-match']
      if (!ifMatch) return problem(route, 428, 'Falta If-Match')
      const patch = request.postDataJSON() as OrganizationPatch
      const errors: { field: string; message: string }[] = []
      if (patch.name !== undefined && !patch.name.trim()) errors.push({ field: 'name', message: 'Escribe un nombre.' })
      if (patch.supportEmail && !EMAIL_PATTERN.test(patch.supportEmail)) {
        errors.push({ field: 'supportEmail', message: 'Escribe un correo válido de hasta 254 caracteres.' })
      }
      // El servidor real rechaza las zonas que PostgreSQL no conoce; aquí una zona del selector hace de ejemplo.
      if (patch.timeZone !== undefined && patch.timeZone === 'Pacific/Honolulu') {
        errors.push({ field: 'timeZone', message: 'Zona horaria no reconocida por el servidor.' })
      }
      if (errors.length > 0) return problem(route, 400, 'Datos no válidos', errors)
      if (ifMatch !== `"${organization.version}"`) return problem(route, 412, 'La versión cambió')
      const next: OrganizationSettings = { ...organization, ...patch }
      const changed = (Object.keys(patch) as (keyof OrganizationPatch)[]).some(
        (key) => (patch[key] ?? null) !== (organization[key] ?? null),
      )
      organization = changed ? { ...next, version: organization.version + 1 } : organization
      session = withOrganization(organization)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${organization.version}"` },
        body: JSON.stringify(organization),
      })
    },
  }
}
