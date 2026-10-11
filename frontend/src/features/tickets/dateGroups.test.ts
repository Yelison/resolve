import { describe, expect, it } from 'vitest'
import { dayGroup, groupByDay } from './dateGroups'

const now = new Date('2026-10-10T03:30:00Z') // En Bogotá (UTC−5) todavía es el 9 de octubre, 22:30.

describe('dayGroup', () => {
  it('cuenta los días naturales de la zona de la organización, no los del navegador ni las 24 h', () => {
    // Hace 4 horas: ya es «ayer» en UTC, pero «hoy» en Bogotá.
    const lateYesterdayUtc = new Date('2026-10-09T23:30:00Z')
    expect(dayGroup(lateYesterdayUtc, now, 'UTC')).toBe('yesterday')
    expect(dayGroup(lateYesterdayUtc, now, 'America/Bogota')).toBe('today')
  })

  it('reparte ayer, esta semana y anteriores', () => {
    const at = (iso: string) => dayGroup(new Date(iso), now, 'America/Bogota')
    expect(at('2026-10-08T15:00:00Z')).toBe('yesterday')
    expect(at('2026-10-07T15:00:00Z')).toBe('week')
    expect(at('2026-10-03T15:00:00Z')).toBe('week')
    expect(at('2026-10-02T15:00:00Z')).toBe('older')
  })

  it('un instante futuro por desfase de reloj cuenta como hoy', () => {
    expect(dayGroup(new Date('2026-10-10T04:00:00Z'), now, 'UTC')).toBe('today')
  })
})

describe('groupByDay', () => {
  it('agrupa en secciones consecutivas con su etiqueta y omite las vacías', () => {
    const items = ['2026-10-09T20:00:00Z', '2026-10-09T10:00:00Z', '2026-10-08T10:00:00Z', '2026-09-01T10:00:00Z']
    const sections = groupByDay(items, (iso) => new Date(iso), now, 'America/Bogota')
    expect(sections.map((section) => [section.label, section.items.length])).toEqual([
      ['Hoy', 2],
      ['Ayer', 1],
      ['Anteriores', 1],
    ])
  })
})
