import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isApiError } from '../../api/client'
import type { ArticleSummary, CustomerSummary, TicketSummary } from '../../api/schema'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { customerKeys, fetchCustomerList } from '../customers/queries'
import { articleKeys, fetchArticleList } from '../knowledge/queries'
import { refreshSessionOnForbidden } from '../session/queries'
import { fetchTicketList, ticketKeys } from '../tickets/queries'
import type { SearchGroupId } from './groups'

/** Con menos caracteres no se busca: devolvería casi todo. */
export const MIN_SEARCH_LENGTH = 2
/** Espera tras la última tecla antes de pedir resultados. */
export const SEARCH_DEBOUNCE_MS = 250
/** Resultados por grupo; el resto queda tras «Ver todos los resultados». */
export const SEARCH_GROUP_SIZE = 5

export interface GroupResult<T> {
  /** `idle`: no se busca (rol sin permiso o texto corto); `forbidden`: el servidor respondió 403. */
  status: 'idle' | 'loading' | 'success' | 'error' | 'forbidden'
  items: T[]
  total: number
  /** Los datos son de la búsqueda anterior y la actual aún no ha llegado. */
  stale: boolean
  retry: () => void
}

export interface GlobalSearchResult {
  /** Texto con el que se está buscando, ya con la espera y el mínimo aplicados; vacío si no se busca. */
  term: string
  /** El texto escrito ya es el que se busca: no queda espera pendiente. */
  settled: boolean
  tickets: GroupResult<TicketSummary>
  customers: GroupResult<CustomerSummary>
  articles: GroupResult<ArticleSummary>
}

/**
 * Busca a la vez en tickets, clientes y artículos con las consultas de cada feature. Cada grupo es una consulta
 * propia: uno que falla no oculta a los demás, y al cambiar el texto TanStack Query cancela las peticiones anteriores
 * (la señal llega a `fetch`). Solo se piden los grupos de `allowed`.
 */
export function useGlobalSearch(input: string, allowed: readonly SearchGroupId[]): GlobalSearchResult {
  const typed = input.trim()
  const debounced = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS)
  // Si el texto escrito ya es corto, no se espera: la lista anterior sería de algo que ya no está en el campo.
  const term = typed.length >= MIN_SEARCH_LENGTH ? debounced : ''
  const active = term.length >= MIN_SEARCH_LENGTH
  const enabled = (id: SearchGroupId) => active && allowed.includes(id)

  const tickets = useQuery({
    queryKey: ticketKeys.list({
      view: 'all',
      status: [],
      priority: [],
      q: term,
      page: 1,
      pageSize: SEARCH_GROUP_SIZE,
      sort: 'updatedAt,desc',
    }),
    queryFn: ({ signal }) =>
      fetchTicketList(
        {
          view: 'all',
          status: [],
          priority: [],
          q: term,
          page: 1,
          pageSize: SEARCH_GROUP_SIZE,
          sort: 'updatedAt,desc',
        },
        signal,
      ),
    enabled: enabled('tickets'),
    placeholderData: keepPreviousData,
  })
  const customers = useQuery({
    queryKey: customerKeys.list({ q: term, page: 1, pageSize: SEARCH_GROUP_SIZE, sort: 'name,asc' }),
    queryFn: ({ signal }) =>
      fetchCustomerList({ q: term, page: 1, pageSize: SEARCH_GROUP_SIZE, sort: 'name,asc' }, signal),
    enabled: enabled('customers'),
    placeholderData: keepPreviousData,
  })
  const articles = useQuery({
    queryKey: articleKeys.list({ q: term, page: 1, pageSize: SEARCH_GROUP_SIZE }),
    queryFn: ({ signal }) => fetchArticleList({ q: term, page: 1, pageSize: SEARCH_GROUP_SIZE }, signal),
    enabled: enabled('articles'),
    placeholderData: keepPreviousData,
  })

  // Un 403 no es un resultado ni un fallo del grupo: el rol de la sesión ya no lo permite. Se relee /me para que el
  // grupo desaparezca de verdad en lugar de repetir el 403.
  const queryClient = useQueryClient()
  const forbidden = [tickets, customers, articles].find((query) => isApiError(query.error, 403))?.error
  useEffect(() => {
    if (forbidden) refreshSessionOnForbidden(queryClient, forbidden)
  }, [forbidden, queryClient])

  // Mientras el campo no coincide con la consulta, lo que hay en pantalla es de un texto anterior.
  const settled = typed === debounced || typed.length < MIN_SEARCH_LENGTH

  return {
    term,
    settled,
    tickets: groupResult(tickets, enabled('tickets'), settled),
    customers: groupResult(customers, enabled('customers'), settled),
    articles: groupResult(articles, enabled('articles'), settled),
  }
}

function groupResult<T>(
  query: {
    data?: { items: T[]; totalItems: number }
    error: Error | null
    isPlaceholderData: boolean
    isFetching: boolean
    refetch: () => unknown
  },
  enabled: boolean,
  settled: boolean,
): GroupResult<T> {
  const retry = () => void query.refetch()
  if (!enabled) return { status: 'idle', items: [], total: 0, stale: false, retry }
  if (isApiError(query.error, 403)) return { status: 'forbidden', items: [], total: 0, stale: false, retry }
  if (query.error) return { status: 'error', items: [], total: 0, stale: false, retry }
  if (!query.data) return { status: 'loading', items: [], total: 0, stale: false, retry }
  return {
    status: 'success',
    items: query.data.items,
    total: query.data.totalItems,
    stale: query.isPlaceholderData || !settled,
    retry,
  }
}
