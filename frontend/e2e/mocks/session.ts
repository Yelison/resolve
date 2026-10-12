import type {
  GettingStarted,
  LogoutResponse,
  Me,
  NewOrganization,
  OrganizationColor,
  OrganizationRef,
  SessionOrganizationSelection,
} from '../../src/api/schema'
import { json, problem, type MockFeature, type MockRoute } from './shared'
import { byNameThenId, colorOfId, newOrganizationId, organizationErrors, ORGANIZATION_LIMIT } from './workspaces'

export const me: Me = {
  user: { id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example' },
  organization: {
    id: 'org-1',
    name: 'Acme Studio',
    timeZone: 'America/Bogota',
    color: 'blue',
    supportEmail: null,
    demo: false,
  },
  organizationCreation: { allowed: true, created: 0, limit: 3 },
  role: 'admin',
  customerId: null,
}

export const acme: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000001',
  name: 'Acme Studio',
  role: 'admin',
  color: 'blue',
  memberCount: 4,
}
export const northwind: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000002',
  name: 'Northwind',
  role: 'agent',
  color: 'magenta',
  memberCount: 6,
}

/** Los otros dos espacios de la demostración pública: el administrador es agente en uno y cliente en el otro. */
export const lumen: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000003',
  name: 'Lumen Diseño',
  role: 'agent',
  color: 'green',
  memberCount: 6,
}
export const norte: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000004',
  name: 'Norte Viajes',
  role: 'customer',
  color: 'orange',
  memberCount: null,
}

/** El tercer espacio donde el administrador de la demostración es administrador: lo creó él, como Acme Studio. */
export const kora: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000005',
  name: 'Kora Fitness',
  role: 'admin',
  color: 'teal',
  memberCount: 3,
}

/**
 * Los espacios de cada usuario de la demostración pública: solo el administrador tiene varios (para que el selector
 * tenga algo que mostrar); el agente y el cliente tienen el suyo.
 */
export const demoWorkspaces: Partial<Record<Me['role'], OrganizationRef[]>> = { admin: [acme, lumen, norte, kora] }

/** Los que el administrador de la demostración creó: «Has creado 2 de 3 espacios». Los otros le invitaron. */
export const demoCreatedIn: string[] = [acme.id, kora.id]

/** Cómo arranca la sesión simulada. */
export interface SessionOptions {
  /** `false`: la API responde 401 hasta que el inicio de sesión simulado (`/api/oauth2/authorization/resolve`) lo cambia. */
  signedIn?: boolean
  /**
   * Espacios de la persona, cada uno con su rol: `Me.organizations` los lista, el rol de la sesión es el del espacio
   * activo (el primero al arrancar) y se puede salir de ellos. Sin esta opción solo hay el de la fixture.
   */
  organizations?: OrganizationRef[]
  /**
   * Ids, entre los de `organizations`, de los espacios que la persona creó: cuentan para el límite de tres mientras siga
   * en ellos. Sin esta opción no creó ninguno.
   */
  createdIn?: string[]
  /** Espacios donde la persona es el único administrador activo y por tanto no puede salir (los demás sí), además del de la fixture si el equipo simulado tiene uno solo. */
  lastAdminIn?: string[]
  /** Nombres de 120 caracteres para la persona y las organizaciones. */
  longNames?: boolean
  /**
   * El proveedor autentica a la persona (hay sesión en el servidor) pero la aplicación no la admite: `/me` responde 401
   * con el `type` del motivo (membresía retirada o ninguna membresía) hasta que cierra sesión.
   */
  refused?: 'access-deactivated' | 'no-membership'
  /** La instalación es la demostración pública (`organization.demo`): el shell muestra su aviso. */
  demo?: boolean
}

/**
 * Lo que la sesión comparte con las demás features. `current.role` es el rol en el espacio activo: la sesión lo
 * actualiza al cambiar de espacio o salir del actual, y las demás lo leen en cada petición. `lastAdmin` y `release` los
 * enganchan las features del equipo y de los tickets: salir de un espacio es una regla de ambas.
 */
