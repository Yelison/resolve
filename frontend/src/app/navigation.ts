import type { Role } from '../api/schema'
import type { SidebarNavItem } from '../components/ui'

/** Entrada de la navegación principal: el elemento del menú más los roles que pueden abrir la sección. */
export interface NavigationItem extends SidebarNavItem {
  roles: Role[]
}

/** Roles del personal: acceden a todas las secciones. */
export const staff: Role[] = ['admin', 'agent']

/**
 * Secciones de la navegación principal, en el orden del diseño. Es la única fuente de qué roles ven cada sección:
 * `navigationFor` filtra el menú con ella y `router.tsx` protege cada ruta con los mismos roles.
 */
export const mainNavigation: NavigationItem[] = [
  { to: '/', label: 'Resumen', icon: 'home', end: true, roles: staff },
  { to: '/tickets', label: 'Tickets', icon: 'ticket', roles: [...staff, 'customer'] },
  { to: '/clientes', label: 'Clientes', icon: 'clients', roles: staff },
  { to: '/equipo', label: 'Equipo', icon: 'team', roles: staff },
  { to: '/reportes', label: 'Reportes', icon: 'report', roles: staff },
  // Solo personal por ahora; la Fase 5 la abrirá a los clientes cuando haya artículos publicados.
  { to: '/conocimiento', label: 'Conocimiento', icon: 'book', roles: staff },
  { to: '/configuracion', label: 'Configuración', icon: 'settings', roles: staff },
]

export const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  customer: 'Cliente',
}

/** Secciones visibles para cada rol: los clientes solo acceden a sus tickets. */
export function navigationFor(role: Role | undefined): NavigationItem[] {
  if (!role) return mainNavigation
  return mainNavigation.filter((item) => item.roles.includes(role))
}
