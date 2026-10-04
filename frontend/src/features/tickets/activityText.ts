import { ticketPriority, ticketStatus } from '../../components/ui'
import type { TimelineEvent } from '../../components/ui'
import type { Activity } from '../../domain/ticket'
import { formatDateTime } from '../../lib/format'

/** Frase del historial para cada tipo de evento del contrato. */
export function activityTitle(activity: Activity): string {
  const actor = activity.actor.name
  switch (activity.type) {
    case 'created':
      return `${actor} creó el ticket`
    case 'status_changed':
      return `${actor} cambió el estado a ${ticketStatus[activity.to].label}`
    case 'priority_changed':
      return `${actor} cambió la prioridad a ${ticketPriority[activity.to].label}`
    case 'assignee_changed':
      return activity.to ? `${actor} asignó el ticket a ${activity.to.name}` : `${actor} quitó el responsable`
  }
}

export function toTimelineEvent(activity: Activity, now?: Date): TimelineEvent {
  const at = new Date(activity.createdAt)
  return {
    id: activity.id,
    kind: activity.type === 'assignee_changed' ? 'assignment' : activity.type === 'created' ? 'comment' : 'status',
    title: activityTitle(activity),
    at,
    timeLabel: formatDateTime(at, now),
  }
}
