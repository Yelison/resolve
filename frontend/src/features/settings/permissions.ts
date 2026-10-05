import type { Role } from '../../api/schema'

/**
 * Lo que un rol puede hacer con una capacidad. `own` y `limited` son accesos parciales: el servidor entrega solo lo
 * propio (tickets de la persona) o solo lo publicado (artículos); el texto de cada valor lo dice, el icono no basta.
 */
export type Access = 'allowed' | 'own' | 'limited' | 'no'

export interface Capability {
  /** Identificador estable; la prueba de la tabla de verdad se apoya en él. */
  key: string
  /** Sección de la matriz: en móvil las capacidades se agrupan por ella. */
  section: string
  label: string
  /** Matiz que no cabe en la etiqueta (p. ej. qué significa «Solo los suyos» para esa capacidad). */
  note?: string
  access: Record<Role, Access>
}

/** Texto visible de cada valor; también es el nombre accesible de la celda. */
export const accessLabels: Record<Access, string> = {
  allowed: 'Permitido',
  own: 'Solo los suyos',
  limited: 'Limitado',
  no: 'Sin acceso',
}

/** Roles en el orden de las columnas de la matriz. */
export const matrixRoles: Role[] = ['admin', 'agent', 'customer']

const access = (admin: Access, agent: Access, customer: Access): Record<Role, Access> => ({ admin, agent, customer })

/**
 * Resumen de «Seguridad y permisos por endpoint» (§3.7 del plan): lo que el servidor impone en `SecurityConfiguration`.
 * La matriz es informativa; el servidor es quien decide. Cada fila agrupa los endpoints que comparten reglas.
 */
export const capabilities: Capability[] = [
  {
    key: 'tickets.read',
    section: 'Tickets',
    label: 'Ver tickets y sus mensajes',
    note: 'Un cliente solo ve sus tickets y las respuestas públicas.',
    access: access('allowed', 'allowed', 'own'),
  },
  {
    key: 'tickets.write',
    section: 'Tickets',
    label: 'Crear tickets, cambiarlos y responder',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'tickets.insights',
    section: 'Tickets',
    label: 'Ver la actividad y las métricas de tickets',
    note: 'Incluye el historial de cada ticket.',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'customers.manage',
    section: 'Clientes',
    label: 'Ver, crear y editar clientes',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'customers.access',
    section: 'Clientes',
    label: 'Archivar, restaurar e invitar al portal',
    access: access('allowed', 'no', 'no'),
  },
  {
    key: 'team.read',
    section: 'Equipo',
    label: 'Ver el equipo y sus métricas',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'team.manage',
    section: 'Equipo',
    label: 'Invitar, cambiar el rol y retirar miembros',
    access: access('allowed', 'no', 'no'),
  },
  {
    key: 'reports.read',
    section: 'Reportes',
    label: 'Ver los reportes',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'knowledge.read',
    section: 'Conocimiento',
    label: 'Leer artículos',
    note: 'Un cliente solo ve los artículos publicados y públicos.',
    access: access('allowed', 'allowed', 'limited'),
  },
  {
    key: 'knowledge.write',
    section: 'Conocimiento',
    label: 'Crear, editar y publicar artículos',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'knowledge.categories',
    section: 'Conocimiento',
    label: 'Crear categorías',
    access: access('allowed', 'no', 'no'),
  },
  {
    key: 'settings.read',
    section: 'Configuración',
    label: 'Ver los ajustes de la empresa',
    access: access('allowed', 'allowed', 'no'),
  },
  {
    key: 'settings.write',
    section: 'Configuración',
    label: 'Modificar los ajustes de la empresa',
    access: access('allowed', 'no', 'no'),
  },
  {
    key: 'settings.profile',
    section: 'Configuración',
    label: 'Cambiar tu propio nombre',
    access: access('allowed', 'allowed', 'allowed'),
  },
]

export interface CapabilitySection {
  name: string
  capabilities: Capability[]
}

/** Las capacidades agrupadas por sección, en el orden de la lista. */
export function groupBySection(list: Capability[] = capabilities): CapabilitySection[] {
  const sections: CapabilitySection[] = []
  for (const capability of list) {
    const section = sections.find((candidate) => candidate.name === capability.section)
    if (section) section.capabilities.push(capability)
    else sections.push({ name: capability.section, capabilities: [capability] })
  }
  return sections
}
