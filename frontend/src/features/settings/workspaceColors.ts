import type { OrganizationColor } from '../../api/schema'

/** Los colores de un espacio, en el orden del contrato, con el nombre que ve la persona. Nunca se muestra la clave. */
export const workspaceColors: readonly { key: OrganizationColor; label: string }[] = [
  { key: 'blue', label: 'Azul' },
  { key: 'green', label: 'Verde' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'orange', label: 'Naranja' },
  { key: 'violet', label: 'Violeta' },
  { key: 'teal', label: 'Turquesa' },
  { key: 'brick', label: 'Teja' },
  { key: 'slate', label: 'Pizarra' },
]

export const workspaceColorLabel = (key: string) => workspaceColors.find((color) => color.key === key)?.label ?? ''
