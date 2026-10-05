import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'

export interface CustomerListParams {
  q?: string
  company?: string
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
