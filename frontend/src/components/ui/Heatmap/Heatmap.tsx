import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cx } from '../../../lib/cx'
import { ChartTable } from '../shared/ChartTable'
import { Tooltip } from '../Tooltip/Tooltip'
import { heatStep, type HeatStep } from './scale'
import styles from './Heatmap.module.css'

export interface HeatmapRow {
  /** Clave única de la fila. */
  key: string
  /** Texto de la cabecera de la fila (p. ej. «lun»). */
  label: string
}

export interface HeatmapColumn {
  /** Clave única de la columna. */
  key: string
  /** Etiqueta corta del eje (p. ej. «8»). */
  label: string
  /** Nombre completo de la columna para el tooltip, el nombre accesible y la tabla (p. ej. «8–10 h»); por defecto, `label`. */
  name?: string
}

export interface HeatmapProps {
  /** Nombre accesible del mapa; también es el título de la tabla alternativa. */
  label: string
  /** Filas, de arriba abajo. */
  rows: HeatmapRow[]
  /** Columnas, de izquierda a derecha. */
  columns: HeatmapColumn[]
  /** Un valor por fila y por columna (`values[fila][columna]`, ≥ 0): las celdas sin datos valen 0. */
  values: number[][]
  /** Texto de una celda para el tooltip, el nombre accesible y la tabla; por defecto, el valor formateado. */
  cellText?: (value: number, row: HeatmapRow, column: HeatmapColumn) => string
  /** Formatea los valores que no pasan por `cellText`; por defecto `toLocaleString('es')`. */
  valueFormatter?: (n: number) => string
  /** Cabecera de la primera columna de la tabla alternativa. Por defecto, «Fila». */
  rowColumn?: string
  /** Extremos de la leyenda. Por defecto, «Menos» y «Más». */
  legend?: { low: string; high: string }
  /** Clase adicional del contenedor. */
  className?: string
}

const defaultFormatter = (n: number) => n.toLocaleString('es')

/**
 * Mapa de calor con leyenda y tabla alternativa. Cada celda toma uno de cuatro pasos de la rampa secuencial según su
 * valor frente al máximo (`heatStep`), o queda vacía si vale 0; los dos pasos claros llevan un contorno de línea.
 *
 * Teclado: es una cuadrícula ARIA con una sola parada de Tab (la celda activa) que se recorre con las flechas, Inicio y
 * Fin (Ctrl+Inicio y Ctrl+Fin, a las esquinas). Así el mapa no añade 84 paradas de Tab y se llega a todo; la celda
 * enfocada muestra su valor exacto en el tooltip y se desplaza a la vista dentro del panel con scroll. La tabla
 * alternativa sigue siendo la vía para leer todos los valores de una vez.
 *
 * Con poco ancho conserva el tamaño de sus celdas y hace scroll horizontal dentro de su contenedor, nunca de la página.
 */
