import type { Role } from '../api/schema'
import type { SidebarNavItem } from '../components/ui'

/** Secciones de la navegación principal, en el orden del diseño. */
export const mainNavigation: SidebarNavItem[] = [
  { to: '/', label: 'Resumen', icon: 'home', end: true },
  { to: '/tickets', label: 'Tickets', icon: 'ticket' },
  { to: '/clientes', label: 'Clientes', icon: 'clients' },
  { to: '/equipo', label: 'Equipo', icon: 'team' },
  { to: '/reportes', label: 'Reportes', icon: 'report' },
  { to: '/conocimiento', label: 'Conocimiento', icon: 'book' },
  { to: '/configuracion', label: 'Configuración', icon: 'settings' },
]

export const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  customer: 'Cliente',
}

/** Secciones visibles para cada rol: los clientes solo acceden a sus tickets. */
export function navigationFor(role: Role | undefined): SidebarNavItem[] {
  if (role === 'customer') return mainNavigation.filter((item) => item.to === '/tickets')
  return mainNavigation
}
