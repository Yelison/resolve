import type { TeamMember } from '../../domain/member'

/** Si el miembro es el único administrador activo del equipo: el servidor no deja cambiarle el rol ni retirarlo. */
export function isOnlyActiveAdmin(team: readonly TeamMember[] | undefined, member: TeamMember): boolean {
  if (!team || member.role !== 'admin' || member.status !== 'active') return false
  return team.filter((other) => other.role === 'admin' && other.status === 'active').length === 1
}

/** Por qué el único administrador no puede dejar de serlo, con el nombre del espacio. */
export const onlyAdminNote = (workspace: string) =>
  `${workspace} necesita al menos un administrador. Da el rol a otra persona antes de cambiar el tuyo.`
