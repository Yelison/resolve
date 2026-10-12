import type { Me, OrganizationColor, OrganizationPatch, OrganizationSettings } from '../../src/api/schema'
import { me } from './session'
import { json, problem, type MockFeature } from './shared'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORGANIZATION_COLORS: readonly string[] = [
  'blue',
  'green',
  'magenta',
  'orange',
  'violet',
  'teal',
  'brick',
  'slate',
] satisfies OrganizationColor[]

/**
 * Sesión y ajustes simulados con las reglas del servidor: `PATCH /organization` es del administrador, exige `If-Match`
 * (428), compara la versión (412) y valida los campos (400 con error por campo). `GET /me` sale de aquí, no de
 * `sessionMock`, para que un cambio de nombre del espacio o del perfil llegue al sidebar al releer la sesión: va antes
 * que `sessionMock` en `mockApi`, porque gana el primer manejador.
 */
export function settingsMock(
  roleOrGetter: Me['role'] | (() => Me['role']),
  /** Se llama tras un `PATCH` correcto que cambia el color, para que la sesión lo atribuya al espacio activo. */
  onColorSaved?: (color: OrganizationColor) => void,
): MockFeature & { session: () => Me } {
  // El rol cambia al cambiar de espacio (agente en uno, cliente en otro): se lee en cada petición.
  const roleNow = () => (typeof roleOrGetter === 'function' ? roleOrGetter() : roleOrGetter)
  let stored: Me = { ...me }
  let organization: OrganizationSettings = {
    id: me.organization.id,
    name: me.organization.name,
    supportEmail: me.organization.supportEmail,
    timeZone: me.organization.timeZone,
    firstResponseTargetMinutes: 30,
    color: me.organization.color,
    version: 3,
  }
  const withOrganization = (settings: OrganizationSettings): Me => ({
    ...stored,
    organization: {
      ...stored.organization,
      name: settings.name,
      timeZone: settings.timeZone,
      supportEmail: settings.supportEmail,
      color: settings.color,
    },
  })
  stored = withOrganization(organization)
  const withRole = (value: Me): Me => ({
    ...value,
    role: roleNow(),
    customerId: roleNow() === 'customer' ? 'c-maria' : null,
  })
  const session = () => withRole(stored)

  return {
    /** El `Me` actual, con los cambios de nombre del espacio y del perfil: lo lee `sessionMock` para servir `/me`. */
    session,
    handle: ({ route, request, path, method }) => {
      if (path === '/me' && method === 'GET') return json(route, session())
      if (path === '/me' && method === 'PATCH') {
        const { name } = request.postDataJSON() as { name: string }
        if (!name?.trim()) {
          return problem(route, 400, 'Datos no válidos', [{ field: 'name', message: 'Escribe tu nombre.' }])
        }
        stored = { ...stored, user: { ...stored.user, name: name.trim() } }
        return json(route, session())
      }
      if (path !== '/organization') return undefined
      if (roleNow() === 'customer') return problem(route, 403, 'Prohibido')
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ETag: `"${organization.version}"` },
          body: JSON.stringify(organization),
        })
      }
      if (method !== 'PATCH') return undefined
      if (roleNow() !== 'admin') return problem(route, 403, 'Prohibido')
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
      if (patch.color !== undefined && !ORGANIZATION_COLORS.includes(patch.color)) {
        errors.push({ field: 'color', message: 'Elige uno de los colores de la lista.' })
      }
      if (errors.length > 0) return problem(route, 400, 'Datos no válidos', errors)
      if (ifMatch !== `"${organization.version}"`) return problem(route, 412, 'La versión cambió')
      const next: OrganizationSettings = { ...organization, ...patch }
      const changed = (Object.keys(patch) as (keyof OrganizationPatch)[]).some(
        (key) => (patch[key] ?? null) !== (organization[key] ?? null),
      )
      organization = changed ? { ...next, version: organization.version + 1 } : organization
      stored = withOrganization(organization)
      if (changed && patch.color !== undefined) onColorSaved?.(patch.color)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${organization.version}"` },
        body: JSON.stringify(organization),
      })
    },
  }
}
