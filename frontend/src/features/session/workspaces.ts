import type { Me, OrganizationRef } from '../../api/schema'
import { roleLabels } from '../../app/navigation'

/** Un espacio de la persona: el de la sesión y los demás donde tiene un acceso utilizable. */
export interface Workspace extends OrganizationRef {
  /** Si es el espacio de la sesión. */
  current: boolean
}

/**
 * Los espacios de la persona, con el actual marcado. `Me.organizations` es opcional en el contrato (el servidor siempre
 * la envía): sin ella solo se conoce el espacio de la sesión, con el rol de la sesión.
 */
export function workspacesOf(me: Me): Workspace[] {
  const listed = me.organizations ?? []
  const refs: OrganizationRef[] = listed.some((ref) => ref.id === me.organization.id)
    ? listed
    : [{ id: me.organization.id, name: me.organization.name, role: me.role, memberCount: null }, ...listed]
  return refs.map((ref) => ({ ...ref, current: ref.id === me.organization.id }))
}

/** Tu rol en un espacio, con las palabras de la interfaz. */
export const workspaceRoleLabel = (workspace: Pick<OrganizationRef, 'role'>) => roleLabels[workspace.role]

/**
 * Subtítulo de la tarjeta del sidebar: tu rol en el espacio actual; a un cliente se le dice «Soporte», que es lo que
 * recibe de ese espacio.
 */
export const workspaceCardRole = (role: Me['role']) => (role === 'customer' ? 'Soporte' : roleLabels[role])

/** Si «Salir» no está disponible porque es el único espacio de la persona. */
export const isOnlyWorkspace = (workspaces: readonly Workspace[]) => workspaces.length <= 1

/** Un cliente no sale de un espacio por su cuenta: su acceso lo gestiona la empresa que le da soporte. */
export const canLeave = (workspace: Pick<OrganizationRef, 'role'>) => workspace.role !== 'customer'

/** El texto de «Salir» deshabilitado cuando es el único espacio. */
export const ONLY_WORKSPACE_TEXT = 'Es tu único espacio'
