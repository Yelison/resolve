import type { Route } from '@playwright/test'
import type { LogoutResponse, Me, OrganizationRef, SessionOrganizationSelection } from '../../src/api/schema'
import { json, problem, type MockFeature } from './shared'

export const me: Me = {
  user: { id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example' },
  organization: { id: 'org-1', name: 'Acme Studio', timeZone: 'America/Bogota', supportEmail: null },
  role: 'admin',
  customerId: null,
}

export const acme: OrganizationRef = { id: '0192f000-0000-7000-8000-000000000001', name: 'Acme Studio' }
export const northwind: OrganizationRef = { id: '0192f000-0000-7000-8000-000000000002', name: 'Northwind' }

/** Cómo arranca la sesión simulada. */
export interface SessionOptions {
  /** `false`: la API responde 401 hasta que el inicio de sesión simulado (`/api/oauth2/authorization/resolve`) lo cambia. */
  signedIn?: boolean
  /** Organizaciones de la persona; con más de una, `Me.organizations` las lista y el menú ofrece el cambio. */
  organizations?: OrganizationRef[]
  /** Nombres de 120 caracteres para la persona y las organizaciones. */
  longNames?: boolean
  /**
   * El proveedor autentica a la persona (hay sesión en el servidor) pero la aplicación no la admite: `/me` responde 401
   * con el `type` del motivo (membresía retirada o ninguna membresía) hasta que cierra sesión.
   */
  refused?: 'access-deactivated' | 'no-membership'
}

/** Token que la API simulada entrega en la cookie `XSRF-TOKEN` con cada GET /me y que exige en las escrituras. */
export const CSRF_TOKEN = 'e2e-csrf-token'

const long = (name: string) =>
  `${name} `
    .repeat(Math.ceil(120 / (name.length + 1)))
    .slice(0, 119)
    .trimEnd() + 'x'

/**
 * Sesión simulada: el administrador, o un cliente (`c-maria`) si `role` lo pide. Imita el BFF con OIDC: GET /me entrega
 * la cookie de CSRF, las escrituras sin la cabecera reciben el 403 de CSRF, `/logout` responde con `logoutUrl` y el
 * inicio de sesión del proveedor (`/oauth2/authorization/resolve`) vuelve a la aplicación ya con sesión.
 */
export function sessionMock(
  role: Me['role'],
  options: SessionOptions = {},
  /** El `Me` base si otra feature lo cambia (los ajustes); sin él, el de la fixture. */
  base?: () => Me,
): MockFeature {
  let signedIn = options.signedIn ?? true
  let refused = options.refused ?? null
  const organizations = options.organizations ?? [acme]
  let active = organizations[0] ?? acme
  const roleMe: Me = role === 'customer' ? { ...me, role, customerId: 'c-maria' } : me

  const session = (): Me => {
    const current = base ? base() : roleMe
    return {
      ...current,
      user: options.longNames ? { ...current.user, name: long('Nombre larguísimo de una persona') } : current.user,
      organization: {
        ...current.organization,
        // La organización de la fixture por defecto sigue siendo `org-1`: solo cambia al elegir otra de la lista.
        ...(options.organizations ? { id: active.id, name: active.name } : {}),
        ...(options.longNames ? { name: long(active.name) } : {}),
      },
      ...(organizations.length > 1 && {
        organizations: organizations.map((org) => (options.longNames ? { ...org, name: long(org.name) } : org)),
      }),
    }
  }

  /** El 403 con el que el backend rechaza una escritura sin el token de CSRF; el `detail` no se parece al real a propósito. */
  const csrfRejection = (route: Route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'https://resolve.example/problems/csrf',
        status: 403,
        title: 'Sin permiso',
        detail: 'Token CSRF.',
      }),
    })

  return {
    handle: ({ route, request, url, path, method }) => {
      // Como el backend: una escritura cuya `X-Organization-Id` no es la organización de la sesión se rechaza antes de que
      // llegue a ninguna otra feature, así que no escribe nada. Elegir organización y cerrar sesión no la comprueban. El
      // orden es el del servidor: primero el token CSRF (403), después la organización (409).
      const shown = request.headers()['x-organization-id']
      const exempt = path === '/logout' || path === '/session/organization'
      if (shown && method !== 'GET' && !exempt && signedIn && !refused && shown !== session().organization.id) {
        if (request.headers()['x-xsrf-token'] !== CSRF_TOKEN) return csrfRejection(route)
        return route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          // El `detail` no se parece a ningún texto de la interfaz: la aplicación decide por el `type`.
          body: JSON.stringify({
            type: 'https://resolve.example/problems/organization-mismatch',
            status: 409,
            title: 'La organización cambió',
            detail: 'Texto del servidor.',
          }),
        })
      }
      if (method === 'GET' && path === '/me') {
        if (refused) {
          return route.fulfill({
            status: 401,
            contentType: 'application/problem+json',
            headers: { 'set-cookie': `XSRF-TOKEN=${CSRF_TOKEN}; Path=/; SameSite=Lax` },
            // El `detail` es un texto para personas: la aplicación reconoce el caso por el `type`.
            body: JSON.stringify({
              type: `https://resolve.example/problems/${refused}`,
              status: 401,
              title: 'No autenticado',
              detail: refused === 'no-membership' ? 'Sin membresía.' : 'Acceso desactivado.',
            }),
          })
        }
        if (!signedIn) return problem(route, 401, 'No autenticado')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'set-cookie': `XSRF-TOKEN=${CSRF_TOKEN}; Path=/; SameSite=Lax` },
          body: JSON.stringify(session()),
        })
      }
      if (method === 'GET' && path === '/oauth2/authorization/resolve') {
        signedIn = true
        return route.fulfill({ status: 302, headers: { location: `${url.origin}/` } })
      }
      const isWrite = method === 'POST' && (path === '/logout' || path === '/session/organization')
      if (!isWrite) return undefined
      if (!signedIn && !refused) return problem(route, 401, 'No autenticado')
      if (request.headers()['x-xsrf-token'] !== CSRF_TOKEN) return csrfRejection(route)
      if (path === '/logout') {
        signedIn = false
        refused = null
        // El proveedor devuelve a la aplicación: sin sesión, la shell lleva a /entrar.
        const body: LogoutResponse = { logoutUrl: `${url.origin}/entrar` }
        return json(route, body)
      }
      const { organizationId } = request.postDataJSON() as SessionOrganizationSelection
      const chosen = organizations.find((org) => org.id === organizationId)
      if (!chosen) return problem(route, 403, 'Sin permiso')
      active = chosen
      return json(route, session())
    },
  }
}
