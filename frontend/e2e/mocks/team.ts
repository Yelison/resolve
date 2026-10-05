import type { TeamMember, TeamMetrics } from '../../src/api/schema'
import { daniel, json, laura, minutesAgo, problem, type MockFeature, type MockHandler } from './shared'
import { me } from './session'

export const teamMember = (member: Partial<TeamMember> & Pick<TeamMember, 'id' | 'name' | 'email'>): TeamMember => ({
  role: 'agent',
  status: 'active',
  openTickets: 0,
  joinedAt: minutesAgo(60 * 24 * 30),
  invitedAt: null,
  ...member,
})

/** Equipo de demostración con el contrato de lista (`TeamMember`): activos, una invitación y un retirado. */
export const team: TeamMember[] = [
  teamMember({ ...laura, openTickets: 1 }),
  teamMember({ ...daniel, openTickets: 1 }),
  teamMember({
    id: 'u-sofia',
    name: 'Sofía Ríos',
    email: 'sofia@acme.example',
    status: 'invited',
    joinedAt: null,
    invitedAt: minutesAgo(60),
  }),
  teamMember({
    id: 'u-largo',
    name: 'Alejandra Fernández de la Fuente y Montenegro',
    email: 'alejandra.fernandez.de.la.fuente.montenegro@orbit-labs.example',
  }),
  teamMember({ id: 'u-pablo', name: 'Pablo Viejo', email: 'pablo@acme.example', status: 'removed' }),
  teamMember({ ...me.user, role: 'admin' }),
]

/** Equipo simulado: altas, cambios de rol y retiradas con las reglas del servidor (último administrador, uno mismo). */
export function teamMock(): MockFeature {
  const members = new Map(team.map((member) => [member.id, member]))
  let nextMember = 1
  const teamMetrics = (): TeamMetrics => {
    const staff = [...members.values()].filter((member) => member.status === 'active').length
    const assignedOpen = [...members.values()].reduce((total, member) => total + member.openTickets, 0)
    return {
      staff,
      assignedOpen,
      unassignedOpen: 1,
      averageLoad: staff ? Math.round((assignedOpen / staff) * 10) / 10 : 0,
      firstResponseMinutes: 18,
      firstResponseTargetMinutes: 30,
    }
  }
  const activeAdmins = () =>
    [...members.values()].filter((member) => member.status === 'active' && member.role === 'admin')
  const handle: MockHandler = ({ route, request, path, method }) => {
    const memberMatch = path.match(/^\/members\/([^/]+)\/(role|remove)$/)

    if (method === 'GET' && path === '/members/metrics') return json(route, teamMetrics())
    if (method === 'GET' && path === '/members') return json(route, [...members.values()])
    if (method === 'POST' && path === '/members') {
      const body = request.postDataJSON() as { email: string; name?: string; role: 'admin' | 'agent' }
      if ([...members.values()].some((member) => member.email === body.email && member.status !== 'removed')) {
        return problem(route, 400, 'Datos no válidos', [{ field: 'email', message: 'Ya forma parte del equipo.' }])
      }
      const invited = teamMember({
        id: `u-nuevo-${nextMember++}`,
        name: body.name ?? body.email.split('@')[0]!,
        email: body.email,
        role: body.role,
        status: 'invited',
        joinedAt: null,
        invitedAt: new Date().toISOString(),
      })
      members.set(invited.id, invited)
      return json(route, invited, 201)
    }
    if (method === 'POST' && memberMatch) {
      const target = members.get(memberMatch[1]!)
      if (!target) return problem(route, 404, 'No encontrado')
      if (target.status === 'removed') return problem(route, 409, 'Conflicto de estado')
      const lastAdmin = target.role === 'admin' && target.status === 'active' && activeAdmins().length <= 1
      if (memberMatch[2] === 'role') {
        const { role } = request.postDataJSON() as { role: 'admin' | 'agent' }
        if (role !== target.role && lastAdmin) {
          return json(
            route,
            { status: 409, title: 'Conflicto', detail: 'Debe quedar al menos un administrador activo.' },
            409,
          )
        }
        const updated = { ...target, role }
        members.set(updated.id, updated)
        return json(route, updated)
      }
      if (target.id === me.user.id) {
        return json(
          route,
          { status: 409, title: 'Conflicto', detail: 'No puedes retirarte a ti mismo del equipo.' },
          409,
        )
      }
      if (lastAdmin) {
        return json(
          route,
          { status: 409, title: 'Conflicto', detail: 'Debe quedar al menos un administrador activo.' },
          409,
        )
      }
      const removed: TeamMember = { ...target, status: 'removed', openTickets: 0 }
      members.set(removed.id, removed)
      return json(route, removed)
    }
    return undefined
  }
  return { handle }
}
