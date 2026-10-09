import { useId, type CSSProperties } from 'react'
import { cx } from '../../../lib/cx'
import { niceScale } from '../LineChart/scale'
import { ChartTable } from '../shared/ChartTable'
import { useElementWidth } from '../shared/useElementWidth'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './DotPlot.module.css'

export interface DotPlotRow {
  /** Clave única de la fila para React. */
  key: string
  /** Nombre de la fila (p. ej. el de la persona); se parte en varias líneas si es largo. */
  label: string
  /** Valor de la fila; define la posición del punto. */
  value: number
}

export interface DotPlotTarget {
  /** Valor del objetivo: la línea vertical discontinua se dibuja ahí. */
  value: number
  /** Texto de la marca bajo el eje (p. ej. «objetivo 30 min»). */
  label: string
}

export interface DotPlotProps {
  /** Nombre accesible del gráfico; también es el título de la tabla alternativa. */
  label: string
  /** Una fila por entidad, en el orden en que se leen. Sin filas se muestra un mensaje de «sin datos». */
  rows: DotPlotRow[]
  /** Objetivo frente al que se compara cada valor; quien lo supera se marca con color y con texto. */
  target: DotPlotTarget
  /** Texto que acompaña al valor de quien supera el objetivo. Por defecto, «por encima del objetivo». */
  aboveText?: string
  /** Texto de la tabla alternativa para quien no supera el objetivo. Por defecto, «dentro del objetivo». */
  withinText?: string
  /** Formatea los valores en la columna de valores, el tooltip y la tabla; por defecto `toLocaleString('es')`. */
  valueFormatter?: (n: number) => string
  /** Formatea las marcas del eje (p. ej. sin la unidad); por defecto usa `valueFormatter`. */
  tickFormatter?: (n: number) => string
  /** Cabecera de la columna de valores en la tabla alternativa. Por defecto, «Valor». */
  valueColumn?: string
  /** Clase adicional del contenedor. */
  className?: string
}

const defaultFormatter = (n: number) => n.toLocaleString('es')
const percent = (n: number) => `${Math.round(n * 1000) / 1000}%`

// Medidas aproximadas (texto de 12 px) con las que se decide si una etiqueta cabe centrada bajo su marca.
const GLYPH_WIDTH = 7
const FALLBACK_WIDTH = 300

/**
 * Gráfico de puntos: una fila por entidad con su nombre, un punto de 12 px sobre un eje común y el valor escrito. Una
 * línea vertical discontinua marca el objetivo; quien lo supera lleva el punto en `--color-red-ink` **y** el texto
 * «por encima del objetivo», así que el color nunca es lo único que lo dice.
 *
 * Los nombres viven en HTML y se parten sin recortarse; por debajo de 768 px cada fila pone el nombre encima del eje. Cada
 * punto es un botón con tooltip (puntero y teclado) con su valor exacto. El texto del eje y de los valores usa los
 * tokens de tinta. Pensado para unas pocas decenas de filas.
 */
export function DotPlot({
  label,
  rows,
  target,
  aboveText = 'por encima del objetivo',
  withinText = 'dentro del objetivo',
  valueFormatter = defaultFormatter,
  tickFormatter,
  valueColumn = 'Valor',
  className,
}: DotPlotProps) {
  const tableId = useId()
  const summaryId = useId()
  const [setAxis, axisWidth] = useElementWidth<HTMLDivElement>()

  if (rows.length === 0) {
    return (
      <p className={cx(styles.empty, className)} role="status">
        {label}: sin datos en este periodo
      </p>
    )
  }

  const scale = niceScale([...rows.map((row) => row.value), target.value])
  const xOf = (value: number) => ((value - scale.min) / (scale.max - scale.min)) * 100
  const formatTick = tickFormatter ?? valueFormatter
  const isAbove = (row: DotPlotRow) => row.value > target.value
  const status = (row: DotPlotRow) => (isAbove(row) ? aboveText : withinText)
  const above = rows.filter(isAbove)
  const summary = `${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}; ${
    above.length === 0
      ? `todas ${withinText}`
      : `${above.length} ${aboveText}: ${above.map((row) => row.label).join(', ')}`
  }. ${target.label}. El detalle completo está en la tabla alternativa que sigue al gráfico, junto al botón «Ver como tabla».`
  /** Centrada bajo su marca; si así se saldría del eje, pegada al borde más cercano (sin desbordar el panel). */
  const labelStyle = (value: number, text: string): CSSProperties => {
    const width = axisWidth ?? FALLBACK_WIDTH
    const half = (text.length * GLYPH_WIDTH) / 2
    const centre = (xOf(value) / 100) * width
    if (centre + half > width) return { right: 0 }
    if (centre - half < 0) return { left: 0 }
    return { left: percent(xOf(value)), transform: 'translateX(-50%)' }
  }
  // La marca del objetivo tiene su propia fila: una marca del eje que caiga encima de ella se omite.
  const ticks = scale.ticks.filter((tick) => tick !== target.value)

  return (
    <figure
      className={cx(styles.chart, className)}
      role="group"
      aria-label={label}
      aria-describedby={summaryId}
      aria-details={tableId}
    >
      <span id={summaryId} hidden>
        {summary}
      </span>
      <ul className={styles.rows}>
        {rows.map((row) => {
          const text = `${row.label}: ${valueFormatter(row.value)}${isAbove(row) ? `, ${aboveText}` : ''}`
          return (
            <li key={row.key} className={styles.row}>
              <span className={styles.name}>{row.label}</span>
              <div className={styles.track}>
                <div className={styles.rail}>
                  {ticks.map((tick) => (
                    <span
                      key={tick}
                      className={styles.gridline}
                      style={{ left: percent(xOf(tick)) }}
                      aria-hidden="true"
                    />
                  ))}
                  <span className={styles.target} style={{ left: percent(xOf(target.value)) }} aria-hidden="true" />
                  <span className={styles.stem} style={{ width: percent(xOf(row.value)) }} aria-hidden="true" />
                  <Tooltip content={text} describe={false}>
                    {(trigger) => (
                      <button
                        type="button"
                        className={styles.hit}
                        style={{ left: percent(xOf(row.value)) }}
                        aria-label={text}
                        onPointerEnter={trigger.onPointerEnter}
                        onPointerLeave={trigger.onPointerLeave}
                        onFocus={trigger.onFocus}
                        onBlur={trigger.onBlur}
                      >
                        <span ref={trigger.ref} className={cx(styles.dot, isAbove(row) && styles.over)} />
                      </button>
                    )}
                  </Tooltip>
                </div>
              </div>
              <span className={styles.value}>
                {valueFormatter(row.value)}
                {isAbove(row) && <span className={styles.status}> · {aboveText}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      <div className={styles.axis} aria-hidden="true">
        <div ref={setAxis} className={styles.rail}>
          <div className={styles.ticks}>
            {ticks.map((tick) => (
              <span key={tick} className={styles.tick} style={labelStyle(tick, formatTick(tick))}>
                {formatTick(tick)}
              </span>
            ))}
          </div>
          <div className={styles.targetRow}>
            <span className={styles.targetLabel} style={labelStyle(target.value, target.label)}>
              {target.label}
            </span>
          </div>
        </div>
      </div>
      <ChartTable
        id={tableId}
        label={label}
        firstColumn="Nombre"
        columns={[valueColumn, 'Frente al objetivo']}
        rows={rows.map((row) => ({
          key: row.key,
          header: row.label,
          cells: [valueFormatter(row.value), status(row)],
        }))}
      />
    </figure>
  )
}
