import type { Role } from '../../api/schema'
import { mainNavigation } from '../../app/navigation'

export type SearchGroupId = 'tickets' | 'customers' | 'articles'

export interface SearchGroupDefinition {
  id: SearchGroupId
  /** Sección de la navegación a la que pertenece: sus roles son los que pueden buscar en el grupo. */
  section: string
  /** Nombre del grupo, con el que se titula la lista y se anuncian sus fallos. */
  label: string
  /** Texto de «Ver todos los resultados de …». */
  seeAll: string
}

/** Los grupos, en el orden en que se muestran. */
export const searchGroups: readonly SearchGroupDefinition[] = [
  { id: 'tickets', section: '/tickets', label: 'Tickets', seeAll: 'tickets' },
  { id: 'customers', section: '/clientes', label: 'Clientes', seeAll: 'clientes' },
  { id: 'articles', section: '/conocimiento', label: 'Artículos', seeAll: 'artículos' },
]

/**
 * Grupos en los que puede buscar un rol: los de las secciones que su navegación le deja abrir, la misma fuente que
 * usan el menú y las rutas. Sin rol (la sesión aún carga) se ofrece lo del rol con menos permisos, nunca todo.
 */
export function searchGroupsFor(role: Role | undefined): SearchGroupDefinition[] {
  const effective = role ?? 'customer'
  return searchGroups.filter((group) =>
    mainNavigation.find((item) => item.to === group.section)?.roles.includes(effective),
  )
}