export interface SessionLinks {
  current: { role: Me['role'] }
  /** Si la persona es el único administrador activo del espacio; el equipo simulado lo sabe del espacio de la fixture. */
  lastAdmin?: (organizationId: string) => boolean
  /** Libera lo que la persona tenía asignado en el espacio (sus tickets sin resolver). */
  release?: (organizationId: string) => void
  /** Los ajustes avisan aquí cuando un `PATCH` correcto cambia el color: la sesión lo atribuye al espacio activo de ese momento. */
  colorSaved?: (color: OrganizationColor) => void
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
  links: SessionLinks = { current: { role } },
): MockFeature & {
  /** «Primeros pasos» del espacio activo, como lo da `GET /tickets/metrics`: solo a su administrador y mientras falten pasos. */
  gettingStarted: () => GettingStarted | null
} {
  let signedIn = options.signedIn ?? true
  let refused = options.refused ?? null
  const roleMe: Me = role === 'customer' ? { ...me, role, customerId: 'c-maria' } : me
  // Sin lista explícita hay un solo espacio, el de la fixture, con el rol de la sesión. Es una copia: crear espacios
  // añade a la lista, y la de `demoWorkspaces` es del módulo.
  const organizations: OrganizationRef[] = [
    ...(options.organizations ?? [
      {
        id: me.organization.id,
        name: me.organization.name,
        role,
        color: me.organization.color,
        memberCount: role === 'customer' ? null : acme.memberCount,
      },
    ]),
  ]
  // Los espacios que la persona creó (cuentan para el límite) y, de los creados aquí, la zona y los pasos que les faltan.
  const createdIds = new Set(options.createdIn ?? [])
  const zones = new Map<string, string>()
  const steps = new Map<string, GettingStarted>()
  // Tras crear un espacio, el activo ya no es el de la fixture: se sirve su id y su nombre aunque no hubiera lista.
  let listed = options.organizations !== undefined
  // Los espacios de los que la persona ya salió dejan de ser utilizables, como en el servidor.
  const left = new Set<string>()
  const usable = () => organizations.filter((org) => !left.has(org.id))
  let active = organizations[0]!
  // Los ajustes simulados son los de un solo espacio: el color que guardan se atribuye, en el momento de guardar, al espacio
  // activo (`links.colorSaved`), y cada espacio conserva el suyo al cambiar.
  const colors = new Map<string, OrganizationColor>()
  const colorOf = (org: OrganizationRef) => colors.get(org.id) ?? org.color
  links.current.role = options.organizations ? active.role : role
  links.colorSaved = (color) => colors.set(active.id, color)

  const created = () => [...createdIds].filter((id) => usable().some((org) => org.id === id)).length
  /** Como el servidor: `allowed` suma el rol (administrador en alguno de los espacios) y el límite. */
  const organizationCreation = (): Me['organizationCreation'] => ({
    allowed: usable().some((org) => org.role === 'admin') && created() < ORGANIZATION_LIMIT,
    created: created(),
    limit: ORGANIZATION_LIMIT,
  })
  const gettingStarted = (): GettingStarted | null => {
    const pending = steps.get(active.id)
    if (!pending || links.current.role !== 'admin') return null
    // El servidor deja de mandarlo en cuanto se cumplen los tres.
    return pending.invitedTeam && pending.addedCustomer && pending.publishedArticle ? null : { ...pending }
  }

  const session = (): Me => {
    const current = base ? base() : roleMe
    const activeRole = links.current.role
    return {
      ...current,
      role: activeRole,
      customerId: activeRole === 'customer' ? 'c-maria' : null,
      user: options.longNames ? { ...current.user, name: long('Nombre larguísimo de una persona') } : current.user,
      organization: {
        ...current.organization,
        ...(options.demo !== undefined ? { demo: options.demo } : {}),
        // La organización de la fixture por defecto sigue siendo `org-1`: solo cambia al elegir otra de la lista.
        ...(listed ? { id: active.id, name: active.name } : {}),
        color: colorOf(active),
        ...(zones.has(active.id) ? { timeZone: zones.get(active.id)! } : {}),
        ...(options.longNames ? { name: long(active.name) } : {}),
      },
      organizationCreation: organizationCreation(),
      organizations: byNameThenId(
        usable().map((org) => ({
          ...org,
          color: colorOf(org),
          ...(options.longNames ? { name: long(org.name) } : {}),
        })),
      ),
    }
  }

  /** El 403 con el que el backend rechaza una escritura sin el token de CSRF; el `detail` no se parece al real a propósito. */
  const csrfRejection = (route: MockRoute) =>
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

  /** Un 409 con el `type` del motivo: la interfaz distingue los conflictos por él, nunca por el texto. */
  const conflict = (route: MockRoute, type: string, title: string) =>
    json(
      route,
      { type: `https://resolve.example/problems/${type}`, status: 409, title, detail: 'Texto del servidor.' },
      409,
    )

  /**
   * `DELETE /me/organizations/{id}` con los errores en el orden del contrato: 404 (desconocido, ajeno o ya abandonado,
   * el mismo), 403 (cliente), 409 `last-organization` y 409 `last-admin`. Marca la membresía como abandonada y libera lo
   * que la persona tenía asignado. Si era el espacio activo, el siguiente utilizable pasa a serlo (el servidor resuelve la
   * petición siguiente en la primera membresía utilizable).
   */
  function leave(route: MockRoute, organizationId: string) {
    const target = usable().find((org) => org.id === organizationId)
    if (!target) return problem(route, 404, 'No encontrado')
    if (target.role === 'customer') return problem(route, 403, 'Sin permiso')
    if (usable().length <= 1) return conflict(route, 'last-organization', 'Tu único espacio')
    const soleAdmin =
      target.role === 'admin' &&
      (options.lastAdminIn?.includes(target.id) ||
        (target === organizations[0] && links.lastAdmin?.(target.id) === true))
    if (soleAdmin) return conflict(route, 'last-admin', 'El último administrador')
    // Los datos simulados son los del espacio de la fixture (el primero): solo salir de él libera lo asignado.
    if (target === organizations[0]) links.release?.(target.id)
    left.add(target.id)
    if (active === target) {
      active = usable()[0]!
      links.current.role = active.role
    }
    return route.fulfill({ status: 204 })
  }

  /**
   * `POST /organizations` con los errores en el orden del contrato (el 401 y el token CSRF ya pasaron): 400 por campo,
   * 403 si no es administrador de ningún espacio y 409 `organization-limit`. Crea el espacio con la persona de
   * administradora, con el color de su id y los tres pasos por hacer, y pasa a trabajar en él.
   */
  function create(route: MockRoute, body: Partial<NewOrganization> | null) {
    const errors = organizationErrors(body)
    if (errors.length > 0) return problem(route, 400, 'Datos no válidos', errors)
    if (!usable().some((org) => org.role === 'admin')) return problem(route, 403, 'Sin permiso')
    if (created() >= ORGANIZATION_LIMIT) {
      return conflict(route, 'organization-limit', 'Ya creaste el máximo de espacios')
    }
    const id = newOrganizationId()
    const workspace: OrganizationRef = {
      id,
      name: body!.name!.trim(),
      role: 'admin',
      color: colorOfId(id),
      memberCount: 1,
    }
    organizations.push(workspace)
    createdIds.add(id)
    zones.set(id, body!.timeZone!)
    steps.set(id, { invitedTeam: false, addedCustomer: false, publishedArticle: false })
    active = workspace
    listed = true
    links.current.role = 'admin'
    return json(route, session(), 201)
  }

  return {
    gettingStarted,
    // Una escritura que salió bien en el espacio recién creado hace su paso: invitar, añadir un cliente, publicar.
    observe: ({ path, method }, status) => {
      const pending = steps.get(active.id)
      if (!pending || status >= 300 || method !== 'POST') return
      if (path === '/members') pending.invitedTeam = true
      else if (path === '/customers') pending.addedCustomer = true
      else if (/^\/knowledge\/articles\/[^/]+\/publish$/.test(path)) pending.publishedArticle = true
    },
    handle: ({ route, request, appUrl, path, method }) => {
      // Como el backend: una escritura cuya `X-Organization-Id` no es la organización de la sesión se rechaza antes de que
      // llegue a ninguna otra feature, así que no escribe nada. Elegir organización y cerrar sesión no la comprueban. El
      // orden es el del servidor: primero el token CSRF (403), después la organización (409).
      const shown = request.headers()['x-organization-id']
      const exempt = path === '/logout' || path === '/session/organization' || path === '/organizations'
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
        return route.fulfill({ status: 302, headers: { location: `${appUrl}/` } })
      }
      const leaveMatch = method === 'DELETE' ? path.match(/^\/me\/organizations\/([^/]+)$/) : null
      const isWrite =
        leaveMatch !== null ||
        (method === 'POST' && (path === '/logout' || path === '/session/organization' || path === '/organizations'))
      if (!isWrite) return undefined
      if (!signedIn && !refused) return problem(route, 401, 'No autenticado')
      if (request.headers()['x-xsrf-token'] !== CSRF_TOKEN) return csrfRejection(route)
      if (leaveMatch) return leave(route, leaveMatch[1]!)
      if (path === '/organizations') return create(route, request.postDataJSON() as Partial<NewOrganization> | null)
      if (path === '/logout') {
        signedIn = false
        refused = null
        // El proveedor devuelve a la aplicación: sin sesión, la shell lleva a /entrar.
        const body: LogoutResponse = { logoutUrl: `${appUrl}/entrar` }
        return json(route, body)
      }
      const { organizationId } = request.postDataJSON() as SessionOrganizationSelection
      const chosen = usable().find((org) => org.id === organizationId)
      if (!chosen) return problem(route, 403, 'Sin permiso')
      active = chosen
      links.current.role = chosen.role
      return json(route, session())
    },
  }
}
