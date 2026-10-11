import { Link, type To } from 'react-router'
import type { ReactNode } from 'react'
import { Badge, skeletonBarClassName, ticketStatus } from '../../components/ui'
import type { TicketSummary } from '../../domain/ticket'
import { cx } from '../../lib/cx'
import { formatRelative } from '../../lib/format'
import { customerStatusLabels, firstName, lastMessageAuthor } from './inboxText'
import styles from './InboxItem.module.css'

export interface InboxItemProps {
  ticket: TicketSummary
  /** Destino del enlace: la selección en la bandeja de dos paneles o el detalle cuando no hay vista previa. */
  to: To
  /** Es el ticket abierto en la vista previa. */
  selected?: boolean
  /** Quien mira es un cliente: lee «Te atiende Laura» en lugar del cliente y el responsable. */
  customerView?: boolean
  /** Es la única parada de Tab de la lista; las demás filas se alcanzan con las flechas. */
  tabStop?: boolean
  /** Menú de acciones de la fila (solo cuando no hay vista previa con sus propios controles). */
  actions?: ReactNode
  /** Fecha de referencia para el tiempo relativo; útil en pruebas. */
  now?: Date
  /** Zona IANA con la que se cuentan los días de «ayer». */
  timeZone?: string
}

/**
 * Fila de la bandeja: cliente y empresa, hora relativa, `#número · asunto`, extracto del último mensaje, estado y
 * responsable. En móvil es una tarjeta que envuelve los textos; desde 768 px, una fila de una línea por dato con «…»
 * y el texto completo en `title` y en la vista previa.
 */
export function InboxItem({
  ticket,
  to,
  selected = false,
  customerView = false,
  tabStop = true,
  actions,
  now,
  timeZone,
}: InboxItemProps) {
  const status = ticketStatus[ticket.status]
  const urgent = !customerView && ticket.priority === 'urgent' && ticket.status !== 'resolved'
  const updatedAt = new Date(ticket.updatedAt)
  const assigneeName = ticket.assignee?.name
  const who = customerView
    ? (assigneeName ?? 'Soporte')
    : ticket.customer.company
      ? `${ticket.customer.name} · ${ticket.customer.company}`
      : ticket.customer.name
  const assignee = customerView
    ? assigneeName
      ? `Te atiende ${firstName(assigneeName)}`
      : 'Pendiente de asignar'
    : (assigneeName ?? 'Sin asignar')
  const author = customerView ? lastMessageAuthor(ticket) : undefined
  const excerpt = ticket.lastMessage
    ? author
      ? `${author}: ${ticket.lastMessage.excerpt}`
      : ticket.lastMessage.excerpt
    : null
  const note = !customerView && ticket.lastMessage?.internal

  return (
    <li className={cx(styles.item, selected && styles.selected)}>
      <Link
        to={to}
        className={styles.link}
        data-inbox-item=""
        data-ticket-id={ticket.id}
        aria-current={selected ? 'true' : undefined}
        tabIndex={tabStop ? 0 : -1}
      >
        <span className={styles.top}>
          <span aria-hidden="true" className={cx(styles.dot, styles[urgent ? 'red' : status.tone])} />
          <span className={styles.who} title={who}>
            {who}
          </span>
          <time className={styles.time} dateTime={updatedAt.toISOString()}>
            {formatRelative(updatedAt, now, timeZone)}
          </time>
        </span>
        <span className={styles.subject} title={`#${ticket.number} · ${ticket.subject}`}>
          #{ticket.number} · {ticket.subject}
        </span>
        {excerpt && (
          <span className={styles.excerpt} title={excerpt}>
            {note && <span className={styles.note}>Nota interna: </span>}
            {excerpt}
          </span>
        )}
        <span className={styles.meta}>
          {urgent && <Badge tone="red">Urgente</Badge>}
          <Badge tone={status.tone}>{customerView ? customerStatusLabels[ticket.status] : status.label}</Badge>
          <span className={styles.assignee} title={assignee}>
            {assignee}
          </span>
        </span>
      </Link>
      {actions && <span className={styles.actions}>{actions}</span>}
    </li>
  )
}

/** Fila de carga con la estructura y las alturas de una fila real: al llegar los datos, nada se mueve. */
export function InboxItemGhost() {
  return (
    <li className={cx(styles.item, styles.ghost)} aria-hidden="true">
      <span className={styles.link}>
        <span className={styles.top}>
          <span className={cx(styles.who, skeletonBarClassName)}>{'\u00a0'}</span>
          <span className={cx(styles.time, skeletonBarClassName)}>{'\u00a0'.repeat(8)}</span>
        </span>
        <span className={cx(styles.subject, skeletonBarClassName)}>{'\u00a0'}</span>
        <span className={cx(styles.excerpt, skeletonBarClassName)}>{'\u00a0'}</span>
        <span className={styles.meta}>
          <span className={cx(styles.assignee, skeletonBarClassName)}>{'\u00a0'.repeat(24)}</span>
        </span>
      </span>
    </li>
  )
}
