import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Metric.module.css'

export type MetricTrend = 'positive' | 'neutral' | 'negative'

export interface MetricProps {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  /** Color del detalle. Refuerza el texto, que debe expresar por sí mismo si la variación es buena o mala. */
  trend?: MetricTrend
  highlighted?: boolean
  className?: string
}

/** Indicador con etiqueta, valor y detalle; se lee en ese orden aunque el valor destaque visualmente. */
export function Metric({ label, value, detail, trend = 'neutral', highlighted = false, className }: MetricProps) {
  return (
    <div className={cx(styles.metric, highlighted && styles.highlighted, className)}>
      <dl className={styles.pair}>
        <dt className={styles.label}>{label}</dt>
        <dd className={styles.value}>{value}</dd>
        {detail && <dd className={cx(styles.detail, styles[trend])}>{detail}</dd>}
      </dl>
    </div>
  )
}
