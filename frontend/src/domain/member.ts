/**
 * Tipos de dominio del equipo. Se generan desde docs/api/openapi.yaml (`npm run api:types`), de modo que
 * frontend y backend comparten un único contrato.
 */
import type { MemberStatus, Role, TeamMember } from '../api/schema'

export type { Member, MemberInvite, MemberRoleChange, MemberStatus, TeamMember, TeamMetrics } from '../api/schema'

/** Roles que se pueden asignar desde el equipo (el rol de cliente solo existe en el portal). */
export type TeamRole = Exclude<Role, 'customer'>

export const teamRoles: readonly TeamRole[] = ['agent', 'admin']

export const memberStatusLabels: Record<MemberStatus, string> = {
  invited: 'Invitación pendiente',
  active: 'Activo',
  removed: 'Retirado',
}

/** Miembros que se muestran por defecto: los retirados solo aparecen con su filtro. */
export function isCurrentMember(member: TeamMember): boolean {
  return member.status !== 'removed'
}
