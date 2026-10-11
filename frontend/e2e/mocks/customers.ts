import type { Customer, CustomerDetail, CustomerMetrics, CustomerSummary, TicketSummary } from '../../src/api/schema'
import { json, minutesAgo, problem, teamMember, type MockFeature, type MockHandler } from './shared'

/** Lo que cada cliente trae de serie: los recuentos y su último ticket se derivan de los tickets simulados. */
type CustomerSeed = Omit<CustomerSummary, 'openTickets' | 'totalTickets' | 'lastTicket'>

export const customerSummary = (
  customer: Pick<CustomerSeed, 'id' | 'name' | 'email' | 'company'> & Partial<CustomerSeed>,
) => ({
  createdAt: minutesAgo(60 * 24 * 10),
  archived: false,
  ...customer,
})

/** Clientes de demostración; el último está archivado. Sus tickets son los de `tickets.ts`. */
export const customers: CustomerSeed[] = [
  customerSummary({ id: 'c-maria', name: 'María Pérez', email: 'maria@cliente.example', company: 'Lumen Diseño' }),
  customerSummary({ id: 'c-carlos', name: 'Carlos Ruiz', email: 'carlos@northstar.example', company: 'Northstar' }),
  customerSummary({
    id: 'c-ana',
    name: 'Ana García Fernández de la Fuente',
    email: 'ana.garcia.fernandez.de.la.fuente@orbit-labs.example',
    company: 'Orbit Labs',
  }),
  customerSummary({
    id: 'c-luis',
    name: 'Luis Gómez',
    email: 'luis@cliente.example',
    company: null,
    archived: true,
  }),
]

/** El cliente tal como lo incrusta un ticket: `Customer`, sin los contadores de la lista. */
export const customerRef = ({ id, name, email, company }: CustomerSeed): Customer => ({ id, name, email, company })

type CustomerState = Omit<CustomerDetail, 'openTickets' | 'totalTickets'>

const customerState = (seed: CustomerSeed): CustomerState => ({
  ...seed,
  notes: seed.id === 'c-maria' ? 'Prefiere que la llamen por la mañana.' : null,
  archivedAt: seed.archived ? minutesAgo(60 * 24) : null,
  version: 1,
  portalAccess: seed.id === 'c-maria' ? 'active' : 'none',
})

/** Los recuentos y el último ticket de un cliente, leídos de sus tickets como lo hace el servidor. */
function ticketFacts(customerId: string, tickets: TicketSummary[]) {
  const own = tickets.filter((ticket) => ticket.customer.id === customerId)
  // El más reciente por actividad; con el mismo instante, el número más alto.
  const latest = own.reduce<TicketSummary | undefined>(
    (best, ticket) =>
      !best || ticket.updatedAt > best.updatedAt || (ticket.updatedAt === best.updatedAt && ticket.number > best.number)
        ? ticket
        : best,
    undefined,
  )
  return {
    openTickets: own.filter((ticket) => ticket.status !== 'resolved').length,
    totalTickets: own.length,
    lastTicket: latest
      ? { number: latest.number, subject: latest.subject, status: latest.status, updatedAt: latest.updatedAt }
      : null,
  }
}

/**
 * Clientes simulados; `customerRef` entrega a otras features el cliente tal como está ahora (p. ej. un renombrado) y
 * `ticketsOf` da los tickets simulados, de donde salen los recuentos y el último ticket (sin copias que se desincronicen).
 */
