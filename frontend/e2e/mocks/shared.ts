import type { Route } from '@playwright/test'
import type { Member, TeamMember } from '../../src/api/schema'

/** Petición que el despachador de `fixtures.ts` ofrece a cada feature: ya lleva la ruta de la API sin el prefijo. */
export interface MockRequest {
  route: Route
  request: ReturnType<Route['request']>
  url: URL
  path: string
  method: string
}

/**
 * Manejador de una feature: responde a sus rutas y devuelve la promesa de `route.fulfill`, o `undefined` si la petición
 * no es suya y debe seguir al siguiente manejador. Sin manejador, el despachador responde 501.
 */
export type MockHandler = (req: MockRequest) => Promise<void> | undefined

/** Una feature de la API simulada: su estado vive en la llamada a `mockApi`, nunca en el módulo. */
export interface MockFeature {
  handle: MockHandler
}

const now = Date.now()
export const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

export const laura: Member = { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' }
export const daniel: Member = { id: 'u-daniel', name: 'Daniel Santos', email: 'daniel@acme.example' }

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: status >= 400 ? 'application/problem+json' : 'application/json',
    body: JSON.stringify(body),
  })

export const problem = (route: Route, status: number, title: string, errors?: { field: string; message: string }[]) =>
  json(route, { status, title, ...(errors && { errors }) }, status)

export const teamMember = (member: Partial<TeamMember> & Pick<TeamMember, 'id' | 'name' | 'email'>): TeamMember => ({
  role: 'agent',
  status: 'active',
  openTickets: 0,
  joinedAt: minutesAgo(60 * 24 * 30),
  invitedAt: null,
  ...member,
})
