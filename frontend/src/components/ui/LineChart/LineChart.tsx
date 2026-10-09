import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cx } from '../../../lib/cx'
import { ChartTable } from '../shared/ChartTable'
import { useElementWidth } from '../shared/useElementWidth'
import { Tooltip } from '../Tooltip/Tooltip'
import { niceScale } from './scale'
import styles from './LineChart.module.css'

export interface LineChartPoint {
  /** Clave única del punto para React. */
  key: string
  /** Nombre completo del punto: lo leen el tooltip, el nombre del marcador y la tabla alternativa. */
  label: string
  /** Etiqueta abreviada del eje horizontal (p. ej. «28»); si falta se usa `label`. */
  shortLabel?: string
  /** Valor del punto; puede ser negativo. */
  value: number
}

export interface LineChartProps {
  /** Nombre accesible del gráfico; también es el título de la tabla alternativa. */
  label: string
  /** Puntos en orden cronológico; sin puntos se muestra un mensaje de «sin datos». */
  points: LineChartPoint[]
  /** Posición del color en la paleta de gráficos (`--color-chart-1…4`). Por defecto, 1. */
  color?: 1 | 2 | 3 | 4
  /** Formatea los valores en el eje, el tooltip y la tabla; por defecto `toLocaleString('es')`. */
  valueFormatter?: (n: number) => string
  /** Formatea las marcas del eje vertical (p. ej. sin la unidad); por defecto usa `valueFormatter`. */
  tickFormatter?: (n: number) => string
  /** Texto junto al último punto (p. ej. «+10 pendientes»). Si falta no se muestra ninguno. */
  endLabel?: string
  /** Cabecera de la columna de valores en la tabla alternativa. Por defecto, «Valor». */
  valueColumn?: string
  /** Clase adicional del contenedor. */
  className?: string
}

const defaultFormatter = (n: number) => n.toLocaleString('es')

/** Hasta este número de puntos todos llevan su punto visible; con más, solo el último y el señalado. */
const MAX_VISIBLE_DOTS = 14

// Medidas aproximadas (texto de 12 px) con las que se decide cuántas etiquetas caben en el eje horizontal.
const GLYPH_WIDTH = 7
const LABEL_PADDING = 12
const FALLBACK_WIDTH = 300

const percent = (n: number) => `${Math.round(n * 1000) / 1000}%`

/**
 * Gráfico de una línea de 2 px con eje vertical a la izquierda (siempre desde 0) y etiquetas del eje horizontal cada
 * *k* puntos según el ancho. Cada punto es un marcador con su tooltip: aparece al pasar el puntero y al enfocar. El
 * teclado entra por un único punto (el último) y recorre los demás con las flechas, Inicio y Fin, de modo que 90 días no
 * suponen 90 paradas de tabulación. La tabla alternativa lleva todos los valores.
 *
 * Los marcadores son HTML hermano del dibujo (no están dentro de la imagen), y el texto de los ejes usa los tokens de
 * tinta, no el color de la serie.
 */
