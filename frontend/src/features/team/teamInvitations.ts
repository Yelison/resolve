import type { TeamMember } from '../../domain/member'
import { formatRelative } from '../../lib/format'

/** Invitaciones que se ven sin filtrar; el resto está en «Ver las N». */
export const INVITATIONS_PREVIEW_SIZE = 3

/** Las invitaciones pendientes, la más reciente primero; las que no traen fecha, al final. */
export function pendingInvitations(members: readonly TeamMember[]): TeamMember[] {
  const time = (member: TeamMember) => (member.invitedAt ? Date.parse(member.invitedAt) : -Infinity)
  return members
    .filter((member) => member.status === 'invited' && member.role !== 'customer')
    .sort((a, b) => time(b) - time(a) || a.email.localeCompare(b.email, 'es'))
}

/**
 * «Enviada hace 2 días», «Enviada ayer», «Enviada hace 3 horas». De dos días a un mes cuenta días enteros (sin el
 * «anteayer» del formato relativo, que no dice cuántos son). Sin fecha, no se inventa una.
 */
export function sentLabel(invitedAt: string | null, now: Date): string | null {
  if (!invitedAt) return null
  const sent = new Date(invitedAt)
  const days = Math.floor((now.getTime() - sent.getTime()) / 86_400_000)
  return days >= 2 && days < 30 ? `Enviada hace ${days} días` : `Enviada ${formatRelative(sent, now)}`
}
