import { cx } from '../../../lib/cx'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  /** Número de líneas de carga. */
  lines?: number
  /** Texto que oyen los lectores de pantalla mientras carga. */
  label?: string
  /** Clase adicional del contenedor. */
  className?: string
}

export function Skeleton({ lines = 2, label = 'Cargando…', className }: SkeletonProps) {
  return (
    <div className={cx(styles.skeleton, className)} role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={styles.line} aria-hidden="true" />
      ))}
    </div>
  )
}
