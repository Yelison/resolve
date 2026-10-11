import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Skeleton } from '../../components/ui'
import styles from './Ghost.module.css'

/**
 * Esqueleto con la altura real del bloque: dibuja el contenido de verdad, con valores representativos, oculto (con
 * `visibility: hidden`, que también lo quita de la lectura de pantalla y del orden de tabulación), y encima el
 * esqueleto visible. Ocupa lo mismo que el bloque cargado en cualquier ancho y fuente, así que lo de debajo no salta
 * cuando llegan los datos. Nunca muestra ni anuncia el texto de muestra.
 */
export function Ghost({
  label,
  lines = 3,
  className,
  contentClassName,
  children,
}: {
  /** Lo que oyen los lectores de pantalla; vacío en los esqueletos que acompañan a otro que ya lo anuncia. */
  label: string
  lines?: number
  className?: string
  /** Clase del contenido oculto: para darle el mismo `gap` que tiene el bloque real. */
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <div className={cx(styles.ghost, className)}>
      <div className={cx(styles.content, contentClassName)} aria-hidden="true" inert>
        {children}
      </div>
      <Skeleton lines={lines} label={label} className={styles.skeleton} />
    </div>
  )
}
