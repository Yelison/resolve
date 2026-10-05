import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'

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
  search: (q: string) => [...customerKeys.all, 'search', q] as const,
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
