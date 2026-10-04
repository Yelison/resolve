import { useId, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { formatDateTime } from '../../../lib/format'
import { Avatar } from '../Avatar/Avatar'
import styles from './Message.module.css'

export type MessageKind = 'customer' | 'agent' | 'note'

const roleLabels: Record<MessageKind, string> = {
  customer: 'Cliente',
  agent: 'Agente',
  note: 'Nota interna',
}

export interface MessageProps {
  kind: MessageKind
  author: string
  sentAt: Date
  children: ReactNode
  /** Canal o aviso al pie, p. ej. «Correo electrónico». Las notas internas indican que solo las ve el equipo. */
  footer?: ReactNode
  /** Momento de referencia para «Hoy» y «Ayer»; útil en pruebas. */
  now?: Date
  className?: string
}

export function Message({ kind, author, sentAt, children, footer, now, className }: MessageProps) {
  const labelId = useId()
  const footerText = footer ?? (kind === 'note' ? 'Solo visible para el equipo' : undefined)

  return (
    <article className={cx(styles.message, kind === 'note' && styles.note, className)} aria-labelledby={labelId}>
      <header className={styles.header}>
        <Avatar name={author} size="small" decorative />
        <p id={labelId} className={styles.author}>
          {author} · {roleLabels[kind]}
        </p>
        <time className={styles.time} dateTime={sentAt.toISOString()}>
          {formatDateTime(sentAt, now)}
        </time>
      </header>
      <div className={styles.body}>{children}</div>
      {footerText && <p className={styles.footer}>{footerText}</p>}
    </article>
  )
}
