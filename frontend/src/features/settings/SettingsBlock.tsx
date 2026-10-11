import { useId, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './SettingsBlock.module.css'

/**
 * Bloque de una sección de Configuración: el título (`h2`) y su explicación a la izquierda y los campos a la derecha.
 * Cuando el bloque no es lo bastante ancho para las dos columnas (lo decide el ancho del propio bloque, no el de la
 * ventana: depende también del sidebar) se apilan. Con `stacked` el contenido va siempre debajo, para los que
 * necesitan todo el ancho, como las miniaturas del tema.
 */
export function SettingsBlock({
  title,
  description,
  stacked = false,
  children,
}: {
  title: string
  description?: ReactNode
  stacked?: boolean
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section className={cx(styles.block, stacked && styles.stacked)} aria-labelledby={headingId}>
      <div className={styles.inner}>
        <div className={styles.titles}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  )
}
