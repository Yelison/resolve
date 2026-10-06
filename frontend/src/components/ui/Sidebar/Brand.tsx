import { cx } from '../../../lib/cx'
import styles from './Brand.module.css'

export interface BrandProps {
  /** Muestra el nombre junto al logo; sin él queda solo el logo. Por defecto, `true`. */
  showName?: boolean
  /** Clase adicional del contenedor. */
  className?: string
}

/**
 * Marca de Resolve: logo y nombre. El texto hereda el color del contenedor, así que sirve sobre el fondo del sidebar y
 * sobre una tarjeta. Es decorativa: quien la use debe darle nombre accesible (un enlace) o acompañarla de un título.
 */
export function Brand({ showName = true, className }: BrandProps) {
  return (
    <span className={cx(styles.brand, className)} aria-hidden="true">
      <span className={styles.mark}>R</span>
      {showName && <span className={styles.logo}>resolve</span>}
    </span>
  )
}
