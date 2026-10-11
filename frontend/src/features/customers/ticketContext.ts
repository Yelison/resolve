import type { CustomerDetail } from '../../domain/customer'
import { plural } from '../../lib/format'

/** Pluraliza «N tickets · N abierto(s) · N resuelto(s)» concordando el número. */
export function ticketContext({ totalTickets, openTickets }: Pick<CustomerDetail, 'totalTickets' | 'openTickets'>) {
  const resolved = Math.max(totalTickets - openTickets, 0)
  return [
    plural(totalTickets, 'ticket', 'tickets'),
    plural(openTickets, 'abierto', 'abiertos'),
    plural(resolved, 'resuelto', 'resueltos'),
  ].join(' · ')
}
