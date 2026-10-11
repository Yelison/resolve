import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { openStatusValues } from '../tickets/inboxParams'
import { fetchTicketList, ticketKeys, type TicketListParams } from '../tickets/queries'
import { ATTENTION_CANDIDATES } from './attention'

/** Los tickets de los que se eligen los que necesitan atención. */
export type AttentionScope = 'mine' | 'team'

/**
 * Los candidatos de un alcance: los abiertos asignados a ti, o todos los abiertos, de más a menos prioritarios. Es la
 * misma lista que abre «Ver los N en la bandeja»: `view=mine` y `view=all` con los estados abiertos.
 */
export function attentionParams(scope: AttentionScope): TicketListParams {
  return {
    view: scope === 'mine' ? 'mine' : 'all',
    status: scope === 'mine' ? [] : [...openStatusValues],
    priority: [],
    page: 1,
    pageSize: ATTENTION_CANDIDATES,
    // Por rango, no alfabético: `desc` deja primero a los urgentes.
    sort: 'priority,desc',
  }
}

/** Dónde está esa misma lista en la bandeja. */
export function inboxLink(scope: AttentionScope): string {
  return scope === 'mine' ? '/tickets?view=mine&sort=priority,desc' : '/tickets?sort=priority,desc'
}

/**
 * Pide los candidatos del alcance. Sin alcance (aún se decide cuál mostrar) no pide nada. Al cambiar de alcance conserva
 * la lista anterior hasta que llega la nueva, para que lo de debajo no salte.
 */
export function useAttentionTickets(scope: AttentionScope | undefined) {
  const params = attentionParams(scope ?? 'team')
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ signal }) => fetchTicketList(params, signal),
    enabled: scope !== undefined,
    placeholderData: keepPreviousData,
  })
}
