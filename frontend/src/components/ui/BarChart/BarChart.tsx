import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
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
  /**
   * Etiqueta abreviada del eje (p. ej. «L» para «Lunes», «15» para «15 de julio»); si falta se usa `label`.
   * Conviene darla cuando `label` es largo: sin ella el eje solo puede mostrar una etiqueta cada varios puntos.
   */
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

// Medidas aproximadas (texto de 12 px) con las que se decide qué cabe a cada ancho.
const GLYPH_WIDTH = 7
const LABEL_PADDING = 8
const FALLBACK_WIDTH = 300 // Sin medida (render de servidor, tests): se supone un contenedor de móvil.

/** Separación entre columnas según la densidad: con muchos puntos se reduce para que las barras no desaparezcan. */
const gapFor = (count: number) => (count <= 14 ? 8 : count <= 40 ? 2 : 1)

/** Ancho del elemento observado, o `null` hasta que se mide (o si el entorno no tiene ResizeObserver). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => setWidth(element.getBoundingClientRect().width || null)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Gráfico de barras en SVG propio. Las etiquetas viven en HTML para conservar su tamaño legible
 * a cualquier ancho; la tabla alternativa siempre está en el DOM y el botón la hace visible.
 *
 * Se adapta a la densidad según el ancho medido del contenedor:
 * - la separación entre columnas baja de 8 px (hasta 14 puntos) a 2 px (hasta 40) y a 1 px;
 * - las cifras sobre las barras (solo con una serie) aparecen únicamente si caben; el `<title>` de cada barra
 *   y la tabla alternativa dan siempre el valor;
 * - el eje muestra una etiqueta cada *k* puntos (la más larga decide *k*) en lugar de recortarlas todas; una
 *   etiqueta ocupa *k* columnas desde su barra, y la última se omite si ya no le quedan columnas suficientes.
 *
 * Límites: pensado para 1–2 series y hasta unos 90 puntos desde 256 px de contenedor (cada barra mide entonces
 * ~2 px, aún visible). Por encima de eso, o si cada punto debe poder leerse o señalarse, hay que agregar los
 * datos (p. ej. por semanas) antes de pasarlos. Con 2 series no se pintan cifras sobre las barras.
 */
export function BarChart({ label, series, points, valueFormatter = defaultFormatter, className }: BarChartProps) {
  const tableId = useId()
  const [tableVisible, setTableVisible] = useState(false)
  const [plotRef, plotWidth] = useElementWidth<HTMLDivElement>()

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

  const count = points.length
  const gap = gapFor(count)
  const columnWidth = ((plotWidth ?? FALLBACK_WIDTH) - gap * (count - 1)) / count
  const longest = (texts: string[]) => Math.max(...texts.map((text) => text.length))
  const axisLabelOf = (point: BarChartPoint) => point.shortLabel ?? point.label
  const axisStep = Math.max(
    1,
    Math.ceil((longest(points.map(axisLabelOf)) * GLYPH_WIDTH + LABEL_PADDING) / (columnWidth + gap)),
  )
  const showValues =
    single &&
    columnWidth >=
      longest(points.map((point) => valueFormatter(Math.max(...series.map((item) => point.values[item.id] ?? 0))))) *
        GLYPH_WIDTH +
        2
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
    columnGap: `${gap}px`,
  }

  return (
    <figure className={cx(styles.chart, className)}>
      <div ref={plotRef} className={styles.plot} role="img" aria-label={label} aria-describedby={tableId}>
        <div className={styles.columns} style={gridStyle}>
          {points.map((point) => {
            const peak = Math.max(...series.map((item) => point.values[item.id] ?? 0))
            return (
              <div key={point.key} className={styles.column}>
                <div className={cx(styles.stage, showValues && styles.labelled)}>
                  {showValues && <span className={styles.value}>{valueFormatter(peak)}</span>}
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
              </div>
            )
          })}
        </div>
        <div className={styles.axisRow} style={gridStyle}>
          {points.map((point, index) =>
            index % axisStep === 0 && count - index >= axisStep ? (
              <span
                key={point.key}
                className={cx(styles.axis, axisStep > 1 && styles.axisStart)}
                style={{ gridColumn: `${index + 1} / span ${axisStep}` }}
              >
                {axisLabelOf(point)}
              </span>
            ) : null,
          )}
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
