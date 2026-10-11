import type { TicketSummary } from '../../domain/ticket'
import { daysText, elapsedText } from './overviewText'

/** Cuántos tickets muestra «Necesitan atención». */
export const ATTENTION_LIMIT = 6

/** Cuántos se piden para elegirlos: el máximo de una página de la API. Es el tope de lo que se puede ordenar. */
export const ATTENTION_CANDIDATES = 100

/**
 * Por qué un ticket necesita atención, de más a menos urgente: el orden de esta lista es el de la lista de Inicio.
 * Cada ticket tiene a lo sumo uno, el primero que cumple.
 */
export type AttentionReason = 'urgent' | 'unanswered' | 'unassigned' | 'customerReplied' | 'high' | 'waiting'

export type AttentionAction = 'reply' | 'assign' | 'open'

export interface AttentionItem {
  ticket: TicketSummary
  reason: AttentionReason
  /** Etiqueta corta del motivo, para la píldora. */
  label: string
  /** El motivo con su plazo («Sin respuesta desde hace 3 h»); vacío si la etiqueta ya lo dice todo. */
  detail?: string
  action: AttentionAction
}

const REASONS: AttentionReason[] = ['urgent', 'unanswered', 'unassigned', 'customerReplied', 'high', 'waiting']

export const reasonLabels: Record<AttentionReason, string> = {
  urgent: 'Urgente',
  unanswered: 'Sin respuesta',
  unassigned: 'Sin asignar',
  customerReplied: 'Respondió',
  high: 'Alta',
  waiting: 'Esperando',
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Un ticket nuevo cuenta como «sin respuesta» a partir de 1 h; antes es lo normal. */
const UNANSWERED_AFTER = HOUR

/** Esperar al cliente solo es motivo cuando lleva al menos un día. */
const WAITING_AFTER = DAY

/** Si el último mensaje público lo escribió el cliente. `LastMessage` no dice el autor: se compara el nombre. */
function customerSpokeLast(ticket: TicketSummary): boolean {
  const message = ticket.lastMessage
  return message !== null && !message.internal && message.authorName === ticket.customer.name
}

interface Classified {
  reason: AttentionReason
  detail?: string
  /** Desde cuándo está así, en milisegundos: dentro de un motivo, el que más espera va primero. */
  since: number
}

function classify(ticket: TicketSummary, now: number): Classified | undefined {
  if (ticket.status === 'resolved') return undefined
  const created = Date.parse(ticket.createdAt)
  const lastMessageAt = ticket.lastMessage ? Date.parse(ticket.lastMessage.createdAt) : undefined
  const customerLast = customerSpokeLast(ticket)

  if (ticket.priority === 'urgent') return { reason: 'urgent', since: created }

  // Un ticket nuevo (`open`) cuyo último mensaje es del cliente, o que no tiene ninguno, aún no recibió respuesta.
  if (ticket.status === 'open' && (ticket.lastMessage === null || customerLast)) {
    const since = lastMessageAt ?? created
    if (now - since >= UNANSWERED_AFTER) {
      return { reason: 'unanswered', detail: `Sin respuesta desde hace ${elapsedText(now - since)}`, since }
    }
  }

  if (ticket.assignee === null) return { reason: 'unassigned', since: created }

  if (customerLast && ticket.lastMessage) {
    const since = lastMessageAt ?? created
    return { reason: 'customerReplied', detail: `El cliente respondió hace ${elapsedText(now - since)}`, since }
  }

  if (ticket.priority === 'high') return { reason: 'high', since: created }

  if (ticket.status === 'waiting') {
    const since = Date.parse(ticket.updatedAt)
    if (now - since >= WAITING_AFTER) {
      return {
        reason: 'waiting',
        detail: `Esperando al cliente ${daysText(Math.floor((now - since) / DAY))}`,
        since,
      }
    }
  }
  return undefined
}

/**
 * «Responder» solo en lo que es tuyo y espera tu respuesta (urgente o sin respuesta); «Asignármelo» en lo que nadie
 * tiene; «Abrir» en el resto.
 */
function actionFor(ticket: TicketSummary, reason: AttentionReason, userId: string | undefined): AttentionAction {
  if (ticket.assignee === null) return 'assign'
  if ((reason === 'urgent' || reason === 'unanswered') && ticket.assignee.id === userId) return 'reply'
  return 'open'
}

export interface Attention {
  /** Los más urgentes, ya ordenados y recortados a `limit`. */
  items: AttentionItem[]
  /** Cuántos de los tickets recibidos tienen algún motivo. */
  withReason: number
}

/**
 * Elige y ordena los tickets que necesitan atención entre los recibidos (los abiertos de un alcance). Se ordenan por
 * motivo y, dentro de cada uno, el que lleva más tiempo así primero. Los que no tienen motivo (en curso, con la
 * pelota en el tejado del cliente hace poco…) no se muestran.
 */
export function selectAttention(
  tickets: readonly TicketSummary[],
  now: Date,
  userId: string | undefined,
  limit = ATTENTION_LIMIT,
): Attention {
  const classified = tickets.flatMap((ticket) => {
    const result = classify(ticket, now.getTime())
    return result ? [{ ticket, ...result }] : []
  })
  classified.sort(
    (a, b) =>
      REASONS.indexOf(a.reason) - REASONS.indexOf(b.reason) || a.since - b.since || b.ticket.number - a.ticket.number,
  )
  return {
    withReason: classified.length,
    items: classified.slice(0, limit).map(({ ticket, reason, detail }) => ({
      ticket,
      reason,
      label: reasonLabels[reason],
      detail,
      action: actionFor(ticket, reason, userId),
    })),
  }
}
