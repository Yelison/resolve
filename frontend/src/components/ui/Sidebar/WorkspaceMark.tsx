import { cx } from '../../../lib/cx'
import { initialsOf } from '../Avatar/initials'
import styles from './WorkspaceMark.module.css'

export type WorkspaceMarkSize = 'small' | 'medium' | 'large' | 'touch'

/** Las claves de color de un espacio: las mismas que `OrganizationColor` del contrato. */
export type WorkspaceColor = 'blue' | 'green' | 'magenta' | 'orange' | 'violet' | 'teal' | 'brick' | 'slate'

export interface WorkspaceMarkProps {
  /** Nombre del espacio; de él salen las iniciales. */
  name: string
  /** Color del espacio. Sin él (la sesión aún carga o son datos antiguos) el cuadro usa el fondo neutro del sidebar. */
  color?: WorkspaceColor
  /** `small` 28 px (filas del selector), `medium` 32 px (tarjeta del sidebar), `large` 40 px (lista) y `touch` 44 px (sidebar colapsado). */
  size?: WorkspaceMarkSize
  className?: string
}

/**
 * Cuadro con las iniciales de un espacio, pintado con el token de su color (claro u oscuro según el tema). Es
 * decorativo: el color nunca va solo, el nombre siempre va al lado o en el nombre accesible del control que lo contiene.
 */
export function WorkspaceMark({ name, color, size = 'medium', className }: WorkspaceMarkProps) {
  return (
    <span aria-hidden="true" data-color={color} className={cx(styles.mark, styles[size], className)}>
      {initialsOf(name)}
    </span>
  )
}
