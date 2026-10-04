import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './Timeline.module.css'

export type TimelineEventKind = 'assignment' | 'status' | 'comment'

const icons: Record<TimelineEventKind, IconName> = {
  assignment: 'team',
  status: 'check',
  comment: 'file',
}

export interface TimelineEvent {
  id: string
  kind: TimelineEventKind
  title: ReactNode
  /** Fecha del evento y su texto visible, p. ej. «Hoy · 10:24». */
  at: Date
  timeLabel: string
}

export interface TimelineProps {
  events: TimelineEvent[]
  className?: string
}

export function Timeline({ events, className }: TimelineProps) {
  return (
    <ol className={cx(styles.timeline, className)}>
      {events.map((event) => (
        <li key={event.id} className={styles.event}>
          <Icon name={icons[event.kind]} className={styles.icon} />
          <div className={styles.text}>
            <p className={styles.title}>{event.title}</p>
            <time className={styles.time} dateTime={event.at.toISOString()}>
              {event.timeLabel}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
