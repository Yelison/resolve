import type {
  Activity,
  ActivityFeedItem,
  Customer,
  LastMessage,
  Me,
  Message,
  Ticket,
  TicketMetrics,
  TicketSummary,
} from '../../src/api/schema'
import { daniel, json, laura, minutesAgo, type MockFeature, type MockHandler } from './shared'
import { customerRef, customers } from './customers'
import { me } from './session'

/** Los resúmenes sin su último mensaje: se calcula de la conversación y depende de quién lee. */
type BareTicket = Omit<TicketSummary, 'lastMessage'>

const bareTickets: BareTicket[] = [
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
  open: 3,
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

/** El detalle no lleva `lastMessage`: el contrato no admite campos de más. */
const withoutLastMessage = ({ lastMessage: _lastMessage, ...rest }: TicketSummary) => rest

const detail = (summary: TicketSummary): Ticket => ({
  ...withoutLastMessage(summary),
  description: 'Desde esta mañana no puedo acceder. El enlace de recuperación dice que ya venció.',
  version: 2,
})

/** Conversación de cada ticket. El #1048 termina en una nota interna: un cliente no debe verla como último mensaje. */
const conversations: Record<number, Message[]> = {
  1048: [
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
  ],
  1047: [
    {
      id: 'm-3',
      body: 'El cargo aparece rechazado aunque el banco dice que está aprobado.',
      visibility: 'public',
      author: { id: customers[1]!.id, name: customers[1]!.name, kind: 'customer' },
      createdAt: minutesAgo(12),
    },
  ],
}

/** Como el servidor: el último mensaje que ve quien lee, en texto plano de hasta 140 caracteres; un cliente nunca ve notas. */
export function lastMessageOf(number: number, role: Me['role']): LastMessage | null {
  const visible = (conversations[number] ?? []).filter(
    (message) => role !== 'customer' || message.visibility === 'public',
  )
  const last = visible.at(-1)
  if (!last) return null
  const excerpt = last.body.length > 140 ? `${last.body.slice(0, 139).trimEnd()}…` : last.body
  return { excerpt, authorName: last.author.name, internal: last.visibility === 'internal', createdAt: last.createdAt }
}

const withLastMessage = (ticket: BareTicket, role: Me['role']): TicketSummary => ({
  ...ticket,
  lastMessage: lastMessageOf(ticket.number, role),
})

/** Los tres tickets de la demostración tal como los ve el personal. */
export const tickets: TicketSummary[] = bareTickets.map((ticket) => withLastMessage(ticket, 'admin'))

const activity: Activity[] = [
  { id: 'a-1', type: 'created', actor: { id: me.user.id, name: me.user.name }, createdAt: minutesAgo(18) },
]

/** Tickets simulados; `customerOf` da el cliente actual para que la bandeja refleje un renombrado. */
export function ticketsMock(customerOf: (id: string) => Customer, role: Me['role'] = 'admin'): MockFeature {
  // Los tickets embeben el cliente tal como está ahora, así la bandeja refleja un renombrado.
  const currentTickets = () =>
    bareTickets.map((ticket) => ({ ...withLastMessage(ticket, role), customer: customerOf(ticket.customer.id) }))
  const handle: MockHandler = ({ route, url, path, method }) => {
    const ticketMatch = path.match(/^\/tickets\/(\d+)(\/messages|\/activity)?$/)

    if (method === 'GET' && path === '/tickets/metrics') return json(route, metrics)
    if (method === 'GET' && path === '/tickets/activity') return json(route, recentActivity)
    if (method === 'GET' && path === '/assignees') return json(route, [daniel, laura])
    if (method === 'GET' && path === '/tickets') {
      const status = url.searchParams.getAll('status')
      const view = url.searchParams.get('view')
      const customerId = url.searchParams.get('customerId')
      const q = url.searchParams.get('q')?.trim().toLowerCase()
      const size = Number(url.searchParams.get('size')) || 20
      const pageIndex = Number(url.searchParams.get('page')) || 0
      // Como el servidor: un número (con o sin #) busca ese ticket; cualquier otro texto, en el asunto y el cliente.
      const number = q && /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : undefined
      const inView = (ticket: TicketSummary) =>
        view === 'resolved'
          ? ticket.status === 'resolved'
          : view === 'unassigned'
            ? ticket.status !== 'resolved' && ticket.assignee === null
            : view === 'mine'
              ? ticket.status !== 'resolved' && ticket.assignee?.id === me.user.id
              : true
      const matches = currentTickets().filter(
        (ticket) =>
          inView(ticket) &&
          (status.length === 0 || status.includes(ticket.status)) &&
          (!customerId || ticket.customer.id === customerId) &&
          (!q ||
            (number !== undefined
              ? ticket.number === number
              : `${ticket.subject} ${ticket.customer.name} ${ticket.customer.email} ${ticket.customer.company ?? ''}`
                  .toLowerCase()
                  .includes(q))),
      )
      const items = matches.slice(pageIndex * size, (pageIndex + 1) * size)
      return json(route, {
        items,
        page: pageIndex,
        size,
        totalItems: matches.length,
        totalPages: Math.ceil(matches.length / size),
      })
    }
    if (ticketMatch) {
      const summary = currentTickets().find((ticket) => ticket.number === Number(ticketMatch[1]))
      if (!summary) return json(route, { status: 404, title: 'No encontrado' }, 404)
      if (ticketMatch[2] === '/messages') {
        const conversation = conversations[summary.number] ?? []
        return json(
          route,
          role === 'customer' ? conversation.filter((message) => message.visibility === 'public') : conversation,
        )
      }
      if (ticketMatch[2] === '/activity') return json(route, activity)
      return json(route, detail(summary))
    }
    return undefined
  }
  return { handle }
}
