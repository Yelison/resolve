import type { ReactNode } from 'react'
import styles from './ArticleProse.module.css'

/** Tipografía de lectura del cuerpo de un artículo, a un ancho de unos 720 px. Compartida por la lectura y la vista previa. */
export function ArticleProse({ children }: { children: ReactNode }) {
  return <div className={styles.prose}>{children}</div>
}
