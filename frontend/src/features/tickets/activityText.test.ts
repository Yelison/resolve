import { describe, expect, it } from 'vitest'
import type { Activity } from '../../domain/ticket'
import { activityTitle, toTimelineEvent } from './activityText'

const base = { id: 'a-1', actor: { id: 'u-1', name: 'Laura Méndez' }, createdAt: '2026-10-04T15:14:00Z' }

describe('activityTitle', () => {
  it.each<[Activity, string]>([
    [{ ...base, type: 'created' }, 'Laura Méndez creó el ticket'],
    [
      { ...base, type: 'status_changed', from: 'open', to: 'in_progress' },
      'Laura Méndez cambió el estado a En progreso',
    ],
    [{ ...base, type: 'priority_changed', from: 'low', to: 'urgent' }, 'Laura Méndez cambió la prioridad a Urgente'],
    [
      { ...base, type: 'assignee_changed', from: null, to: { id: 'u-2', name: 'Daniel Santos' } },
      'Laura Méndez asignó el ticket a Daniel Santos',
    ],
    [
      { ...base, type: 'assignee_changed', from: { id: 'u-2', name: 'Daniel Santos' }, to: null },
      'Laura Méndez quitó el responsable',
    ],
  ])('%#', (activity, title) => {
    expect(activityTitle(activity)).toBe(title)
  })
})

describe('toTimelineEvent', () => {
  it('elige el icono por tipo y formatea la fecha', () => {
    const event = toTimelineEvent(
      { ...base, type: 'assignee_changed', from: null, to: null },
      new Date('2026-10-04T18:00:00Z'),
    )
    expect(event.kind).toBe('assignment')
    expect(event.timeLabel).toBe('Hoy, 15:14')
  })

  it('formatea la fecha en la zona indicada', () => {
    const created = { ...base, type: 'created' as const, createdAt: '2026-10-04T05:30:00Z' }
    const now = new Date('2026-10-04T12:00:00Z')
    expect(toTimelineEvent(created, now, 'America/Mexico_City').timeLabel).toBe('Ayer, 23:30')
    expect(toTimelineEvent(created, now, 'Asia/Tokyo').timeLabel).toBe('Hoy, 14:30')
  })
})
