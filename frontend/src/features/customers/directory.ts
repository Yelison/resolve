import type { CustomerMetrics } from '../../domain/customer'
import { plural } from '../../lib/format'

/**
 * Resumen bajo el título, con los datos que antes daban las métricas: «3 clientes de 3 empresas · 2 con tickets
 * abiertos · 1 nuevo este mes». Cuenta los clientes activos de toda la organización, no los de la búsqueda.
 */
export function customersSummary({ total, companies, withOpenTickets, newThisMonth }: CustomerMetrics): string {
  if (total === 0) return 'Todavía no hay clientes activos.'
  const who =
    companies === 0
      ? `${plural(total, 'cliente', 'clientes')} sin empresa`
      : `${plural(total, 'cliente', 'clientes')} de ${plural(companies, 'empresa', 'empresas')}`
  return [
    who,
    withOpenTickets === 0 ? 'ninguno con tickets abiertos' : `${withOpenTickets} con tickets abiertos`,
    newThisMonth === 0 ? 'ninguno nuevo este mes' : `${plural(newThisMonth, 'nuevo', 'nuevos')} este mes`,
  ].join(' · ')
}

/** Resumen de una empresa: «2 clientes · 3 tickets abiertos»; sin el segundo dato (`undefined`) solo cuenta los clientes. */
export function groupSummary(customerCount: number, openTickets?: number): string {
  const clients = plural(customerCount, 'cliente', 'clientes')
  if (openTickets === undefined) return clients
  return `${clients} · ${openTickets === 0 ? 'sin tickets abiertos' : plural(openTickets, 'ticket abierto', 'tickets abiertos')}`
}

/** Texto del enlace que abre una empresa entera: «Ver los 14 clientes de Lumen Diseño» o «Ver los 9 clientes sin empresa». */
export function viewAllLabel(customerCount: number, company: string | null): string {
  return company === null
    ? `Ver los ${customerCount} clientes sin empresa`
    : `Ver los ${customerCount} clientes de ${company}`
}

/** Etiqueta de la fila: «2 abiertos», «1 abierto», «Sin abiertos». */
export function openTicketsLabel(openTickets: number): string {
  if (openTickets === 0) return 'Sin abiertos'
  return plural(openTickets, 'abierto', 'abiertos')
}

/** Iniciales de una empresa para su marca: dos palabras dan sus dos primeras letras («Lumen Diseño» → LD), una da dos («Northstar» → NO). */
export function companyMark(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2)
  return letters.toUpperCase()
}
