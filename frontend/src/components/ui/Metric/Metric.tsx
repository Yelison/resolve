import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Metric.module.css'

export type MetricTrend = 'positive' | 'neutral' | 'negative'

export interface MetricProps {
  /** Nombre del indicador. */
  label: ReactNode
  /** Valor principal. */
  value: ReactNode
  /** Texto de detalle bajo el valor. */
  detail?: ReactNode
  /** Color del detalle. Refuerza el texto, que debe expresar por sí mismo si la variación es buena o mala. */
  trend?: MetricTrend
  /**
   * Gráfico que acompaña al valor (un minigráfico de tendencia, una barra frente al objetivo…). Va junto al valor si
   * cabe y debajo si no. Es un complemento: el valor y su detalle deben decir lo mismo con texto.
   */
  chart?: ReactNode
  /** Si es `true`, destaca la tarjeta; por defecto `false`. */
  highlighted?: boolean
  /** Clase del contenedor. */
  className?: string
}

/** Indicador con etiqueta, valor y detalle; se lee en ese orden aunque el valor destaque visualmente. */
export function Metric({
  label,
  value,
  detail,
  chart,
  trend = 'neutral',
  highlighted = false,
  className,
}: MetricProps) {
  return (
    <div className={cx(styles.metric, highlighted && styles.highlighted, className)}>
      <dl className={styles.pair}>
        <dt className={styles.label}>{label}</dt>
        {chart ? (
          <div className={styles.valueRow}>
            <dd className={styles.value}>{value}</dd>
            <dd className={styles.chart}>{chart}</dd>
          </div>
        ) : (
          <dd className={styles.value}>{value}</dd>
        )}
        {detail && <dd className={cx(styles.detail, styles[trend])}>{detail}</dd>}
      </dl>
    </div>
  )
}
