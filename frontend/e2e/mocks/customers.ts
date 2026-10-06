import type { Customer, CustomerDetail, CustomerMetrics, CustomerSummary } from '../../src/api/schema'
import { json, minutesAgo, problem, teamMember, type MockFeature, type MockHandler } from './shared'

export const customerSummary = (
  customer: Omit<CustomerSummary, 'createdAt' | 'archived'> & Partial<CustomerSummary>,
) => ({
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
export const customerRef = ({ id, name, email, company }: CustomerSummary): Customer => ({ id, name, email, company })

const customerMetrics: CustomerMetrics = { total: 3, companies: 3, withOpenTickets: 2, newThisMonth: 1 }

const customerDetail = (summary: CustomerSummary): CustomerDetail => ({
  ...summary,
  notes: summary.id === 'c-maria' ? 'Prefiere que la llamen por la mañana.' : null,
  archivedAt: summary.archived ? minutesAgo(60 * 24) : null,
  version: 1,
  portalAccess: summary.id === 'c-maria' ? 'active' : 'none',
})

/** Clientes simulados; `customerRef` entrega a otras features el cliente tal como está ahora (p. ej. un renombrado). */
export function customersMock(): MockFeature & { customerRef: (id: string) => Customer } {
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
  let nextCustomer = 1
  const refOf = (id: string) => customerRef(state.get(id)!)
  const handle: MockHandler = ({ route, request, url, path, method }) => {
    const customerMatch = path.match(/^\/customers\/([^/]+?)(\/archive|\/restore|\/invite)?$/)

    if (method === 'GET' && path === '/customers/metrics') return json(route, customerMetrics)
    if (method === 'GET' && path === '/customers/companies')
      return json(route, ['Acme Studio', 'Northstar', 'Orbit Labs'])
    if (method === 'GET' && path === '/customers') {
      const q = url.searchParams.get('q')?.toLowerCase()
      const company = url.searchParams.get('company')
      const archived = url.searchParams.get('archived') === 'true'
      const size = Number(url.searchParams.get('size')) || 20
      const matches = [...state.values()]
        .map(summaryOf)
        .filter(
          (customer) =>
            customer.archived === archived &&
            (!company || customer.company === company) &&
            (!q || `${customer.name} ${customer.email} ${customer.company ?? ''}`.toLowerCase().includes(q)),
        )
      const items = matches.slice(0, size)
      return json(route, {
        items,
        page: 0,
        size,
        totalItems: matches.length,
        totalPages: Math.ceil(matches.length / size),
      })
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
    return undefined
  }
  return { handle, customerRef: refOf }
}
