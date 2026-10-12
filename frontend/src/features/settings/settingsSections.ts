import type { Role } from '../../api/schema'

export type SettingsSectionId = 'empresa' | 'permisos' | 'general' | 'espacios'

export interface SettingsSectionInfo {
  id: SettingsSectionId
  label: string
  /** Una línea que dice para qué sirve la sección; la lista móvil la sustituye por el estado de «General». */
  description: string
  /** Solo la ve el personal (Empresa, Permisos y Tus espacios). */
  staff: boolean
}

interface SettingsGroup {
  id: string
  label: string
  sections: readonly SettingsSectionInfo[]
}

/** Los dos grupos de la navegación, en el orden del diseño. */
export const settingsGroups: readonly SettingsGroup[] = [
  {
    id: 'space',
    label: 'Espacio',
    sections: [
      { id: 'empresa', label: 'Empresa', description: 'Nombre, soporte y objetivos', staff: true },
      { id: 'permisos', label: 'Permisos', description: 'Qué puede hacer cada rol', staff: true },
    ],
  },
  {
    id: 'account',
    label: 'Tu cuenta',
    sections: [
      { id: 'general', label: 'General', description: 'Tu nombre, tu correo y el tema', staff: false },
      // Los clientes no la tienen: su acceso a un espacio lo gestiona la empresa que les da soporte.
      { id: 'espacios', label: 'Tus espacios', description: 'Dónde trabajas y tu rol en cada uno', staff: true },
    ],
  },
]

/** Todas las secciones, en el orden del diseño. */
export const settingsSections: readonly SettingsSectionInfo[] = settingsGroups.flatMap((group) => group.sections)

/** La sección con ese id, o `undefined` si la URL no es de una sección. */
export const findSection = (id: string | undefined) => settingsSections.find((section) => section.id === id)

/** Si el rol puede abrir las secciones del personal. Sin el rol (`/me` cargando) no: nunca se enseña de más. */
export const isStaffRole = (role: Role | undefined) => role === 'admin' || role === 'agent'

/** Los grupos con las secciones que ve un rol; un grupo sin secciones visibles no aparece. */
export function visibleGroups(role: Role | undefined) {
  const staff = isStaffRole(role)
  return settingsGroups
    .map((group) => ({
      id: group.id,
      label: group.label,
      sections: group.sections.filter((section) => staff || !section.staff),
    }))
    .filter((group) => group.sections.length > 0)
}

/** La primera sección del rol: Empresa para el personal, General para un cliente. */
export const defaultSection = (role: Role | undefined): SettingsSectionId => (isStaffRole(role) ? 'empresa' : 'general')