export function Heatmap({
  label,
  rows,
  columns,
  values,
  cellText,
  valueFormatter = defaultFormatter,
  rowColumn = 'Fila',
  legend = { low: 'Menos', high: 'Más' },
  className,
}: HeatmapProps) {
  const tableId = useId()
  const cells = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState({ row: 0, column: 0 })
  // Si la cuadrícula se encoge, la celda activa se acota a la nueva: el mapa nunca se queda sin parada de Tab.
  const current = {
    row: Math.min(active.row, Math.max(0, rows.length - 1)),
    column: Math.min(active.column, Math.max(0, columns.length - 1)),
  }
  const valueAt = (row: number, column: number) => values[row]?.[column] ?? 0
  const max = Math.max(0, ...rows.flatMap((_, row) => columns.map((_, column) => valueAt(row, column))))

  if (rows.length === 0 || columns.length === 0 || max <= 0) {
    return (
      <p className={cx(styles.empty, className)} role="status">
        {label}: sin datos en este periodo
      </p>
    )
  }

  const nameOf = (column: HeatmapColumn) => column.name ?? column.label
  const textOf = (row: HeatmapRow, column: HeatmapColumn, value: number) =>
    cellText ? cellText(value, row, column) : valueFormatter(value)
  const describe = (rowIndex: number, columnIndex: number) => {
    const row = rows[rowIndex]!
    const column = columns[columnIndex]!
    return `${row.label} ${nameOf(column)}: ${textOf(row, column, valueAt(rowIndex, columnIndex))}`
  }
  const summary = `${rows.length} filas por ${columns.length} columnas. El detalle completo está en la tabla alternativa que sigue al mapa, junto al botón «Ver como tabla».`

  function move(row: number, column: number) {
    const next = {
      row: Math.min(rows.length - 1, Math.max(0, row)),
      column: Math.min(columns.length - 1, Math.max(0, column)),
    }
    setActive(next)
    const element = cells.current.get(`${next.row}:${next.column}`)
    element?.focus()
    // La celda puede quedar fuera del panel con scroll: se acerca lo justo, sin mover la página.
    element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { row, column } = current
    const last = { row: rows.length - 1, column: columns.length - 1 }
    const target: Record<string, [number, number]> = {
      ArrowRight: [row, column + 1],
      ArrowLeft: [row, column - 1],
      ArrowDown: [row + 1, column],
      ArrowUp: [row - 1, column],
      Home: event.ctrlKey ? [0, 0] : [row, 0],
      End: event.ctrlKey ? [last.row, last.column] : [row, last.column],
    }
    const next = target[event.key]
    if (!next) return
    event.preventDefault()
    move(next[0], next[1])
  }

  return (
    <figure className={cx(styles.chart, className)} style={{ '--columns': columns.length } as CSSProperties}>
      <span id={`${tableId}-summary`} hidden>
        {summary}
      </span>
      <div className={styles.scroller}>
        <div
          className={styles.grid}
          role="grid"
          aria-label={label}
          aria-readonly="true"
          aria-describedby={`${tableId}-summary`}
          aria-details={tableId}
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length + 1}
          onKeyDown={onKeyDown}
        >
          <div className={styles.row} role="row">
            <span className={styles.corner} role="columnheader" aria-label={rowColumn} />
            {columns.map((column) => (
              <span key={column.key} className={styles.columnHeader} role="columnheader" aria-label={nameOf(column)}>
                {column.label}
              </span>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div key={row.key} className={styles.row} role="row">
              <span className={styles.rowHeader} role="rowheader">
                {row.label}
              </span>
              {columns.map((column, columnIndex) => {
                const value = valueAt(rowIndex, columnIndex)
                const step: HeatStep = heatStep(value, max)
                const isActive = current.row === rowIndex && current.column === columnIndex
                const text = describe(rowIndex, columnIndex)
                return (
                  <Tooltip key={column.key} placement="bottom-start" describe={false} content={text}>
                    {(trigger) => (
                      <div
                        className={cx(styles.cell, styles[`step${step}`])}
                        role="gridcell"
                        aria-label={text}
                        tabIndex={isActive ? 0 : -1}
                        data-step={step}
                        {...trigger}
                        ref={(node) => {
                          trigger.ref(node)
                          const key = `${rowIndex}:${columnIndex}`
                          if (node) cells.current.set(key, node)
                          else cells.current.delete(key)
                        }}
                        onFocus={() => {
                          trigger.onFocus()
                          setActive({ row: rowIndex, column: columnIndex })
                        }}
                      />
                    )}
                  </Tooltip>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>{legend.low}</span>
        {([0, 1, 2, 3, 4] as const).map((step) => (
          <span key={step} className={cx(styles.swatch, styles[`step${step}`])} />
        ))}
        <span>{legend.high}</span>
      </div>
      <ChartTable
        id={tableId}
        label={label}
        firstColumn={rowColumn}
        columns={columns.map(nameOf)}
        wide
        rows={rows.map((row, rowIndex) => ({
          key: row.key,
          header: row.label,
          cells: columns.map((column, columnIndex) => textOf(row, column, valueAt(rowIndex, columnIndex))),
        }))}
      />
    </figure>
  )
}
