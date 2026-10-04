import type { ReactNode } from 'react'
import styles from './Page.module.css'

export interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Acciones principales de la página, alineadas a la derecha cuando caben. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions}
    </header>
  )
}
