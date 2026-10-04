import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import styles from './Breadcrumb.module.css'

export interface BreadcrumbItem {
  label: string
  /** Ruta del enlace; el último elemento es la página actual y no lo necesita. */
  to?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Ruta de navegación" className={className}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {isCurrent || !item.to ? (
                <span className={cx(isCurrent && styles.current)} aria-current={isCurrent ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className={styles.link}>
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