export function LineChart({
  label,
  points,
  color = 1,
  valueFormatter = defaultFormatter,
  tickFormatter = valueFormatter,
  endLabel,
  valueColumn = 'Valor',
  className,
}: LineChartProps) {
  const tableId = useId()
  const summaryId = useId()
  const [setStage, stageWidth] = useElementWidth<HTMLDivElement>()
  const [current, setCurrent] = useState<number | null>(null)
  const markers = useRef<(HTMLButtonElement | null)[]>([])

  if (points.length === 0) {
    return (
      <p className={cx(styles.empty, className)} role="status">
        {label}: sin datos en este periodo
      </p>
    )
  }

  const count = points.length
  const scale = niceScale(points.map((point) => point.value))
  const range = scale.max - scale.min
  const heightOf = (value: number) => ((value - scale.min) / range) * 100
  const xOf = (index: number) => ((index + 0.5) / count) * 100
  const last = points[count - 1]!
  const tabStop = current !== null && current < count ? current : count - 1

  const peak = points.reduce((best, point) => (point.value > best.value ? point : best))
  const low = points.reduce((best, point) => (point.value < best.value ? point : best))
  const summary = `${count} ${count === 1 ? 'valor' : 'valores'}. Último ${valueFormatter(last.value)} en ${last.label}. Máximo ${valueFormatter(
    peak.value,
  )} en ${peak.label}; mínimo ${valueFormatter(low.value)} en ${low.label}. El detalle completo está en la tabla alternativa que sigue al gráfico, junto al botón «Ver como tabla».`

  const axisLabelOf = (point: LineChartPoint) => point.shortLabel ?? point.label
  const longest = Math.max(...points.map((point) => axisLabelOf(point).length))
  const columnWidth = (stageWidth ?? FALLBACK_WIDTH) / count
  const axisStep = Math.max(1, Math.ceil((longest * GLYPH_WIDTH + LABEL_PADDING) / columnWidth))
  // Las etiquetas se cuentan desde el último punto: el final del periodo siempre se lee, sea cual sea el salto.
  const showAxisLabel = (index: number) => (count - 1 - index) % axisStep === 0 && count - 1 - index >= 0

  /** Centrada bajo su punto; si así se saldría del eje, pegada al borde más cercano. */
  const labelStyle = (index: number, text: string): CSSProperties => {
    const width = stageWidth ?? FALLBACK_WIDTH
    const half = (text.length * GLYPH_WIDTH) / 2
    const centre = (xOf(index) / 100) * width
    if (centre + half > width) return { right: 0 }
    if (centre - half < 0) return { left: 0 }
    return { left: percent(xOf(index)), transform: 'translateX(-50%)' }
  }

  const showAllDots = count <= MAX_VISIBLE_DOTS
  const polyline = points.map((point, index) => `${xOf(index)},${100 - heightOf(point.value)}`).join(' ')
  const lastHeight = heightOf(last.value)
  // La etiqueta del final va del lado por donde no pasa la línea: encima si la serie sube hacia el último punto (la línea
  // llega desde abajo), debajo si baja; y al lado contrario si el punto queda pegado a ese borde del dibujo.
  const rising = count < 2 || last.value >= points[count - 2]!.value
  const labelBelow = rising ? lastHeight > 80 : lastHeight > 12

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? Math.min(count - 1, index + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null
    if (target === null) return
    event.preventDefault()
    setCurrent(target)
    markers.current[target]?.focus()
  }

  return (
    <figure className={cx(styles.chart, styles[`color${color}`], className)}>
      <span id={summaryId} hidden>
        {summary}
      </span>
      <div className={styles.frame}>
        <div className={styles.yAxis} aria-hidden="true">
          {scale.ticks.map((tick) => (
            <span key={tick} className={styles.yLabel} style={{ bottom: percent(heightOf(tick)) }}>
              {tickFormatter(tick)}
            </span>
          ))}
        </div>
        <div ref={setStage} className={styles.stage}>
          <svg
            className={styles.plot}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={label}
            aria-describedby={summaryId}
            aria-details={tableId}
          >
            {scale.ticks.map((tick) => (
              <line
                key={tick}
                className={cx(styles.grid, tick === 0 && styles.zero)}
                x1={0}
                x2={100}
                y1={100 - heightOf(tick)}
                y2={100 - heightOf(tick)}
              />
            ))}
            {count > 1 && <polyline className={styles.line} points={polyline} />}
          </svg>
          <div className={styles.markers} role="group" aria-label={`Valores de ${label}`}>
            {points.map((point, index) => {
              const text = `${point.label}: ${valueFormatter(point.value)}`
              return (
                <Tooltip key={point.key} content={text} describe={false}>
                  {(trigger) => (
                    <button
                      type="button"
                      ref={(node) => {
                        markers.current[index] = node
                      }}
                      className={styles.marker}
                      style={{ left: percent(xOf(index)), width: percent(100 / count) }}
                      tabIndex={index === tabStop ? 0 : -1}
                      aria-label={text}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      onPointerEnter={trigger.onPointerEnter}
                      onPointerLeave={trigger.onPointerLeave}
                      onFocus={() => {
                        setCurrent(index)
                        trigger.onFocus()
                      }}
                      onBlur={trigger.onBlur}
                    >
                      <span
                        ref={trigger.ref}
                        className={cx(styles.dot, (showAllDots || index === count - 1) && styles.dotShown)}
                        style={{ bottom: percent(heightOf(point.value)) }}
                      />
                    </button>
                  )}
                </Tooltip>
              )
            })}
          </div>
          {endLabel && (
            <span
              className={cx(styles.endLabel, labelBelow && styles.endLabelBelow)}
              style={{ bottom: percent(lastHeight), right: percent(100 - xOf(count - 1)) }}
            >
              {endLabel}
            </span>
          )}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {points.map((point, index) =>
            showAxisLabel(index) ? (
              <span key={point.key} className={styles.xLabel} style={labelStyle(index, axisLabelOf(point))}>
                {axisLabelOf(point)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <ChartTable
        id={tableId}
        label={label}
        firstColumn="Periodo"
        columns={[valueColumn]}
        rows={points.map((point) => ({ key: point.key, header: point.label, cells: [valueFormatter(point.value)] }))}
      />
    </figure>
  )
}
