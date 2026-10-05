import { useId, useState, type CSSProperties } from 'react'
import { cx } from '../../../lib/cx'
import styles from './BarChart.module.css'

export type BarChartColor = 'brand' | 'muted'

export interface BarChartSeries {
  id: string
  label: string
  color?: BarChartColor
}

export interface BarChartPoint {
  key: string
  /** Nombre completo del punto: es el que leen la tabla alternativa y los títulos de las barras. */
  label: string
  /** Etiqueta abreviada del eje (p. ej. «L» para «Lunes»); si falta se usa `label`. */
  shortLabel?: string
  values: Record<string, number>
}

export interface BarChartProps {
  /** Nombre accesible del gráfico; también es el título de la tabla alternativa. */
  label: string
  series: BarChartSeries[]
  points: BarChartPoint[]
  valueFormatter?: (n: number) => string
  className?: string
}

const defaultColors: BarChartColor[] = ['brand', 'muted']
const defaultFormatter = (n: number) => n.toLocaleString('es')

// Unidades internas del viewBox de cada columna; el SVG se estira al ancho de su celda.
const BAR_WIDTH = 10
const BAR_GAP = 2
const VIEW_HEIGHT = 100

/**
 * Gráfico de barras en SVG propio. Las etiquetas viven en HTML para conservar su tamaño legible
 * a cualquier ancho; la tabla alternativa siempre está en el DOM y el botón la hace visible.
 */
export function BarChart({ label, series, points, valueFormatter = defaultFormatter, className }: BarChartProps) {
  const tableId = useId()
  const [tableVisible, setTableVisible] = useState(false)

  if (points.length === 0) {
    return (
      <p className={cx(styles.empty, className)} role="status">
        Sin datos en este periodo
      </p>
    )
  }

  const max = Math.max(1, ...points.flatMap((point) => series.map((item) => point.values[item.id] ?? 0)))
  const single = series.length === 1
  const colorOf = (index: number): BarChartColor =>
    series[index]?.color ?? defaultColors[index % defaultColors.length] ?? 'brand'
  const viewWidth = series.length * BAR_WIDTH + (series.length - 1) * BAR_GAP

  return (
    <figure className={cx(styles.chart, className)}>
      <div className={styles.plot} role="img" aria-label={label} aria-describedby={tableId}>
        <div className={styles.columns} style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
          {points.map((point) => {
            const peak = Math.max(...series.map((item) => point.values[item.id] ?? 0))
            return (
              <div key={point.key} className={styles.column}>
                <div className={cx(styles.stage, single && styles.labelled)}>
                  {single && <span className={styles.value}>{valueFormatter(peak)}</span>}
                  <svg
                    className={styles.bars}
                    viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
                    preserveAspectRatio="none"
                    style={{ '--ratio': peak / max } as CSSProperties}
                    aria-hidden="true"
                    focusable="false"
                  >
                    {series.map((item, index) => {
                      const value = point.values[item.id] ?? 0
                      const height = peak > 0 ? (value / peak) * VIEW_HEIGHT : 0
                      return (
                        <rect
                          key={item.id}
                          className={cx(styles.bar, styles[colorOf(index)])}
                          x={index * (BAR_WIDTH + BAR_GAP)}
                          y={VIEW_HEIGHT - height}
                          width={BAR_WIDTH}
                          height={height}
                        >
                          <title>{`${point.label} · ${item.label}: ${valueFormatter(value)}`}</title>
                        </rect>
                      )
                    })}
                  </svg>
                </div>
                <span className={styles.axis}>{point.shortLabel ?? point.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {!single && (
        <ul className={styles.legend} aria-hidden="true">
          {series.map((item, index) => (
            <li key={item.id} className={styles.legendItem}>
              <span className={cx(styles.swatch, styles[colorOf(index)])} />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={tableVisible}
        aria-controls={tableId}
        onClick={() => setTableVisible((visible) => !visible)}
      >
        {tableVisible ? 'Ocultar tabla' : 'Ver como tabla'}
      </button>

      <div id={tableId} className={cx(styles.tableWrap, !tableVisible && 'visually-hidden')}>
        <table className={styles.table}>
          <caption className={styles.caption}>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              {series.map((item) => (
                <th key={item.id} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.label}</th>
                {series.map((item) => (
                  <td key={item.id}>{valueFormatter(point.values[item.id] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
