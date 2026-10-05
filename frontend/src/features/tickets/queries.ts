import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'
import type { MessageVisibility, Ticket, TicketPriority, TicketStatus, TicketView } from '../../domain/ticket'

export interface TicketListParams {
  view: TicketView
  status: TicketStatus[]
  priority: TicketPriority[]
  /** Id de un miembro, `none` para sin asignar o vacío para todos. */
  assigneeId?: string
  q?: string
  /** Página de la interfaz, desde 1. */
  page: number
  pageSize: number
  sort: string
}

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (params: TicketListParams) => [...ticketKeys.lists(), params] as const,
  metrics: () => [...ticketKeys.all, 'metrics'] as const,
  detail: (number: number) => [...ticketKeys.all, 'detail', number] as const,
  messages: (number: number) => [...ticketKeys.detail(number), 'messages'] as const,
  activity: (number: number) => [...ticketKeys.detail(number), 'activity'] as const,
}

export function useTicketList(params: TicketListParams) {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/tickets', {
          params: {
            query: {
              view: params.view,
              status: params.status,
              priority: params.priority,
              assigneeId: params.assigneeId || undefined,
              q: params.q?.trim() || undefined,
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

export function useTicketMetrics(enabled = true) {
  return useQuery({
    queryKey: ticketKeys.metrics(),
    queryFn: ({ signal }) => unwrap(api.GET('/tickets/metrics', { signal })),
    enabled,
  })
}

/**
 * Lee el detalle sin hacer retroceder la caché: si la lectura salió del servidor antes de un PATCH y llega después,
 * trae una versión anterior a la ya guardada y se conserva la de la caché.
 */
async function fetchTicket(queryClient: QueryClient, number: number, signal?: AbortSignal) {
  const fresh = await unwrap(api.GET('/tickets/{number}', { params: { path: { number } }, signal }))
  const cached = queryClient.getQueryData<Ticket>(ticketKeys.detail(number))
  return cached && cached.version > fresh.version ? cached : fresh
}

export function useTicket(number: number) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ticketKeys.detail(number),
    queryFn: ({ signal }) => fetchTicket(queryClient, number, signal),
  })
}

export function useTicketMessages(number: number) {
  return useQuery({
    queryKey: ticketKeys.messages(number),
    queryFn: ({ signal }) => unwrap(api.GET('/tickets/{number}/messages', { params: { path: { number } }, signal })),
  })
}

export function useTicketActivity(number: number, enabled = true) {
  return useQuery({
    queryKey: ticketKeys.activity(number),
    queryFn: ({ signal }) => unwrap(api.GET('/tickets/{number}/activity', { params: { path: { number } }, signal })),
    enabled,
  })
}

export interface TicketChanges {
  status?: TicketStatus
  priority?: TicketPriority
  /** `null` quita el responsable; ausente no lo cambia. */
  assigneeId?: string | null
}

/**
 * Guarda el ticket devuelto por un PATCH solo si no es más antiguo que el que ya hay en caché, para que una respuesta
 * desordenada nunca haga retroceder la versión.
 */
function writeTicketIfNewer(queryClient: QueryClient, ticket: Ticket) {
  const previous = queryClient.getQueryData<Ticket>(ticketKeys.detail(ticket.number))
  if (ticket.version >= (previous?.version ?? -1)) {
    queryClient.setQueryData(ticketKeys.detail(ticket.number), ticket)
  }
}

/**
 * Actualiza un ticket con If-Match. Un 412 significa que otra persona lo cambió: se recarga el ticket.
 * Antes del PATCH se cancela cualquier lectura del detalle en vuelo: si llegara después, pisaría la versión nueva.
 */
export function useUpdateTicket(number: number) {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ticketKeys.detail(number), exact: true })
    },
    mutationFn: ({ version, changes }: { version: number; changes: TicketChanges }) =>
      unwrap(
        api.PATCH('/tickets/{number}', {
          params: { path: { number }, header: { 'If-Match': `"${version}"` } },
          body: changes,
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }),
      ),
    onSuccess: (ticket: Ticket) => {
      writeTicketIfNewer(queryClient, ticket)
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(number) })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(number), exact: true })
    },
  })
}

export function useAddMessage(number: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: { body: string; visibility: MessageVisibility }) =>
      unwrap(api.POST('/tickets/{number}/messages', { params: { path: { number } }, body: message })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(number) })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
    },
  })
}

export interface NewTicket {
  customerId: string
  subject: string
  description: string
  priority: TicketPriority
  assigneeId: string | null
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ticket: NewTicket) => unwrap(api.POST('/tickets', { body: ticket })),
    onSuccess: (ticket: Ticket) => {
      queryClient.setQueryData(ticketKeys.detail(ticket.number), ticket)
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
    },
  })
}

export function useAssignees(enabled = true) {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: ({ signal }) => unwrap(api.GET('/assignees', { signal })),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: ['customers', q],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/customers', { params: { query: { q: q || undefined, size: 20 } }, signal })),
    placeholderData: keepPreviousData,
  })
}

/**
 * Cambio rápido desde la bandeja: el resumen no trae la versión, así que se lee el ticket actual y se aplica el
 * cambio con su If-Match. Si alguien lo cambió en medio, la API responde 412 y no se pisa nada.
 */
export function useQuickTicketUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ number, changes }: { number: number; changes: TicketChanges }) => {
      const current = await queryClient.fetchQuery({
        queryKey: ticketKeys.detail(number),
        queryFn: () => fetchTicket(queryClient, number),
        staleTime: 0,
      })
      await queryClient.cancelQueries({ queryKey: ticketKeys.detail(number), exact: true })
      return unwrap(
        api.PATCH('/tickets/{number}', {
          params: { path: { number }, header: { 'If-Match': `"${current.version}"` } },
          body: changes,
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }),
      )
    },
    onSuccess: (ticket: Ticket) => {
      writeTicketIfNewer(queryClient, ticket)
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticket.number) })
    },
  })
}
