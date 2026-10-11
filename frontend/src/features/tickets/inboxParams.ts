import type { TicketPriority, TicketStatus, TicketView } from '../../domain/ticket'
import type { InboxListParams } from './queries'
import { ticketPriorityValues, ticketStatusValues, ticketViewValues } from '../../domain/ticket'

/** Estado de la bandeja que vive en la URL, para poder compartirla y recargarla sin perder filtros ni selección. */
export interface InboxState {
  view: TicketView
  status?: TicketStatus
  priority?: TicketPriority
  /** Id de un miembro o `none`. */
  assignee?: string
  q: string
  /** Número del ticket abierto en la vista previa. */
  ticket?: number
}

const DEFAULT_STATE: InboxState = { view: 'all', q: '' }

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((candidate) => candidate === value)
}

/** Un número de ticket positivo, o `undefined` si el valor no lo es. */
function ticketNumber(value: string | null): number | undefined {
  const number = Number(value)
  return value !== null && /^\d+$/.test(value) && Number.isSafeInteger(number) && number > 0 ? number : undefined
}

/** Un `page` o un `sort` de enlaces antiguos se ignoran: la lista carga de 25 en 25 y siempre va por actualización. */
export function readInboxState(params: URLSearchParams): InboxState {
  return {
    view: oneOf(ticketViewValues, params.get('view')) ?? DEFAULT_STATE.view,
    status: oneOf(ticketStatusValues, params.get('status')),
    priority: oneOf(ticketPriorityValues, params.get('priority')),
    assignee: params.get('assignee') || undefined,
    q: params.get('q') ?? '',
    ticket: ticketNumber(params.get('ticket')),
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
  if (state.ticket) params.set('ticket', String(state.ticket))
  return params
}

export function hasActiveFilters(state: InboxState): boolean {
  return Boolean(state.status || state.priority || state.assignee || state.q.trim())
}

/** Los estados que cuentan como «abiertos»: la vista por defecto los pide uno a uno porque la API incluye los resueltos. */
export const openStatusValues: readonly TicketStatus[] = ['open', 'in_progress', 'waiting']

/**
 * El estado tal como se aplica: un cliente no tiene vistas de equipo, ni responsable, ni prioridad, y un estado
 * «resuelto» solo tiene sentido en la vista de resueltos (en las demás se ignora en lugar de vaciar la lista).
 */
export function effectiveInboxState(state: InboxState, isStaff: boolean): InboxState {
  if (!isStaff) {
    return {
      ...state,
      view: state.view === 'resolved' ? 'resolved' : 'all',
      status: undefined,
      priority: undefined,
      assignee: undefined,
    }
  }
  const dropStatus = state.view === 'resolved' || state.status === 'resolved'
  return dropStatus ? { ...state, status: undefined } : state
}

/** La consulta de la bandeja para un estado ya efectivo; «Abiertos» (`all`) excluye los resueltos. */
export function inboxListParams(state: InboxState): InboxListParams {
  return {
    view: state.view,
    status: state.status ? [state.status] : state.view === 'all' ? [...openStatusValues] : [],
    priority: state.priority ? [state.priority] : [],
    assigneeId: state.assignee,
    q: state.q,
  }
}
