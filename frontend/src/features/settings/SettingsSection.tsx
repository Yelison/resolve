import { useId, type ReactNode } from 'react'
import styles from './SettingsSection.module.css'

/** Panel de una pestaña: título (`h2`, el destino del foco tras guardar), descripción y contenido. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.titles}>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {children}
    </section>
  )
}