export function customersMock(
  ticketsOf: () => TicketSummary[],
): MockFeature & { customerRef: (id: string) => Customer } {
  // El estado es de cada test: un renombrado o un archivado no se filtra a los demás tests del mismo worker.
  const state = new Map(customers.map((customer) => [customer.id, customerState(customer)]))
  const detailOf = (current: CustomerState): CustomerDetail => {
    const { openTickets, totalTickets } = ticketFacts(current.id, ticketsOf())
    return { ...current, openTickets, totalTickets }
  }
  const summaryOf = (current: CustomerState): CustomerSummary => ({
    id: current.id,
    name: current.name,
    email: current.email,
    company: current.company,
    createdAt: current.createdAt,
    archived: current.archived,
    ...ticketFacts(current.id, ticketsOf()),
  })
  // Del mismo origen que el servidor: solo clientes activos, empresas sin distinguir mayúsculas y uno de cada nuevo.
  const metricsOf = (): CustomerMetrics => {
    const active = [...state.values()].filter((customer) => !customer.archived)
    return {
      total: active.length,
      companies: new Set(active.flatMap((customer) => (customer.company ? [customer.company.toLowerCase()] : []))).size,
      withOpenTickets: active.filter((customer) => ticketFacts(customer.id, ticketsOf()).openTickets > 0).length,
      newThisMonth: 1 + createdCount,
    }
  }
  // Los tickets embeben el cliente tal como está ahora, así la bandeja refleja un renombrado.
  let nextCustomer = 1
  let createdCount = 0
  const refOf = (id: string) => customerRef(state.get(id)!)
  const handle: MockHandler = ({ route, request, url, path, method }) => {
    const customerMatch = path.match(/^\/customers\/([^/]+?)(\/archive|\/restore|\/invite)?$/)

    if (method === 'GET' && path === '/customers/metrics') return json(route, metricsOf())
    if (method === 'GET' && path === '/customers/companies')
      return json(route, ['Lumen Diseño', 'Northstar', 'Orbit Labs'])
    if (method === 'GET' && (path === '/customers' || path === '/customers/by-company')) {
      const q = url.searchParams.get('q')?.toLowerCase()
      const company = url.searchParams.get('company')
      const withoutCompany = url.searchParams.get('withoutCompany') === 'true'
      const archived = url.searchParams.get('archived') === 'true'
      const size = Number(url.searchParams.get('size')) || 20
      const page = Number(url.searchParams.get('page')) || 0
      const [sortField, sortDirection] = (url.searchParams.get('sort') ?? 'name,asc').split(',')
      const matches = [...state.values()]
        .map(summaryOf)
        .filter(
          (customer) =>
            customer.archived === archived &&
            (!company || customer.company === company) &&
            (!withoutCompany || !customer.company?.trim()) &&
            (!q || `${customer.name} ${customer.email} ${customer.company ?? ''}`.toLowerCase().includes(q)),
        )
        .sort((a, b) => {
          const order =
            sortField === 'createdAt'
              ? a.createdAt.localeCompare(b.createdAt)
              : sortField === 'openTickets'
                ? a.openTickets - b.openTickets
                : a.name.localeCompare(b.name, 'es')
          return sortDirection === 'desc' ? -order : order
        })
      const pageOf = <T>(items: T[]) => ({
        items: items.slice(page * size, (page + 1) * size),
        page,
        size,
        totalItems: items.length,
        totalPages: Math.ceil(items.length / size),
      })
      if (path === '/customers') return json(route, pageOf(matches))
      // Como el servidor: una empresa por grupo (sin distinguir mayúsculas), la de «sin empresa» al final, los totales
      // de todos sus clientes y los tres primeros en el orden pedido.
      const byCompany = new Map<string, CustomerSummary[]>()
      for (const customer of matches) {
        const key = customer.company?.trim().toLowerCase() ?? ''
        byCompany.set(key, [...(byCompany.get(key) ?? []), customer])
      }
      const groups = [...byCompany.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')))
        .map(([, members]) => ({
          company: members[0]!.company?.trim() || null,
          customerCount: members.length,
          openTickets: members.reduce((sum, member) => sum + member.openTickets, 0),
          customers: members.slice(0, 3),
        }))
      return json(route, pageOf(groups))
    }
    if (method === 'POST' && path === '/customers') {
      const body = request.postDataJSON() as { name: string; email: string; company?: string | null }
      if ([...state.values()].some((customer) => customer.email === body.email)) {
        return problem(route, 400, 'Datos no válidos', [
          { field: 'email', message: 'Ya existe un cliente con ese correo.' },
        ])
      }
      const created = customerState(
        customerSummary({
          id: `c-nuevo-${nextCustomer++}`,
          name: body.name,
          email: body.email,
          company: body.company ?? null,
        }),
      )
      state.set(created.id, created)
      createdCount += 1
      return json(route, detailOf(created), 201)
    }
    if (customerMatch) {
      const current = state.get(customerMatch[1]!)
      if (!current) return problem(route, 404, 'No encontrado')
      const action = customerMatch[2]
      if (method === 'GET' && !action) return json(route, detailOf(current))
      if (method === 'PATCH' && !action) {
        const ifMatch = request.headers()['if-match']
        if (!ifMatch) return problem(route, 428, 'Falta If-Match')
        if (ifMatch !== `"${current.version}"`) return problem(route, 412, 'El recurso cambió')
        if (current.archived) return problem(route, 409, 'El cliente está archivado')
        const patch = request.postDataJSON() as Partial<CustomerState>
        const updated = { ...current, ...patch, version: current.version + 1 }
        state.set(updated.id, updated)
        return json(route, detailOf(updated))
      }
      if (method === 'POST' && action === '/invite') {
        if (current.archived || current.portalAccess !== 'none') {
          return json(route, { status: 409, title: 'Conflicto', detail: 'El cliente ya tiene acceso al portal.' }, 409)
        }
        state.set(current.id, { ...current, portalAccess: 'invited', version: current.version + 1 })
        return json(
          route,
          teamMember({
            id: `u-${current.id}`,
            name: current.name,
            email: current.email,
            role: 'customer',
            status: 'invited',
            joinedAt: null,
            invitedAt: new Date().toISOString(),
          }),
          201,
        )
      }
      if (method === 'POST' && action) {
        const archive = action === '/archive'
        if (current.archived === archive) return problem(route, 409, 'Conflicto de estado')
        const updated: CustomerState = {
          ...current,
          archived: archive,
          archivedAt: archive ? new Date().toISOString() : null,
          version: current.version + 1,
        }
        state.set(updated.id, updated)
        return json(route, detailOf(updated))
      }
    }
    return undefined
  }
  return { handle, customerRef: refOf }
}
