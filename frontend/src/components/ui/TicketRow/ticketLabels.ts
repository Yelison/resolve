import type { TicketPriority, TicketStatus } from '../../../domain/ticket'
import type { BadgeTone } from '../Badge/Badge'

/** Texto y tono visibles de cada estado y prioridad de ticket. */
export const ticketStatus: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Abierto', tone: 'blue' },
  in_progress: { label: 'En progreso', tone: 'amber' },
  waiting: { label: 'Esperando cliente', tone: 'neutral' },
  resolved: { label: 'Resuelto', tone: 'green' },
}

export const ticketPriority: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
  urgent: { label: 'Urgente', tone: 'red' },
  high: { label: 'Alta', tone: 'amber' },
  medium: { label: 'Media', tone: 'blue' },
  low: { label: 'Baja', tone: 'neutral' },
}
