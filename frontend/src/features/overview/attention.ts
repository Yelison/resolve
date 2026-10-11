import type { AttentionItem, AttentionReasonKind, AttentionTicket } from '../../api/schema'
import type { AttentionScope } from '../tickets/queries'
import { daysText, elapsedText } from './overviewText'

/** Cuántos tickets muestra «Necesitan atención», y los que se piden al servidor. */
export const ATTENTION_LIMIT = 6

/**
 * Qué tickets necesitan atención, por qué y en qué orden lo decide el servidor (`GET /tickets/attention`): aquí solo se
 * escribe el motivo y se elige la acción de cada fila.
 */
export type AttentionAction = 'reply' | 'assign' | 'open'

/** Etiqueta corta del motivo, para la píldora. */
export const reasonLabels: Record<AttentionReasonKind, string> = {
  urgent: 'Urgente',
  unanswered: 'Sin respuesta',
  unassigned: 'Sin asignar',
  customer_replied: 'Respondió',
  high: 'Alta',
  waiting: 'Esperando',
}

const DAY = 24 * 3_600_000

/** El motivo con su plazo («Sin respuesta desde hace 3 h»), a partir de «desde cuándo» que da el servidor; vacío si la etiqueta ya lo dice todo. */
function reasonDetail({ kind, since }: AttentionItem['reason'], now: Date): string | undefined {
  const elapsed = now.getTime() - Date.parse(since)
  switch (kind) {
    case 'unanswered':
      return `Sin respuesta desde hace ${elapsedText(elapsed)}`
    case 'customer_replied':
      return `El cliente respondió hace ${elapsedText(elapsed)}`
    case 'waiting':
      return `Esperando al cliente ${daysText(Math.floor(elapsed / DAY))}`
    default:
      return undefined
  }
}

/**
 * «Responder» solo en lo que es tuyo y espera tu respuesta (urgente o sin respuesta); «Asignármelo» en lo que nadie
 * tiene; «Abrir» en el resto.
 */
function actionFor(ticket: AttentionTicket, kind: AttentionReasonKind, userId: string | undefined): AttentionAction {
  if (ticket.assignee === null) return 'assign'
  if ((kind === 'urgent' || kind === 'unanswered') && ticket.assignee.id === userId) return 'reply'
  return 'open'
}

export interface AttentionRow {
  /** Etiqueta corta del motivo, para la píldora. */
  label: string
  /** El motivo con su plazo; vacío si la etiqueta ya lo dice todo. */
  detail: string | undefined
  action: AttentionAction
}

/** Lo que muestra la fila de un ticket que necesita atención. */
export function describeAttention(item: AttentionItem, now: Date, userId: string | undefined): AttentionRow {
  const { ticket, reason } = item
  return {
    label: reasonLabels[reason.kind],
    detail: reasonDetail(reason, now),
    action: actionFor(ticket, reason.kind, userId),
  }
}

/** Dónde está esa misma lista en la bandeja: los abiertos del alcance, de más a menos prioritarios. */
export function inboxLink(scope: AttentionScope): string {
  return scope === 'mine' ? '/tickets?view=mine&sort=priority,desc' : '/tickets?sort=priority,desc'
}
