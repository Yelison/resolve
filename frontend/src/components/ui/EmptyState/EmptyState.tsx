import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './EmptyState.module.css'

export type EmptyStateKind = 'empty' | 'noResults' | 'error' | 'restricted'

const defaultIcons: Record<EmptyStateKind, IconName> = {
  empty: 'ticket',
  noResults: 'search',
  error: 'bell',
  restricted: 'lock',
}

export interface EmptyStateProps {
  /** Tipo de estado: 'empty', 'noResults', 'error' o 'restricted'; por defecto 'empty'. Decide el icono por defecto */
  kind?: EmptyStateKind
  /** Título del estado, mostrado como encabezado */
  title: ReactNode
  /** Texto explicativo bajo el título */
  description?: ReactNode
  /** Icono; si falta se usa el propio de `kind` */
  icon?: IconName
  /** Acción principal, normalmente un Button. */
  action?: ReactNode
  /** Nivel del encabezado según la página que lo contiene. */
  headingLevel?: 2 | 3 | 4
  /** Anuncia el estado al aparecer, por ejemplo cuando falla una recarga. No lo uses en la carga inicial. */
  live?: boolean
  /** Clase adicional para el contenedor */
  className?: string
}

/** Estado sin contenido: lista vacía, sin resultados, error de carga o sin permisos. */
export function EmptyState({
  kind = 'empty',
  title,
  description,
  icon,
  action,
  headingLevel = 2,
  live = false,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <section className={cx(styles.empty, className)} role={live ? (kind === 'error' ? 'alert' : 'status') : undefined}>
      <Icon name={icon ?? defaultIcons[kind]} size={32} className={styles.icon} />
      <Heading className={styles.title}>{title}</Heading>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </section>
  )
}
