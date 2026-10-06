import { useRef } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'
import type { MessageVisibility, Ticket, TicketPriority, TicketStatus, TicketView } from '../../domain/ticket'
import { reportKeys } from '../reports/queries'

export interface TicketListParams {
  view: TicketView
  status: TicketStatus[]
  priority: TicketPriority[]
  /** Id de un miembro, `none` para sin asignar o vacío para todos. */
  assigneeId?: string
  /** Solo los tickets de este cliente; un cliente miembro lo combina con su propio alcance. */
  customerId?: string
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
  /** Actividad reciente de toda la organización (no la de un ticket: esa es `activity(number)`). */
  feed: () => [...ticketKeys.all, 'feed'] as const,
  recent: (size: number) => [...ticketKeys.feed(), size] as const,
  detail: (number: number) => [...ticketKeys.all, 'detail', number] as const,
  messages: (number: number) => [...ticketKeys.detail(number), 'messages'] as const,
  activity: (number: number) => [...ticketKeys.detail(number), 'activity'] as const,
}

/** Pide una página de la bandeja; la comparten la bandeja y la búsqueda global. */
export function fetchTicketList(params: TicketListParams, signal?: AbortSignal) {
  return unwrap(
    api.GET('/tickets', {
      params: {
        query: {
          view: params.view,
          status: params.status,
          priority: params.priority,
          assigneeId: params.assigneeId || undefined,
          customerId: params.customerId || undefined,
          q: params.q?.trim() || undefined,
          page: toApiPage(params.page),
          size: params.pageSize,
          sort: params.sort,
        },
      },
      signal,
    }),
  )
}

export function useTicketList(params: TicketListParams) {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ signal }) => fetchTicketList(params, signal),
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

/** Últimos `size` eventos de actividad de la organización, del más reciente al más antiguo. Solo personal. */
export function useRecentActivity(size: number) {
  return useQuery({
    queryKey: ticketKeys.recent(size),
    queryFn: ({ signal }) => unwrap(api.GET('/tickets/activity', { params: { query: { size } }, signal })),
  })
}

/** Lo que cambia un ticket (alta, estado, prioridad, responsable) y se refleja en el resumen y en el informe. */
export function invalidateOverview(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ticketKeys.feed() })
  void queryClient.invalidateQueries({ queryKey: reportKeys.all })
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
      invalidateOverview(queryClient)
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
    onSuccess: (_message, { visibility }) => {
      // Una nota interna no cambia nada visible fuera de la conversación.
      if (visibility === 'internal') {
        void queryClient.invalidateQueries({ queryKey: ticketKeys.messages(number) })
        return
      }
      // Una respuesta pública mueve la fecha de actualización y puede fijar la primera respuesta. El detalle es
      // prefijo de los mensajes: invalidarlos aparte los pediría dos veces.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(number) })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
      // La primera respuesta entra en el informe; no añade eventos al historial, así que el feed no cambia.
      void queryClient.invalidateQueries({ queryKey: reportKeys.all })
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
      invalidateOverview(queryClient)
    },
  })
}

/**
 * Cambio rápido desde la bandeja: el resumen no trae la versión, así que se lee el ticket actual y se aplica el
 * cambio con su If-Match. Si alguien lo cambió en medio, la API responde 412 y no se pisa nada.
 */
export function useQuickTicketUpdate() {
  const queryClient = useQueryClient()
  // La versión leída en el primer intento de cada llamada. Repetir la misma llamada tras un 503 de bloqueo no la lee de
  // nuevo: con una versión más reciente el reintento pisaría el cambio de quien guardó entretanto. Con la misma, el
  // servidor responde el 412 de siempre.
  const versions = useRef(new WeakMap<object, number>())
  return useMutation({
    mutationFn: async (variables: { number: number; changes: TicketChanges }) => {
      const { number, changes } = variables
      let version = versions.current.get(variables)
      if (version === undefined) {
        const current = await queryClient.fetchQuery({
          queryKey: ticketKeys.detail(number),
          queryFn: () => fetchTicket(queryClient, number),
          staleTime: 0,
        })
        await queryClient.cancelQueries({ queryKey: ticketKeys.detail(number), exact: true })
        version = current.version
        versions.current.set(variables, version)
      }
      return unwrap(
        api.PATCH('/tickets/{number}', {
          params: { path: { number }, header: { 'If-Match': `"${version}"` } },
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
      invalidateOverview(queryClient)
    },
  })
}
