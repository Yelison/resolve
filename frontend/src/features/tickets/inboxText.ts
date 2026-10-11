import { plural } from '../../lib/format'
import type { TicketStatus, TicketSummary } from '../../domain/ticket'
import type { TicketSort } from './inboxParams'

/** «1 ticket», «25 tickets». */
export function ticketCount(count: number): string {
  return plural(count, 'ticket', 'tickets')
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

/** Cómo se llama cada orden en el selector. */
export const sortLabels: Record<TicketSort, string> = {
  'updatedAt,desc': 'Actualización: más reciente',
  'updatedAt,asc': 'Actualización: más antigua',
  'createdAt,desc': 'Creación: más reciente',
  'createdAt,asc': 'Creación: más antigua',
  'number,desc': 'Número: mayor primero',
  'number,asc': 'Número: menor primero',
  'priority,desc': 'Prioridad: urgente primero',
  'priority,asc': 'Prioridad: baja primero',
  'status,asc': 'Estado: abiertos primero',
  'status,desc': 'Estado: resueltos primero',
}

/** El pie de la lista dice por qué orden va: «ordenados por actualización». */
export const sortFooters: Record<TicketSort, string> = {
  'updatedAt,desc': 'ordenados por actualización',
  'updatedAt,asc': 'ordenados por actualización, los más antiguos primero',
  'createdAt,desc': 'ordenados por creación',
  'createdAt,asc': 'ordenados por creación, los más antiguos primero',
  'number,desc': 'ordenados por número, de mayor a menor',
  'number,asc': 'ordenados por número, de menor a mayor',
  'priority,desc': 'ordenados por prioridad, los urgentes primero',
  'priority,asc': 'ordenados por prioridad, los de baja primero',
  'status,asc': 'ordenados por estado, los abiertos primero',
  'status,desc': 'ordenados por estado, los resueltos primero',
}

/** Los grupos por día (Hoy, Ayer…) solo tienen sentido si el orden es por la fecha de actualización, en cualquier sentido. */
export function groupsByDay(sort: TicketSort): boolean {
  return sort.startsWith('updatedAt,')
}
