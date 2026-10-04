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

/**
 * Sesión de demostración. No hay autenticación todavía: cuando exista, estos datos
 * vendrán de la API y no de una constante.
 */
export const demoSession = {
  workspace: 'Acme Studio',
  user: { name: 'Yelisson Ortiz', role: 'Administrador' },
}
