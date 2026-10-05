import type { Role } from '../../api/schema'

/** Pestañas en el orden del diseño. `staff` marca las que solo ve el personal. */
export const settingsTabs = [
  { id: 'empresa', label: 'Empresa', staff: true },
  { id: 'perfil', label: 'Perfil', staff: false },
  { id: 'apariencia', label: 'Apariencia', staff: false },
  { id: 'permisos', label: 'Permisos', staff: true },
] as const

/** Pestañas que ve un rol. Sin el rol (`/me` cargando) son las del rol con menos permisos: nunca se enseña de más. */
export function visibleTabs(role: Role | undefined) {
  const isStaff = role === 'admin' || role === 'agent'
  return settingsTabs.filter((tab) => isStaff || !tab.staff)
}
