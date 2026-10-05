import type {
  Activity,
  ActivityFeedItem,
  Customer,
  Message,
  Ticket,
  TicketMetrics,
  TicketSummary,
} from '../../src/api/schema'
import { daniel, json, laura, minutesAgo, type MockFeature, type MockHandler } from './shared'
import { customerRef, customers } from './customers'
import { me } from './session'

export const tickets: TicketSummary[] = [
  {
    id: 't-1048',
    number: 1048,
    subject: 'No puedo acceder a mi cuenta',
    status: 'open',
    priority: 'urgent',
    channel: 'email',
    customer: customerRef(customers[0]!),
    assignee: { id: laura.id, name: laura.name },
    createdAt: minutesAgo(18),
    updatedAt: minutesAgo(5),
  },
  {
    id: 't-1047',
    number: 1047,
    subject: 'Error al procesar el pago con la tarjeta corporativa en la renovación anual del plan Pro',
    status: 'in_progress',
    priority: 'high',
    channel: 'chat',
    customer: customerRef(customers[1]!),
    assignee: { id: daniel.id, name: daniel.name },
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(12),
  },
  {
    id: 't-1046',
    number: 1046,
    subject: 'Cambiar correo de facturación',
    status: 'waiting',
    priority: 'medium',
    channel: 'web',
    customer: customerRef(customers[2]!),
    assignee: null,
    createdAt: minutesAgo(1500),
    updatedAt: minutesAgo(1440),
  },
]

const metrics: TicketMetrics = {
  open: 1,
  openedToday: 1,
  inProgress: 1,
  inProgressAssignedToMe: 0,
  resolvedToday: 2,
  resolvedYesterday: 1,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
  views: { all: 3, mine: 0, unassigned: 1, resolved: 0 },
}

/** Actividad reciente de toda la organización, con el contrato de `listRecentActivity`. */
const recentActivity: ActivityFeedItem[] = [
  {
    ticketNumber: 1047,
    subject: 'Error al procesar el pago con la tarjeta corporativa en la renovación anual del plan Pro',
    activity: {
      id: 'a-feed-2',
      type: 'status_changed',
      actor: { id: laura.id, name: laura.name },
      createdAt: minutesAgo(12),
      from: 'open',
      to: 'in_progress',
    },
  },
  {
    ticketNumber: 1048,
    subject: 'No puedo acceder a mi cuenta',
    activity: {
      id: 'a-feed-1',
      type: 'created',
      actor: { id: me.user.id, name: me.user.name },
      createdAt: minutesAgo(18),
    },
  },
]

const detail = (summary: TicketSummary): Ticket => ({
  ...summary,
  description: 'Desde esta mañana no puedo acceder. El enlace de recuperación dice que ya venció.',
  version: 2,
})

const messages: Message[] = [
  {
    id: 'm-1',
    body: 'Hola María. Ya revisé tu cuenta y envié un nuevo enlace de acceso a tu correo.',
    visibility: 'public',
    author: { id: laura.id, name: laura.name, kind: 'agent' },
    createdAt: minutesAgo(10),
  },
  {
    id: 'm-2',
    body: 'Verificación completada. No hay bloqueos activos.',
    visibility: 'internal',
    author: { id: laura.id, name: laura.name, kind: 'agent' },
    createdAt: minutesAgo(8),
  },
]

const activity: Activity[] = [
  { id: 'a-1', type: 'created', actor: { id: me.user.id, name: me.user.name }, createdAt: minutesAgo(18) },
]

/** Tickets simulados; `customerRef` da el cliente actual para que la bandeja refleje un renombrado. */
export function ticketsMock(customerRef: (id: string) => Customer): MockFeature {
  // Los tickets embeben el cliente tal como está ahora, así la bandeja refleja un renombrado.
  const currentTickets = () => tickets.map((ticket) => ({ ...ticket, customer: customerRef(ticket.customer.id) }))
  const handle: MockHandler = ({ route, url, path, method }) => {
    const ticketMatch = path.match(/^\/tickets\/(\d+)(\/messages|\/activity)?$/)

    if (method === 'GET' && path === '/tickets/metrics') return json(route, metrics)
    if (method === 'GET' && path === '/tickets/activity') return json(route, recentActivity)
    if (method === 'GET' && path === '/assignees') return json(route, [daniel, laura])
    if (method === 'GET' && path === '/tickets') {
      const status = url.searchParams.getAll('status')
      const customerId = url.searchParams.get('customerId')
      const items = currentTickets().filter(
        (ticket) =>
          (status.length === 0 || status.includes(ticket.status)) && (!customerId || ticket.customer.id === customerId),
      )
      return json(route, { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 })
    }
    if (ticketMatch) {
      const summary = currentTickets().find((ticket) => ticket.number === Number(ticketMatch[1]))
      if (!summary) return json(route, { status: 404, title: 'No encontrado' }, 404)
      if (ticketMatch[2] === '/messages') return json(route, messages)
      if (ticketMatch[2] === '/activity') return json(route, activity)
      return json(route, detail(summary))
    }
    return undefined
  }
  return { handle }
}
