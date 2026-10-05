import type { ReactNode } from 'react'
import { Skeleton } from '../../components/ui'
import styles from './forms.module.css'

/**
 * Esqueleto con la altura real: el formulario de verdad, oculto (`visibility: hidden` también lo quita de la lectura
 * y del tabulador), fija el sitio y el esqueleto lo cubre. Al llegar los datos el contenido siguiente no se mueve.
 */
export function FormGhost({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.ghost}>
      <div className={styles.ghostContent} aria-hidden="true">
        {children}
      </div>
      <Skeleton lines={4} label={label} className={styles.ghostSkeleton} />
    </div>
  )
}
