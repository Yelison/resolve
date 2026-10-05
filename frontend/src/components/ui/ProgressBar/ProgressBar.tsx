import { useId } from 'react'
import { cx } from '../../../lib/cx'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  /** Etiqueta visible de la barra. */
  label: string
  /** Valor actual. */
  value: number
  /** Valor máximo; por defecto 100. */
  max?: number
  /** Texto del valor, visible y leído por lectores de pantalla; por omisión el porcentaje. */
  valueText?: string
  /** Clase del contenedor. */
  className?: string
}

/** Barra de progreso con etiqueta y valor visibles; el valor se limita al rango 0..max. */
export function ProgressBar({ label, value, max = 100, valueText, className }: ProgressBarProps) {
  const labelId = useId()
  const safeMax = max > 0 ? max : 100
  const current = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0
  const percent = (current / safeMax) * 100
  const text = valueText ?? `${Math.round(percent)} %`

  return (
    <div className={cx(styles.progress, className)}>
      <div className={styles.header}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        <span className={styles.value} aria-hidden="true">
          {text}
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={current}
        aria-valuetext={text}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
