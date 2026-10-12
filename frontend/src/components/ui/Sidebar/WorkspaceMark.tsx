import { cx } from '../../../lib/cx'
import { initialsOf } from '../Avatar/initials'
import styles from './WorkspaceMark.module.css'

export type WorkspaceMarkSize = 'small' | 'medium' | 'large' | 'touch'

export interface WorkspaceMarkProps {
  /** Nombre del espacio; de él salen las iniciales. */
  name: string
  /** `small` 28 px (filas del selector), `medium` 32 px (tarjeta del sidebar), `large` 40 px (lista) y `touch` 44 px (sidebar colapsado). */
  size?: WorkspaceMarkSize
  className?: string
}

/**
 * Cuadro con las iniciales de un espacio. Es decorativo: el nombre siempre va al lado o en el nombre accesible del
 * control que lo contiene. Hasta que el espacio tenga color propio usa el fondo neutro del sidebar.
 */
export function WorkspaceMark({ name, size = 'medium', className }: WorkspaceMarkProps) {
  return (
    <span aria-hidden="true" className={cx(styles.mark, styles[size], className)}>
      {initialsOf(name)}
    </span>
  )
}
