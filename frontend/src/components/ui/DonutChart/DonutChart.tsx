import { useId, useState } from 'react'
import { cx } from '../../../lib/cx'
import { ChartTable } from '../shared/ChartTable'
import { Tooltip } from '../Tooltip/Tooltip'
import { sectorPath, sliceAngles } from './geometry'
import styles from './DonutChart.module.css'

/** Posición del color en la paleta de gráficos (`--color-chart-1…4`). Es fija por entidad, no por orden de aparición. */
export type DonutColor = 1 | 2 | 3 | 4

export interface DonutSegment {
  /** Clave única del segmento. */
  id: string
  /** Nombre del segmento; aparece en la leyenda, en el tooltip y en la tabla alternativa. */
  label: string
  /** Valor del segmento (≥ 0); el ángulo es proporcional al total. */
  value: number
  /** Color de la paleta. Debe seguir a la entidad (siempre el mismo para «Correo»), no su posición en la lista. */
  color: DonutColor
  /** Texto del valor en la leyenda, el tooltip y la tabla (p. ej. «45,5 % · 56 tickets»); por defecto, el valor formateado. */
  valueText?: string
}

export interface DonutChartProps {
  /** Nombre accesible del gráfico; también es el título de la tabla alternativa. */
  label: string
  /** Segmentos del anillo, en el orden de la leyenda. Con total 0 se muestra un mensaje de «sin datos». */
  segments: DonutSegment[]
  /** Cifra del centro del anillo (p. ej. el total). Si falta, el centro queda vacío. */
  centerValue?: string
  /** Texto bajo la cifra del centro (p. ej. «solicitudes»). */
  centerLabel?: string
  /** Lado del gráfico en px. Por defecto, 168. */
  size?: number
  /** Cabecera de la columna de valores en la tabla alternativa. Por defecto, «Valor». */
  valueColumn?: string
  /** Formatea los valores que no traen `valueText`; por defecto `toLocaleString('es')`. */
  valueFormatter?: (n: number) => string
  /** Clase adicional del contenedor. */
  className?: string
}

const defaultFormatter = (n: number) => n.toLocaleString('es')

/** Grosor del anillo, separación entre segmentos y radio de las esquinas, en px (marcas finas del sistema de gráficos). */
const THICKNESS_RATIO = 0.125
const GAP = 2
const CORNER = 4
/** Ancho mínimo de un segmento (en px de arco sobre el radio medio) para que se vea y se pueda señalar. */
const MIN_ARC = 12

/**
 * Anillo con leyenda y tabla alternativa. Cada segmento es un sector con esquinas de 4 px y una separación de 2 px; el
 * texto de la leyenda y del centro usa los tokens de tinta, nunca el color de la serie. Cada segmento se puede señalar
 * con el puntero y recorrer con el teclado: el tooltip da su valor exacto y el segmento se remarca con un contorno.
 *
 * Un segmento con un valor muy pequeño conserva un ancho mínimo visible; los de valor 0 solo salen en la leyenda y la
 * tabla. Con un único segmento el anillo es completo y sin separación.
 */
export function DonutChart({
  label,
  segments,
  centerValue,
  centerLabel,
  size = 168,
  valueColumn = 'Valor',
  valueFormatter = defaultFormatter,
  className,
}: DonutChartProps) {
  const tableId = useId()
  const summaryId = useId()
  const [active, setActive] = useState<string | null>(null)
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)

  if (segments.length === 0 || total <= 0) {
    return (
      <p className={cx(styles.empty, className)} role="status">
        {label}: sin datos en este periodo
      </p>
    )
  }

  const textOf = (segment: DonutSegment) => segment.valueText ?? valueFormatter(segment.value)
  const outer = size / 2
  const inner = outer - size * THICKNESS_RATIO
  const middle = (outer + inner) / 2
  const slices = sliceAngles(
    segments.map((segment) => segment.value),
    MIN_ARC / middle,
  )
  const drawn = segments.flatMap((segment, index) => {
    const slice = slices[index]
    if (!slice || slice.end <= slice.start) return []
    const d = sectorPath(size, { outer, inner, start: slice.start, end: slice.end, gap: GAP, corner: CORNER })
    return [{ segment, d }]
  })
  const summary = `${segments.length} ${segments.length === 1 ? 'segmento' : 'segmentos'}: ${segments
    .map((segment) => `${segment.label} ${textOf(segment)}`)
    .join(
      '; ',
    )}. El detalle completo está en la tabla alternativa que sigue al gráfico, junto al botón «Ver como tabla».`

  return (
    <figure className={cx(styles.chart, className)}>
      <span id={summaryId} hidden>
        {summary}
      </span>
      <div className={styles.body}>
        <div className={styles.ring} style={{ width: size, height: size }}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            role="img"
            aria-label={label}
            aria-describedby={summaryId}
            aria-details={tableId}
          >
            {drawn.map(({ segment, d }) => (
              <path
                key={segment.id}
                d={d}
                fillRule="evenodd"
                className={cx(styles.segment, styles[`color${segment.color}`], active === segment.id && styles.active)}
              />
            ))}
            {centerValue !== undefined && (
              <text
                className={styles.centerValue}
                x={size / 2}
                y={size / 2 + (centerLabel ? 0 : 9)}
                textAnchor="middle"
              >
                {centerValue}
              </text>
            )}
            {centerValue !== undefined && centerLabel && (
              <text className={styles.centerLabel} x={size / 2} y={size / 2 + 20} textAnchor="middle">
                {centerLabel}
              </text>
            )}
          </svg>
          {/* Un botón por segmento, recortado a su forma: el puntero lo encuentra sobre el anillo y el teclado lo recorre. */}
          {drawn.map(({ segment, d }) => (
            <Tooltip
              key={segment.id}
              placement="bottom-start"
              describe={false}
              content={`${segment.label}: ${textOf(segment)}`}
            >
              {(trigger) => (
                <button
                  type="button"
                  className={styles.hit}
                  style={{ clipPath: `path('${d}')` }}
                  aria-label={`${segment.label}: ${textOf(segment)}`}
                  {...trigger}
                  onPointerEnter={() => {
                    trigger.onPointerEnter()
                    setActive(segment.id)
                  }}
                  onPointerLeave={() => {
                    trigger.onPointerLeave()
                    setActive(null)
                  }}
                  onFocus={() => {
                    trigger.onFocus()
                    setActive(segment.id)
                  }}
                  onBlur={() => {
                    trigger.onBlur()
                    setActive(null)
                  }}
                />
              )}
            </Tooltip>
          ))}
        </div>
        <ul className={styles.legend} aria-hidden="true">
          {segments.map((segment) => (
            <li key={segment.id} className={styles.legendItem}>
              <span className={cx(styles.swatch, styles[`color${segment.color}`])} />
              <span className={styles.legendText}>
                <span className={styles.legendLabel}>{segment.label}</span>
                <span className={styles.legendValue}>{textOf(segment)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ChartTable
        id={tableId}
        label={label}
        firstColumn="Categoría"
        columns={[valueColumn]}
        rows={segments.map((segment) => ({ key: segment.id, header: segment.label, cells: [textOf(segment)] }))}
      />
    </figure>
  )
}
