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

/** Cómo se presenta la página de clientes: una tarjeta por empresa o una sola lista. No cambia lo que pide a la API. */
export type CustomerGrouping = 'company' | 'none'

/** Estado de la lista que vive en la URL, para poder compartirla y recargarla sin perder filtros. */
export interface CustomerListState {
  q: string
  /** Nombre exacto de la empresa. */
  company?: string
  /** Solo los clientes sin empresa; no se combina con `company`. */
  withoutCompany: boolean
  /** `true` lista solo los clientes archivados. */
  archived: boolean
  sort: CustomerSort
  /** Página de la interfaz, desde 1. */
  page: number
  /** Agrupación de la página en pantalla; no es un filtro ni cambia la consulta. */
  group: CustomerGrouping
}

const DEFAULT_STATE: CustomerListState = {
  q: '',
  withoutCompany: false,
  archived: false,
  sort: 'name,asc',
  page: 1,
  group: 'company',
}

export function readCustomerListState(params: URLSearchParams): CustomerListState {
  const page = Number.parseInt(params.get('page') ?? '', 10)
  const company = params.get('company') || undefined
  return {
    q: params.get('q') ?? '',
    company,
    // Una empresa concreta gana: no hay clientes «de Acme y sin empresa».
    withoutCompany: !company && params.get('withoutCompany') === 'true',
    archived: params.get('archived') === 'true',
    sort: customerSortValues.find((sort) => sort === params.get('sort')) ?? DEFAULT_STATE.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    group: params.get('group') === 'none' ? 'none' : DEFAULT_STATE.group,
  }
}

/** Solo escribe lo que difiere del estado por defecto, para URLs cortas. */
export function writeCustomerListState(state: CustomerListState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.company) params.set('company', state.company)
  else if (state.withoutCompany) params.set('withoutCompany', 'true')
  if (state.archived) params.set('archived', 'true')
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.group !== DEFAULT_STATE.group) params.set('group', state.group)
  return params
}

/** Filtros que el usuario puede quitar con «Limpiar filtros»; ni el orden ni la agrupación cuentan. */
export function hasActiveCustomerFilters(state: CustomerListState): boolean {
  return Boolean(state.q.trim() || state.company || state.withoutCompany || state.archived)
}

/** La lista es la de una sola empresa (o la de quienes no tienen): se pide plana, con todos sus clientes. */
export function isCompanyView(state: CustomerListState): boolean {
  return Boolean(state.company) || state.withoutCompany
}

/** La misma lista sin el filtro de empresa y desde la primera página: el «Volver a todas las empresas». */
export function withoutCompanyFilter(state: CustomerListState): CustomerListState {
  return { ...state, company: undefined, withoutCompany: false, page: 1 }
}

/** La lista de una empresa concreta (`null` es la de los clientes sin empresa), desde la primera página. */
export function forCompany(state: CustomerListState, company: string | null): CustomerListState {
  return company === null
    ? { ...state, company: undefined, withoutCompany: true, page: 1 }
    : { ...state, company, withoutCompany: false, page: 1 }
}
