import type { TicketStatus, TicketSummary } from '../../domain/ticket'

/** «1 ticket», «25 tickets». */
export function ticketCount(count: number): string {
  return count === 1 ? '1 ticket' : `${count} tickets`
}

/** «Mostrando 25 de 132», sin plural que concordar: el total va después de «de». */
export function showingCount(shown: number, total: number): string {
  return `Mostrando ${shown} de ${total}`
}

/** Estados con el género y la voz de quien hizo la solicitud: es «su» solicitud, y «esperando» es «tu respuesta». */
export const customerStatusLabels: Record<TicketStatus, string> = {
  open: 'Abierta',
  in_progress: 'En progreso',
  waiting: 'Esperando tu respuesta',
  resolved: 'Resuelta',
}

/** Nombre de pila: lo que se escribe en «Te atiende Laura». */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** Quién escribió el último mensaje, como lo lee un cliente: «Tú» o el nombre de pila del agente. */
export function lastMessageAuthor(ticket: TicketSummary): string | undefined {
  const message = ticket.lastMessage
  if (!message) return undefined
  return message.authorName === ticket.customer.name ? 'Tú' : firstName(message.authorName)
}
