import { roleValues, type Role } from '../api/schema'
import type { SidebarNavItem } from '../components/ui'

/** Entrada de la navegación principal: el elemento del menú más los roles que pueden abrir la sección. */
export interface NavigationItem extends SidebarNavItem {
  roles: Role[]
  /** Cómo se llama la sección para los clientes, si difiere del nombre del personal: la ven desde el otro lado. */
  customerLabel?: string
}

/** Roles del personal: acceden a todas las secciones. */
export const staff: Role[] = ['admin', 'agent']

/**
 * Secciones de la navegación principal, en el orden del diseño. Es la única fuente de qué roles ven cada sección:
 * `navigationFor` filtra el menú con ella y `router.tsx` protege cada ruta con los mismos roles.
 */
export const mainNavigation: NavigationItem[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true, roles: staff },
  { to: '/tickets', label: 'Tickets', customerLabel: 'Mis solicitudes', icon: 'ticket', roles: [...staff, 'customer'] },
  { to: '/clientes', label: 'Clientes', icon: 'clients', roles: staff },
  { to: '/equipo', label: 'Equipo', icon: 'team', roles: staff },
  { to: '/reportes', label: 'Reportes', icon: 'report', roles: staff },
  // Los clientes también la abren: el servidor solo les entrega artículos publicados y públicos.
  { to: '/conocimiento', label: 'Conocimiento', customerLabel: 'Ayuda', icon: 'book', roles: [...staff, 'customer'] },
  // Los clientes abren Perfil y Apariencia; Empresa y Permisos son del personal y los guarda cada pestaña.
  { to: '/configuracion', label: 'Configuración', icon: 'settings', roles: [...staff, 'customer'] },
]

export const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  customer: 'Cliente',
}

/**
 * Secciones visibles para cada rol, con el nombre que le corresponde: los clientes las ven como «Mis solicitudes» y
 * «Ayuda». Sin rol (mientras `/me` carga) devuelve solo las secciones comunes a todos los roles, con el nombre del
 * personal: es lo que ve el rol con menos permisos, así que ni un cliente ve parpadear entradas que no puede abrir ni
 * el personal ve desaparecer ninguna al llegar la sesión.
 */
export function navigationFor(role: Role | undefined): NavigationItem[] {
  if (!role) return mainNavigation.filter((item) => roleValues.every((value) => item.roles.includes(value)))
  return mainNavigation
    .filter((item) => item.roles.includes(role))
    .map((item) => (role === 'customer' && item.customerLabel ? { ...item, label: item.customerLabel } : item))
}
