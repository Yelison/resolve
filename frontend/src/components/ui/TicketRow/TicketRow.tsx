import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { TicketSummary } from '../../../domain/ticket'
import { cx } from '../../../lib/cx'
import { formatRelative } from '../../../lib/format'
import { Badge } from '../Badge/Badge'
import { IconButton } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { Menu, type MenuItem } from '../Menu/Menu'
import { ticketPriority, ticketStatus } from './ticketLabels'
import styles from './TicketRow.module.css'

export interface TicketTableSelection {
  /** Estado de «seleccionar todos»: marcado, parcial o vacío. */
  state: 'all' | 'some' | 'none'
  onToggleAll: () => void
}

export interface TicketTableProps {
  /** Nombre accesible de la tabla. */
  label: string
  /** Activa la columna de selección. Úsala solo si hay acciones para los tickets seleccionados. */
  selection?: TicketTableSelection
  children: ReactNode
  className?: string
}

/**
 * Tabla de tickets con semántica ARIA de tabla en cualquier ancho:
 * tarjetas en contenedores estrechos, columnas prioritarias en intermedios y tabla completa en anchos.
 */
export function TicketTable({ label, selection, children, className }: TicketTableProps) {
  return (
    <div role="table" aria-label={label} className={cx(styles.table, !selection && styles.plain, className)}>
      <div role="rowgroup">
        <div role="row" className={styles.header}>
          {selection && (
            <span role="columnheader" className={styles.check}>
              <Checkbox
                label="Seleccionar todos los tickets"
                hideLabel
                checked={selection.state === 'all'}
                indeterminate={selection.state === 'some'}
                onChange={selection.onToggleAll}
              />
            </span>
          )}
          <span role="columnheader" className={cx(styles.columnHeader, styles.subject)}>
            Asunto / cliente
          </span>
          <span role="columnheader" className={cx(styles.columnHeader, styles.status)}>
            Estado
          </span>
          <span role="columnheader" className={cx(styles.columnHeader, styles.priority)}>
            Prioridad
          </span>
          <span role="columnheader" className={cx(styles.columnHeader, styles.assigneeHeader)}>
            Responsable
          </span>
          <span role="columnheader" className={cx(styles.columnHeader, styles.updatedHeader)}>
            Actualizado
          </span>
          <span role="columnheader" className={styles.actions}>
            <span className="visually-hidden">Acciones</span>
          </span>
        </div>
      </div>
      <div role="rowgroup" className={styles.rows}>
        {children}
      </div>
    </div>
  )
}

export interface TicketRowProps {
  ticket: TicketSummary
  /** Ruta del detalle del ticket. */
  to: string
  /** Solo dentro de una TicketTable con selección. */
  selection?: { selected: boolean; onChange: (selected: boolean) => void }
  actions: MenuItem[]
  /** Fecha de referencia para el tiempo relativo; útil en pruebas. */
  now?: Date
}

export function TicketRow({ ticket, to, selection, actions, now }: TicketRowProps) {
  const status = ticketStatus[ticket.status]
  const priority = ticketPriority[ticket.priority]
  const updatedAt = new Date(ticket.updatedAt)
  const title = `#${ticket.number} ${ticket.subject}`

  return (
    <div role="row" className={cx(styles.row, selection?.selected && styles.selected)}>
      {selection && (
        <span role="cell" className={styles.check}>
          <Checkbox
            label={`Seleccionar ticket #${ticket.number}`}
            hideLabel
            checked={selection.selected}
            onChange={(event) => selection.onChange(event.target.checked)}
          />
        </span>
      )}
      <span role="cell" className={styles.subject}>
        <Link to={to} className={styles.subjectLink} title={title}>
          <span className={styles.number}>#{ticket.number}</span> {ticket.subject}
        </Link>
        <span className={styles.customer}>
          {ticket.customer.company ? `${ticket.customer.name} · ${ticket.customer.company}` : ticket.customer.name}
        </span>
      </span>
      <span role="none" className={styles.meta}>
        <span role="cell" className={styles.status}>
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
        <span role="cell" className={cx(styles.priority, ticket.priority === 'urgent' && styles.urgent)}>
          {priority.label}
        </span>
        <span role="cell" className={styles.assignee}>
          {ticket.assignee?.name ?? 'Sin asignar'}
        </span>
        <span role="cell" className={styles.updated}>
          <time dateTime={updatedAt.toISOString()}>{formatRelative(updatedAt, now)}</time>
        </span>
      </span>
      <span role="cell" className={styles.actions}>
        {actions.length > 0 && (
          <Menu label={`Acciones del ticket #${ticket.number}`} items={actions}>
            {(trigger) => <IconButton icon="more" label={`Acciones del ticket #${ticket.number}`} {...trigger} />}
          </Menu>
        )}
      </span>
    </div>
  )
}
