import type { MemberStatus, TeamMember, TeamRole } from '../../domain/member'

/** Miembros por página de la lista. */
export const TEAM_PAGE_SIZE = 10

/** Estados que se pueden filtrar; sin filtro se muestran los actuales (activos e invitados), no los retirados. */
export type TeamStatusFilter = MemberStatus

/** Estado de la página que vive en la URL: se puede compartir, recargar y deshacer quitando el filtro. */
export interface TeamPageState {
  q: string
  role?: TeamRole
  status?: TeamStatusFilter
  /** Página de la lista de miembros, desde 1. */
  page: number
  /** `true` despliega «Carga ahora» a todas las personas. */
  allLoad: boolean
  /** `true` muestra «Carga ahora» como tabla en lugar de barras. */
  loadTable: boolean
}

const roleParams: Record<string, TeamRole> = { agente: 'agent', administrador: 'admin' }
const statusParams: Record<string, TeamStatusFilter> = { activos: 'active', invitados: 'invited', retirados: 'removed' }
const LOAD_ALL_VALUE = 'todas'
const LOAD_TABLE_VALUE = 'tabla'

function paramOf<T>(table: Record<string, T>, value: T): string {
  return Object.keys(table).find((key) => table[key] === value)!
}

export function readTeamState(params: URLSearchParams): TeamPageState {
  const page = Number.parseInt(params.get('pagina') ?? '', 10)
  return {
    q: params.get('q') ?? '',
    role: roleParams[params.get('rol') ?? ''],
    status: statusParams[params.get('estado') ?? ''],
    page: Number.isInteger(page) && page > 0 ? page : 1,
    allLoad: params.get('carga') === LOAD_ALL_VALUE,
    loadTable: params.get('vista') === LOAD_TABLE_VALUE,
  }
}

/** Solo escribe lo que difiere del estado por defecto, para URLs cortas. */
export function writeTeamState(state: TeamPageState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.role) params.set('rol', paramOf(roleParams, state.role))
  if (state.status) params.set('estado', paramOf(statusParams, state.status))
  if (state.page > 1) params.set('pagina', String(state.page))
  if (state.allLoad) params.set('carga', LOAD_ALL_VALUE)
  if (state.loadTable) params.set('vista', LOAD_TABLE_VALUE)
  return params
}

/** Filtros de la lista que «Quitar filtros» deshace; la carga desplegada, su vista y la página no cuentan. */
export function hasActiveTeamFilters(state: TeamPageState): boolean {
  return Boolean(state.q.trim() || state.role || state.status)
}

/** Minúsculas y sin tildes: «maria» encuentra a «María». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Miembros que cumplen búsqueda, rol y estado; sin estado se excluye a los retirados. */
export function filterMembers(members: readonly TeamMember[], state: TeamPageState): TeamMember[] {
  const needle = fold(state.q.trim())
  return members.filter((member) => {
    if (state.status ? member.status !== state.status : member.status === 'removed') return false
    if (state.role && member.role !== state.role) return false
    return needle === '' || fold(member.name).includes(needle) || fold(member.email).includes(needle)
  })
}

/** Número de páginas de `total` miembros; al menos una. */
export function teamPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TEAM_PAGE_SIZE))
}
