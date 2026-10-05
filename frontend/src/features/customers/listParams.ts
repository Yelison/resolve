export type CustomerSort = `${'name' | 'createdAt' | 'openTickets'},${'asc' | 'desc'}`

/** Órdenes admitidos, en el orden en que se muestran: el de por defecto primero y, por campo, el más útil antes. */
export const customerSortValues: readonly CustomerSort[] = [
  'name,asc',
  'name,desc',
  'createdAt,desc',
  'createdAt,asc',
  'openTickets,desc',
  'openTickets,asc',
]

/** Estado de la lista que vive en la URL, para poder compartirla y recargarla sin perder filtros. */
export interface CustomerListState {
  q: string
  /** Nombre exacto de la empresa. */
  company?: string
  /** `true` lista solo los clientes archivados. */
  archived: boolean
  sort: CustomerSort
  /** Página de la interfaz, desde 1. */
  page: number
}

const DEFAULT_STATE: CustomerListState = { q: '', archived: false, sort: 'name,asc', page: 1 }

export function readCustomerListState(params: URLSearchParams): CustomerListState {
  const page = Number.parseInt(params.get('page') ?? '', 10)
  return {
    q: params.get('q') ?? '',
    company: params.get('company') || undefined,
    archived: params.get('archived') === 'true',
    sort: customerSortValues.find((sort) => sort === params.get('sort')) ?? DEFAULT_STATE.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Solo escribe lo que difiere del estado por defecto, para URLs cortas. */
export function writeCustomerListState(state: CustomerListState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.company) params.set('company', state.company)
  if (state.archived) params.set('archived', 'true')
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

/** Filtros que el usuario puede quitar con «Limpiar filtros»; el orden no cuenta. */
export function hasActiveCustomerFilters(state: CustomerListState): boolean {
  return Boolean(state.q.trim() || state.company || state.archived)
}
