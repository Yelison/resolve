import type { TicketPriority, TicketStatus, TicketView } from '../../domain/ticket'
import { ticketPriorityValues, ticketStatusValues, ticketViewValues } from '../../domain/ticket'

export const ticketSortFields = ['updatedAt', 'createdAt', 'number', 'priority', 'status'] as const
export type TicketSort = `${(typeof ticketSortFields)[number]},${'asc' | 'desc'}`
export const ticketSortValues: readonly TicketSort[] = ticketSortFields.flatMap((field) => [
  `${field},asc` as const,
  `${field},desc` as const,
])

/** Estado de la bandeja que vive en la URL, para poder compartirla y recargarla sin perder filtros. */
export interface InboxState {
  view: TicketView
  status?: TicketStatus
  priority?: TicketPriority
  /** Id de un miembro o `none`. */
  assignee?: string
  q: string
  /** Página de la interfaz, desde 1. */
  page: number
  sort: TicketSort
}

const DEFAULT_STATE: InboxState = { view: 'all', q: '', page: 1, sort: 'updatedAt,desc' }

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((candidate) => candidate === value)
}

export function readInboxState(params: URLSearchParams): InboxState {
  const page = Number.parseInt(params.get('page') ?? '', 10)
  return {
    view: oneOf(ticketViewValues, params.get('view')) ?? DEFAULT_STATE.view,
    status: oneOf(ticketStatusValues, params.get('status')),
    priority: oneOf(ticketPriorityValues, params.get('priority')),
    assignee: params.get('assignee') || undefined,
    q: params.get('q') ?? '',
    sort: oneOf(ticketSortValues, params.get('sort')) ?? DEFAULT_STATE.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Solo escribe lo que difiere del estado por defecto, para URLs cortas. */
export function writeInboxState(state: InboxState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.view !== DEFAULT_STATE.view) params.set('view', state.view)
  if (state.status) params.set('status', state.status)
  if (state.priority) params.set('priority', state.priority)
  if (state.assignee) params.set('assignee', state.assignee)
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

export function hasActiveFilters(state: InboxState): boolean {
  return Boolean(state.status || state.priority || state.assignee || state.q.trim())
}
