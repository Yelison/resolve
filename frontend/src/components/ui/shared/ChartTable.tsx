import { useState } from 'react'
import { cx } from '../../../lib/cx'
import styles from './ChartTable.module.css'

export interface ChartTableRow {
  /** Clave única de la fila para React. */
  key: string
  /** Texto de la cabecera de fila: el nombre completo del punto, segmento o agente. */
  header: string
  /** Un texto por columna de valores, ya formateado. */
  cells: string[]
}

export interface ChartTableProps {
  /** Id del contenedor de la tabla; el gráfico lo enlaza con `aria-details`. */
  id: string
  /** Nombre del gráfico: título de la tabla y parte del nombre accesible del botón. */
  label: string
  /** Cabecera de la primera columna (la que nombra cada fila). */
  firstColumn: string
  /** Cabeceras de las columnas de valores. */
  columns: string[]
  /** Filas de la tabla. */
  rows: ChartTableRow[]
  /** Clase del botón, para alinearlo en el contenedor del gráfico. */
  className?: string
}

/**
 * Alternativa tabular de un gráfico: la tabla siempre está en el DOM (los lectores de pantalla la leen) y el botón
 * «Ver como tabla» la muestra a todos. El texto visible del botón es el mismo en todos los gráficos; su nombre accesible
 * añade el del gráfico para que varios en una página no se confundan.
 */
export function ChartTable({ id, label, firstColumn, columns, rows, className }: ChartTableProps) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <button
        type="button"
        className={cx(styles.toggle, className)}
        aria-expanded={visible}
        aria-controls={id}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? 'Ocultar tabla' : 'Ver como tabla'} <span className="visually-hidden">de {label}</span>
      </button>
      <div id={id} className={cx(styles.wrap, !visible && 'visually-hidden')}>
        <table className={styles.table}>
          <caption className={styles.caption}>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{firstColumn}</th>
              {columns.map((column, index) => (
                <th key={index} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.header}</th>
                {row.cells.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
