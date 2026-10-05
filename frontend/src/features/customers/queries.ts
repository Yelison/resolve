import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'
import type { CustomerCreate, CustomerDetail, CustomerPatch } from '../../domain/customer'
import { refreshSessionOnForbidden } from '../team/queries'
import { ticketKeys } from '../tickets/queries'

export interface CustomerListParams {
  q?: string
  company?: string
  /** `true` lista solo los clientes archivados. */
  archived?: boolean
  /** Página de la interfaz, desde 1. */
  page: number
  pageSize: number
  sort?: string
}

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: CustomerListParams) => [...customerKeys.lists(), params] as const,
  searches: () => [...customerKeys.all, 'search'] as const,
  search: (q: string) => [...customerKeys.searches(), q] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  metrics: () => [...customerKeys.all, 'metrics'] as const,
  companies: () => [...customerKeys.all, 'companies'] as const,
}

/** Búsqueda de clientes para el selector de un formulario. */
export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: customerKeys.search(q),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/customers', { params: { query: { q: q || undefined, size: 20 } }, signal })),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerList(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/customers', {
          params: {
            query: {
              q: params.q?.trim() || undefined,
              company: params.company || undefined,
              archived: params.archived || undefined,
              page: toApiPage(params.page),
              size: params.pageSize,
              sort: params.sort,
            },
          },
          signal,
        }),
      ),
    // Mantiene la página anterior mientras llega la siguiente, sin parpadeos al filtrar o paginar.
    placeholderData: keepPreviousData,
  })
}

export function useCustomerMetrics() {
  return useQuery({
    queryKey: customerKeys.metrics(),
    queryFn: ({ signal }) => unwrap(api.GET('/customers/metrics', { signal })),
  })
}

export function useCompanies() {
  return useQuery({
    queryKey: customerKeys.companies(),
    queryFn: ({ signal }) => unwrap(api.GET('/customers/companies', { signal })),
  })
}

/**
 * Lee el detalle sin hacer retroceder la caché: si la lectura salió del servidor antes de una escritura y llega
 * después, trae una versión anterior a la ya guardada y se conserva la de la caché.
 */
async function fetchCustomer(queryClient: QueryClient, id: string, signal?: AbortSignal) {
  const fresh = await unwrap(api.GET('/customers/{id}', { params: { path: { id } }, signal }))
  const cached = queryClient.getQueryData<CustomerDetail>(customerKeys.detail(id))
  return cached && cached.version > fresh.version ? cached : fresh
}

export function useCustomer(id: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: ({ signal }) => fetchCustomer(queryClient, id, signal),
  })
}

/** Guarda el cliente devuelto por una escritura solo si no es más antiguo que el que ya hay en caché. */
function writeCustomerIfNewer(queryClient: QueryClient, customer: CustomerDetail) {
  const previous = queryClient.getQueryData<CustomerDetail>(customerKeys.detail(customer.id))
  if (customer.version >= (previous?.version ?? -1)) {
    queryClient.setQueryData(customerKeys.detail(customer.id), customer)
  }
}

/** Lo que cambia en cualquier escritura: la lista, sus métricas, las empresas y la búsqueda del formulario de ticket. */
function invalidateCustomerViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: customerKeys.metrics() })
  void queryClient.invalidateQueries({ queryKey: customerKeys.companies() })
  void queryClient.invalidateQueries({ queryKey: customerKeys.searches() })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (customer: CustomerCreate) => unwrap(api.POST('/customers', { body: customer })),
    onSuccess: (customer: CustomerDetail) => {
      queryClient.setQueryData(customerKeys.detail(customer.id), customer)
      invalidateCustomerViews(queryClient)
    },
  })
}

/** Campos del cliente que los tickets incrustan (`Customer`): si cambia uno, la bandeja debe mostrarlo. */
const ticketEmbeddedFields = ['name', 'email', 'company'] as const

/**
 * Edita un cliente con If-Match y merge-patch: solo viajan los campos cambiados, así repetir la edición tras un 412 no
 * pisa lo que cambió otra persona. Un 412 recarga el detalle. Antes de enviar se cancela la lectura en vuelo del
 * detalle: si llegara después, pisaría la versión nueva.
 */
export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: customerKeys.detail(id), exact: true })
    },
    mutationFn: ({ version, changes }: { version: number; changes: CustomerPatch }) =>
      unwrap(
        api.PATCH('/customers/{id}', {
          params: { path: { id }, header: { 'If-Match': `"${version}"` } },
          body: changes,
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }),
      ),
    onSuccess: (customer: CustomerDetail, { changes }) => {
      writeCustomerIfNewer(queryClient, customer)
      invalidateCustomerViews(queryClient)
      if (ticketEmbeddedFields.some((field) => field in changes)) {
        // Los tickets llevan el nombre, el correo y la empresa del cliente: listas y detalles se leen de nuevo.
        void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id), exact: true })
    },
  })
}

function useCustomerStateChange(id: string, request: () => Promise<CustomerDetail>) {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: customerKeys.detail(id), exact: true })
    },
    mutationFn: request,
    onSuccess: (customer: CustomerDetail) => {
      writeCustomerIfNewer(queryClient, customer)
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id), exact: true })
      invalidateCustomerViews(queryClient)
    },
    // Un 409 significa que otra persona ya cambió el estado: se lee de nuevo para mostrar el real.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id), exact: true })
    },
  })
}

export function useArchiveCustomer(id: string) {
  return useCustomerStateChange(id, () => unwrap(api.POST('/customers/{id}/archive', { params: { path: { id } } })))
}

export function useRestoreCustomer(id: string) {
  return useCustomerStateChange(id, () => unwrap(api.POST('/customers/{id}/restore', { params: { path: { id } } })))
}

/**
 * Invita al cliente al portal (admin). La respuesta es el miembro invitado, no el cliente: `portalAccess` se lee de
 * nuevo del servidor en lugar de parchearse a mano. Un 409 (ya tiene acceso, está archivado, su correo es de un
 * miembro del equipo) también relee el detalle, que puede haber cambiado desde que se abrió.
 */
export function useInviteCustomer(id: string) {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id), exact: true })
  }
  return useMutation({
    mutationFn: () => unwrap(api.POST('/customers/{id}/invite', { params: { path: { id } } })),
    onSuccess: refresh,
    onError: (error) => {
      refresh()
      refreshSessionOnForbidden(queryClient, error)
    },
  })
}
