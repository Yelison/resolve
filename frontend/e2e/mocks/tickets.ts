import type {
  Activity,
  ActivityFeedItem,
  AttentionList,
  AttentionReasonKind,
  Customer,
  LastMessage,
  Me,
  Message,
  Ticket,
  TicketMetrics,
  TicketSummary,
} from '../../src/api/schema'
import { daniel, json, laura, minutesAgo, problem, type MockFeature, type MockHandler } from './shared'
import { dayGroup } from '../../src/features/tickets/dateGroups'
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

/**
 * Las métricas salen de los propios tickets, con las definiciones del servidor: `open` es todo lo que no está resuelto,
 * `openedToday` lo no resuelto creado hoy en la zona de la organización, y las vistas cuentan lo mismo que la lista.
 */
function metricsOf(items: readonly BareTicket[]): TicketMetrics {
  const unresolved = items.filter((ticket) => ticket.status !== 'resolved')
  const now = new Date()
  const timeZone = me.organization.timeZone
  return {
    open: unresolved.length,
    openedToday: unresolved.filter((ticket) => dayGroup(new Date(ticket.createdAt), now, timeZone) === 'today').length,
    inProgress: items.filter((ticket) => ticket.status === 'in_progress').length,
    inProgressAssignedToMe: items.filter(
      (ticket) => ticket.status === 'in_progress' && ticket.assignee?.id === me.user.id,
    ).length,
    resolvedToday: 2,
    resolvedYesterday: 1,
    // Como el servidor para tickets que nunca tuvieron responsable: sin nadie desde que se crearon, hace más de 4 h.
    unassignedOver4Hours: unresolved.filter(
      (ticket) => ticket.assignee === null && Date.parse(ticket.createdAt) < now.getTime() - 4 * 3_600_000,
    ).length,
    firstResponseMinutes: 18,
    firstResponseTargetMinutes: 30,
    views: {
      all: items.length,
      mine: unresolved.filter((ticket) => ticket.assignee?.id === me.user.id).length,
      unassigned: unresolved.filter((ticket) => ticket.assignee === null).length,
      resolved: items.length - unresolved.length,
    },
  }
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

/**
 * Conversación de cada ticket. El #1048 y el #1047 terminan en una nota interna: un cliente no debe verla como último
 * mensaje, y para el personal no oculta lo que el cliente escribió.
 */
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
    // Una nota interna al final: no es una respuesta, y el ticket sigue necesitando atención («El cliente respondió»).
    {
      id: 'm-4',
      body: 'Lo estoy revisando con el banco.',
      visibility: 'internal',
      author: { id: daniel.id, name: daniel.name, kind: 'agent' },
      createdAt: minutesAgo(5),
    },
  ],
}

/** Texto plano de hasta 140 caracteres; si se recorta, termina en «…». Los cuerpos simulados no llevan Markdown. */
const excerptOf = (body: string) => (body.length > 140 ? `${body.slice(0, 139).trimEnd()}…` : body)

/** Como el servidor: el último mensaje que ve quien lee, en texto plano de hasta 140 caracteres; un cliente nunca ve notas. */
export function lastMessageOf(number: number, role: Me['role']): LastMessage | null {
  const visible = (conversations[number] ?? []).filter(
    (message) => role !== 'customer' || message.visibility === 'public',
  )
  const last = visible.at(-1)
  if (!last) return null
  return {
    excerpt: excerptOf(last.body),
    authorName: last.author.name,
    internal: last.visibility === 'internal',
    createdAt: last.createdAt,
  }
}

const HOUR = 3_600_000

/**
 * Los tickets que necesitan atención, con las reglas del servidor (`TicketAttentionQuery`): un motivo por ticket, el
 * primero que cumple, de «Urgente» a «Esperando». Los mensajes se juzgan por su visibilidad y por el tipo de autor,
 * así que una nota interna no cuenta como respuesta ni tapa un mensaje del cliente. Dentro de un motivo va primero el
 * que lleva más tiempo así y, a igualdad, el de número mayor. `open` y `total` no dependen de `size`.
 */
