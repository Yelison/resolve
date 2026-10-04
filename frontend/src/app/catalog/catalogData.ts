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
    customer: 'María Pérez',
    company: 'Acme Studio',
    status: 'open',
    priority: 'urgent',
    assignee: 'Laura Méndez',
    updatedAt: minutesAgo(5),
  },
  {
    id: 't-1047',
    number: 1047,
    subject: 'Error al procesar el pago con tarjeta corporativa en la renovación anual',
    customer: 'Carlos Ruiz',
    company: 'Northstar',
    status: 'in_progress',
    priority: 'high',
    assignee: 'Daniel Santos',
    updatedAt: minutesAgo(42),
  },
  {
    id: 't-1046',
    number: 1046,
    subject: 'Cambiar correo de facturación',
    customer: 'Ana Gómez',
    company: 'Orbit Labs',
    status: 'waiting',
    priority: 'medium',
    assignee: null,
    updatedAt: minutesAgo(26 * 60),
  },
]
