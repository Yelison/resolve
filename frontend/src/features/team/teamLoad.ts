import type { TeamMember } from '../../domain/member'

/** Personas que atienden tickets ahora: administradores y agentes con la membresía activa. */
export function isActiveStaff(member: TeamMember): boolean {
  return member.status === 'active' && member.role !== 'customer'
}

/** Personas que se dibujan en «Carga ahora» mientras la sección no se despliega. */
export const LOAD_PREVIEW_SIZE = 8

export interface LoadEntry {
  member: TeamMember
  /** Tickets sin resolver asignados, urgentes incluidos. */
  open: number
  urgent: number
  /** Los abiertos que no son urgentes. */
  rest: number
}

/**
 * Carga de las personas activas, de más a menos abiertos; a igual carga, por nombre. Quien está invitado o retirado
 * no atiende tickets, así que no aparece. Un contador urgente mayor que el total se recorta: el servidor no lo envía,
 * pero un dato extraño no debe dibujar una barra con segmentos negativos.
 */
export function loadEntries(members: readonly TeamMember[]): LoadEntry[] {
  return members
    .filter(isActiveStaff)
    .map((member) => {
      const urgent = Math.min(member.urgentOpenTickets, member.openTickets)
      return { member, open: member.openTickets, urgent, rest: member.openTickets - urgent }
    })
    .sort((a, b) => b.open - a.open || a.member.name.localeCompare(b.member.name, 'es'))
}

/** Valor que ocupa todo el ancho de la barra: el de la persona más cargada, y nunca menos de 1. */
export function loadScale(entries: readonly LoadEntry[]): number {
  return Math.max(1, ...entries.map((entry) => entry.open))
}
