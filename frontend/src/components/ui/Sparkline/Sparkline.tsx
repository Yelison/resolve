import { cx } from '../../../lib/cx'
import { sparklinePoints } from './points'
import styles from './Sparkline.module.css'

export interface SparklineProps {
  /** Valores en orden cronológico. Sin valores no se dibuja nada; con uno solo, es un punto. */
  values: number[]
  /** Posición del color en la paleta de gráficos (`--color-chart-1…4`). Por defecto, 1. */
  color?: 1 | 2 | 3 | 4
  /**
   * Nombre accesible. Sin él el minigráfico es decorativo (`aria-hidden`): úsalo solo cuando el valor que resume ya
   * está escrito al lado. No tiene tooltip ni tabla propia: el detalle vive en el gráfico completo de la misma página.
   */
  label?: string
  /** Clase adicional. */
  className?: string
}

const WIDTH = 120
const HEIGHT = 36
/** Margen para que el punto final (radio 4 px) y su anillo de 2 px no se recorten. */
const PAD = 6

/** Minigráfico de tendencia: una línea de 2 px con un punto de 8 px, con anillo del color de la superficie, al final. */
export function Sparkline({ values, color = 1, label, className }: SparklineProps) {
  if (values.length === 0) return null
  const points = sparklinePoints(values, WIDTH, HEIGHT, PAD)
  const last = points[points.length - 1]!
  return (
    <svg
      className={cx(styles.sparkline, styles[`color${color}`], className)}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {points.length > 1 && (
        <polyline className={styles.line} points={points.map(({ x, y }) => `${x},${y}`).join(' ')} />
      )}
      <circle className={styles.dot} cx={last.x} cy={last.y} r={4} />
    </svg>
  )
}