export function attentionOf(
  items: readonly BareTicket[],
  customerOf: (id: string) => Customer,
  scope: 'mine' | 'team',
  size: number,
  now = Date.now(),
): AttentionList {
  const order: AttentionReasonKind[] = ['urgent', 'unanswered', 'unassigned', 'customer_replied', 'high', 'waiting']
  const open = items.filter(
    (ticket) => ticket.status !== 'resolved' && (scope === 'team' || ticket.assignee?.id === me.user.id),
  )
  const reasoned = open.flatMap((ticket) => {
    const lastPublic = (conversations[ticket.number] ?? []).filter((message) => message.visibility === 'public').at(-1)
    const customerLast = lastPublic?.author.kind === 'customer'
    const created = Date.parse(ticket.createdAt)
    const messageAt = lastPublic ? Date.parse(lastPublic.createdAt) : undefined
    const updated = Date.parse(ticket.updatedAt)
    let kind: AttentionReasonKind | undefined
    let since = created
    if (ticket.priority === 'urgent') {
      kind = 'urgent'
    } else if (ticket.status === 'open' && (!lastPublic || customerLast) && now - (messageAt ?? created) >= HOUR) {
      kind = 'unanswered'
      since = messageAt ?? created
    } else if (ticket.assignee === null) {
      kind = 'unassigned'
    } else if (customerLast) {
      kind = 'customer_replied'
      since = messageAt!
    } else if (ticket.priority === 'high') {
      kind = 'high'
    } else if (ticket.status === 'waiting' && now - updated >= 24 * HOUR) {
      kind = 'waiting'
      since = updated
    }
    return kind
      ? [{ ticket, kind, since, excerpt: kind === 'customer_replied' ? excerptOf(lastPublic!.body) : null }]
      : []
  })
  reasoned.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.since - b.since || b.ticket.number - a.ticket.number,
  )
  return {
    items: reasoned.slice(0, size).map(({ ticket, kind, since, excerpt }) => ({
      ticket: {
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        customer: customerOf(ticket.customer.id),
        assignee: ticket.assignee,
        updatedAt: ticket.updatedAt,
      },
      reason: { kind, since: new Date(since).toISOString(), excerpt },
    })),
    total: reasoned.length,
    open: open.length,
  }
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
export function ticketsMock(
  customerOf: (id: string) => Customer,
  roleOrGetter: Me['role'] | (() => Me['role']) = 'admin',
): MockFeature & {
  /** Salir de un espacio: los tickets sin resolver que tenía la persona quedan sin asignar. */
  release: (userId: string) => void
} {
  // El rol de la sesión cambia al cambiar de espacio (agente en uno, cliente en otro): se lee en cada petición.
  const roleNow = typeof roleOrGetter === 'function' ? roleOrGetter : () => roleOrGetter
  const released = new Set<string>()
  // El estado de la llamada: lo que se libera no vuelve a asignarse en la siguiente petición.
  const live = () => bareTickets.map((ticket) => (released.has(ticket.id) ? { ...ticket, assignee: null } : ticket))
  // Los tickets embeben el cliente tal como está ahora, así la bandeja refleja un renombrado.
  const currentTickets = () =>
    live().map((ticket) => ({ ...withLastMessage(ticket, roleNow()), customer: customerOf(ticket.customer.id) }))
  const handle: MockHandler = ({ route, url, path, method }) => {
    const ticketMatch = path.match(/^\/tickets\/(\d+)(\/messages|\/activity)?$/)

    if (method === 'GET' && path === '/tickets/metrics') return json(route, metricsOf(live()))
    if (method === 'GET' && path === '/tickets/activity') return json(route, recentActivity)
    if (method === 'GET' && path === '/tickets/attention') {
      // Como el servidor: solo el personal, y el alcance es obligatorio.
      if (roleNow() === 'customer') return problem(route, 403, 'Sin permiso')
      const scope = url.searchParams.get('scope')
      if (scope !== 'mine' && scope !== 'team') {
        return problem(route, 400, 'Petición no válida', [
          { field: 'scope', message: 'Valor no válido. Usa: mine, team.' },
        ])
      }
      const size = Number(url.searchParams.get('size') ?? 6)
      return json(route, attentionOf(live(), customerOf, scope, size))
    }
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
          roleNow() === 'customer' ? conversation.filter((message) => message.visibility === 'public') : conversation,
        )
      }
      if (ticketMatch[2] === '/activity') return json(route, activity)
      return json(route, detail(summary))
    }
    return undefined
  }
  const release = (userId: string) => {
    for (const ticket of bareTickets) {
      if (ticket.assignee?.id === userId && ticket.status !== 'resolved') released.add(ticket.id)
    }
  }
  return { handle, release }
}
