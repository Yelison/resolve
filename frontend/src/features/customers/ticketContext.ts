import type { CustomerDetail } from '../../domain/customer'

/** Pluraliza «N tickets · N abierto(s) · N resuelto(s)» concordando el número. */
export function ticketContext({ totalTickets, openTickets }: Pick<CustomerDetail, 'totalTickets' | 'openTickets'>) {
  const resolved = Math.max(totalTickets - openTickets, 0)
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return [
    plural(totalTickets, 'ticket', 'tickets'),
    plural(openTickets, 'abierto', 'abiertos'),
    plural(resolved, 'resuelto', 'resueltos'),
  ].join(' · ')
}
