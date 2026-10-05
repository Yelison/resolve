import { test as base, type Page, type Route } from '@playwright/test'
import type {
  Me,
  Message,
  Activity,
  Customer,
  CustomerDetail,
  CustomerMetrics,
  CustomerSummary,
  Member,
  Ticket,
  TicketMetrics,
  TicketSummary,
} from '../src/api/schema'

/**
 * API simulada para las pruebas e2e deterministas: respuestas tipadas con el contrato (src/api/schema.ts), así que
 * si el contrato cambia, estas fixtures dejan de compilar. La prueba con backend real va aparte.
 */
const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

const laura: Member = { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' }
const daniel: Member = { id: 'u-daniel', name: 'Daniel Santos', email: 'daniel@acme.example' }

export const me: Me = {
  user: { id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example' },
  organization: { id: 'org-1', name: 'Acme Studio', timeZone: 'America/Bogota' },
  role: 'admin',
  customerId: null,
}

const customerSummary = (customer: Omit<CustomerSummary, 'createdAt' | 'archived'> & Partial<CustomerSummary>) => ({
  createdAt: minutesAgo(60 * 24 * 10),
  archived: false,
  ...customer,
})

/** Clientes de demostración con el contrato de lista (`CustomerSummary`); el último está archivado. */
export const customers: CustomerSummary[] = [
  customerSummary({
    id: 'c-maria',
    name: 'María Pérez',
    email: 'maria@cliente.example',
    company: 'Acme Studio',
    openTickets: 2,
    totalTickets: 9,
  }),
  customerSummary({
    id: 'c-carlos',
    name: 'Carlos Ruiz',
    email: 'carlos@northstar.example',
    company: 'Northstar',
    openTickets: 0,
    totalTickets: 4,
  }),
  customerSummary({
    id: 'c-ana',
    name: 'Ana García Fernández de la Fuente',
    email: 'ana.garcia.fernandez.de.la.fuente@orbit-labs.example',
    company: 'Orbit Labs',
    openTickets: 1,
    totalTickets: 3,
  }),
  customerSummary({
    id: 'c-luis',
    name: 'Luis Gómez',
    email: 'luis@cliente.example',
    company: null,
    openTickets: 0,
    totalTickets: 1,
    archived: true,
  }),
]

/** El cliente tal como lo incrusta un ticket: `Customer`, sin los contadores de la lista. */
const customerRef = ({ id, name, email, company }: CustomerSummary): Customer => ({ id, name, email, company })

const customerMetrics: CustomerMetrics = { total: 3, companies: 3, withOpenTickets: 2, newThisMonth: 1 }

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

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: status >= 400 ? 'application/problem+json' : 'application/json',
    body: JSON.stringify(body),
  })

const customerDetail = (summary: CustomerSummary): CustomerDetail => ({
  ...summary,
  notes: summary.id === 'c-maria' ? 'Prefiere que la llamen por la mañana.' : null,
  archivedAt: summary.archived ? minutesAgo(60 * 24) : null,
  version: 1,
  portalAccess: summary.id === 'c-maria' ? 'active' : 'none',
})

const problem = (route: Route, status: number, title: string, errors?: { field: string; message: string }[]) =>
  json(route, { status, title, ...(errors && { errors }) }, status)

export async function mockApi(page: Page) {
  // El estado es de cada test: un renombrado o un archivado no se filtra a los demás tests del mismo worker.
  const state = new Map(customers.map((customer) => [customer.id, customerDetail(customer)]))
  const summaryOf = ({
    notes: _notes,
    archivedAt: _archivedAt,
    version: _version,
    portalAccess: _access,
    ...summary
  }: CustomerDetail): CustomerSummary => summary
  // Los tickets embeben el cliente tal como está ahora, así la bandeja refleja un renombrado.
  const currentTickets = () =>
    tickets.map((ticket) => ({ ...ticket, customer: customerRef(state.get(ticket.customer.id)!) }))
  let nextCustomer = 1

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = request.method()
    const ticketMatch = path.match(/^\/tickets\/(\d+)(\/messages|\/activity)?$/)
    const customerMatch = path.match(/^\/customers\/([^/]+?)(\/archive|\/restore)?$/)

    if (method === 'GET' && path === '/me') return json(route, me)
    if (method === 'GET' && path === '/tickets/metrics') return json(route, metrics)
    if (method === 'GET' && path === '/assignees') return json(route, [daniel, laura])
    if (method === 'GET' && path === '/customers/metrics') return json(route, customerMetrics)
    if (method === 'GET' && path === '/customers/companies')
      return json(route, ['Acme Studio', 'Northstar', 'Orbit Labs'])
    if (method === 'GET' && path === '/customers') {
      const q = url.searchParams.get('q')?.toLowerCase()
      const company = url.searchParams.get('company')
      const archived = url.searchParams.get('archived') === 'true'
      const items = [...state.values()]
        .map(summaryOf)
        .filter(
          (customer) =>
            customer.archived === archived &&
            (!company || customer.company === company) &&
            (!q || `${customer.name} ${customer.email} ${customer.company ?? ''}`.toLowerCase().includes(q)),
        )
      return json(route, { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 })
    }
    if (method === 'POST' && path === '/customers') {
      const body = request.postDataJSON() as { name: string; email: string; company?: string | null }
      if ([...state.values()].some((customer) => customer.email === body.email)) {
        return problem(route, 400, 'Datos no válidos', [
          { field: 'email', message: 'Ya existe un cliente con ese correo.' },
        ])
      }
      const created = customerDetail(
        customerSummary({
          id: `c-nuevo-${nextCustomer++}`,
          name: body.name,
          email: body.email,
          company: body.company ?? null,
          openTickets: 0,
          totalTickets: 0,
        }),
      )
      state.set(created.id, created)
      return json(route, created, 201)
    }
    if (customerMatch) {
      const current = state.get(customerMatch[1]!)
      if (!current) return problem(route, 404, 'No encontrado')
      const action = customerMatch[2]
      if (method === 'GET' && !action) return json(route, current)
      if (method === 'PATCH' && !action) {
        const ifMatch = request.headers()['if-match']
        if (!ifMatch) return problem(route, 428, 'Falta If-Match')
        if (ifMatch !== `"${current.version}"`) return problem(route, 412, 'El recurso cambió')
        if (current.archived) return problem(route, 409, 'El cliente está archivado')
        const patch = request.postDataJSON() as Partial<CustomerDetail>
        const updated = { ...current, ...patch, version: current.version + 1 }
        state.set(updated.id, updated)
        return json(route, updated)
      }
      if (method === 'POST' && action) {
        const archive = action === '/archive'
        if (current.archived === archive) return problem(route, 409, 'Conflicto de estado')
        const updated: CustomerDetail = {
          ...current,
          archived: archive,
          archivedAt: archive ? new Date().toISOString() : null,
          version: current.version + 1,
        }
        state.set(updated.id, updated)
        return json(route, updated)
      }
    }
    if (method === 'GET' && path === '/tickets') {
      const status = url.searchParams.get('status')
      const customerId = url.searchParams.get('customerId')
      const items = currentTickets().filter(
        (ticket) => (!status || ticket.status === status) && (!customerId || ticket.customer.id === customerId),
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
    return json(route, { status: 501, title: `Sin fixture para ${method} ${path}` }, 501)
  })
}

/** Test con la API simulada en cada página. */
export const test = base.extend({
  page: async ({ page }, run) => {
    await mockApi(page)
    await run(page)
  },
})

export { expect } from '@playwright/test'
