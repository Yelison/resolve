import type { TicketSummary } from '../../domain/ticket'

/** Momento de referencia de los datos de demostración, fijado al cargar el módulo. */
export const demoNow = new Date()

const minutesAgo = (minutes: number) => new Date(demoNow.getTime() - minutes * 60_000).toISOString()

/** Datos ficticios para mostrar los componentes. No proceden de ninguna API. */
export const demoTickets: TicketSummary[] = [
  {
    id: 't-1048',
    number: 1048,
    subject: 'No puedo acceder a mi cuenta',
    customer: { id: 'c-1', name: 'María Pérez', email: 'maria@example.com', company: 'Acme Studio' },
    status: 'open',
    priority: 'urgent',
    channel: 'email',
    assignee: { id: 'u-1', name: 'Laura Méndez' },
    createdAt: minutesAgo(18),
    updatedAt: minutesAgo(5),
  },
  {
    id: 't-1047',
    number: 1047,
    subject: 'Error al procesar el pago con tarjeta corporativa en la renovación anual',
    customer: { id: 'c-2', name: 'Carlos Ruiz', email: 'carlos@example.com', company: 'Northstar' },
    status: 'in_progress',
    priority: 'high',
    channel: 'chat',
    assignee: { id: 'u-2', name: 'Daniel Santos' },
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(42),
  },
  {
    id: 't-1046',
    number: 1046,
    subject: 'Cambiar correo de facturación',
    customer: { id: 'c-3', name: 'Ana Gómez', email: 'ana@example.com', company: 'Orbit Labs' },
    status: 'waiting',
    priority: 'medium',
    channel: 'web',
    assignee: null,
    createdAt: minutesAgo(26 * 60 + 5),
    updatedAt: minutesAgo(26 * 60),
  },
]
