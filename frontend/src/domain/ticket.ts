export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved'
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface TicketSummary {
  id: string
  /** Número visible, p. ej. 1048. */
  number: number
  subject: string
  customer: string
  company: string
  status: TicketStatus
  priority: TicketPriority
  assignee: string | null
  /** Fecha ISO 8601 de la última actualización. */
  updatedAt: string
}
