import type { Ticket, TicketSummary } from '../domain/ticket'

export const summary = (overrides: Partial<TicketSummary> = {}): TicketSummary => ({
  id: 't-1048',
  number: 1048,
  subject: 'No puedo acceder a mi cuenta',
  status: 'open',
  priority: 'urgent',
  channel: 'email',
  customer: { id: 'c-maria', name: 'María Pérez', email: 'maria@cliente.example', company: 'Acme Studio' },
  assignee: { id: 'u-laura', name: 'Laura Méndez' },
  lastMessage: null,
  createdAt: '2026-10-04T15:00:00Z',
  updatedAt: '2026-10-04T15:12:00Z',
  ...overrides,
})

/** El detalle no lleva `lastMessage`: el contrato no admite campos de más. */
const withoutLastMessage = ({ lastMessage: _lastMessage, ...rest }: TicketSummary) => rest

export const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  ...withoutLastMessage(summary()),
  description: 'El enlace de recuperación dice que ya venció.',
  version: 3,
  ...overrides,
})

export const page = (items: TicketSummary[], totalItems = items.length, pageIndex = 0, size = 20) => ({
  items,
  page: pageIndex,
  size,
  totalItems,
  totalPages: Math.ceil(totalItems / size),
})

export const metrics = {
  open: 24,
  openedToday: 8,
  inProgress: 12,
  inProgressAssignedToMe: 4,
  resolvedToday: 38,
  resolvedYesterday: 34,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
  views: { all: 34, mine: 4, unassigned: 6, resolved: 10 },
}
