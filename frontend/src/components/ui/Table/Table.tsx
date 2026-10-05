import { useId, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Table.module.css'

export interface TableProps {
  /** Nombre accesible de la tabla. */
  label: string
  /** Texto visible bajo la tabla, p. ej. «Mostrando 5 resultados»; también la describe. */
  caption: string
  /** Texto solo para lectores de pantalla de la última columna, la de acciones (p. ej. «Acciones»). */
  actionsLabel: string
  /** Un `TableHeaderCell` por columna de datos. */
  header: ReactNode
  /** Un `TableRow` por fila. */
  children: ReactNode
  /** Clase del contenedor de la tabla y su leyenda, donde cada feature declara las columnas y áreas de cada tramo (ver `Table.module.css`). */
  className?: string
}

/**
 * Tabla con semántica ARIA de tabla en cualquier ancho. La disposición depende del ancho del contenedor: tarjetas por
 * debajo de 560 px, columnas prioritarias de 768 a 1199 px y la tabla completa solo desde 1200 px de viewport con un
 * contenedor de al menos 860 px (mide ~894 px a 1200 px con el sidebar expandido).
 *
 * Cada feature conserva sus columnas y declara su rejilla con custom properties en `className`:
 * `--table-areas-card`, `--table-columns-mid`, `--table-areas-mid`, `--table-columns-wide` y `--table-areas-wide`
 * (opcionales: `--table-header-areas-mid` y `--table-caption-end`). Las áreas `name` y `actions` las usa el compartido.
 */
export function Table({ label, caption, actionsLabel, header, children, className }: TableProps) {
  const captionId = useId()
  return (
    <div className={cx(styles.wrapper, className)}>
      <div role="table" aria-label={label} aria-describedby={captionId} className={styles.table}>
        <div role="rowgroup">
          <div role="row" className={styles.header}>
            {header}
            <TableHeaderCell area="actions">
              <span className="visually-hidden">{actionsLabel}</span>
            </TableHeaderCell>
          </div>
        </div>
        <div role="rowgroup" className={styles.rows}>
          {children}
        </div>
      </div>
      <p id={captionId} className={styles.caption}>
        {caption}
      </p>
    </div>
  )
}

export interface TableHeaderCellProps {
  /** Área de la rejilla de la columna. */
  area: string
  /** Texto de la cabecera. */
  children: ReactNode
  /** Clase adicional de la celda. */
  className?: string
}

export function TableHeaderCell({ area, children, className }: TableHeaderCellProps) {
  return (
    <span role="columnheader" className={className} style={{ gridArea: area } as CSSProperties}>
      {children}
    </span>
  )
}

export interface TableRowProps {
  /** Celdas de la fila. */
  children: ReactNode
}

/** Tarjeta en contenedores estrechos, fila de la tabla en el resto. */
export function TableRow({ children }: TableRowProps) {
  return (
    <div role="row" className={styles.row}>
      {children}
    </div>
  )
}

export interface TableCellProps {
  /** `name` es la celda principal de la fila y `actions` la del menú, alineada al final. */
  kind: 'name' | 'actions'
  /** Contenido de la celda. */
  children: ReactNode
  /** Clase adicional de la celda. */
  className?: string
}

export function TableCell({ kind, children, className }: TableCellProps) {
  return (
    <span role="cell" className={cx(styles[kind], className)}>
      {children}
    </span>
  )
}
