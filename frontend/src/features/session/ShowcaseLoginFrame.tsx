import type { ReactNode } from 'react'
import { ShowcaseBanner } from '../../app/layout/ShowcaseBanner'
import styles from './ShowcaseLoginFrame.module.css'

/** La pantalla de entrada de la demostración estática con su aviso al pie, fuera de la shell. Solo existe en `--mode showcase`. */
export function ShowcaseLoginFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      {children}
      <ShowcaseBanner />
    </div>
  )
}
