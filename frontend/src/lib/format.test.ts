import { describe, expect, it } from 'vitest'
import { formatBytes, formatDateTime, formatRelative, formatWeekdayShort } from './format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [245_760, '240 KB'],
    [1_572_864, '1,5 MB'],
    [10 * 1024 * 1024, '10 MB'],
    [1_048_575, '1 MB'],
    [-1, '—'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-10-04T10:30:00Z')

  it.each([
    ['2026-10-04T10:29:50Z', 'este minuto'],
    ['2026-10-04T10:25:00Z', 'hace 5 minutos'],
    ['2026-10-04T08:30:00Z', 'hace 2 horas'],
    ['2026-10-03T10:30:00Z', 'ayer'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelative(new Date(date), now)).toBe(expected)
  })
})

describe('formatDateTime', () => {
  const now = new Date('2026-10-04T18:00:00Z')

  it.each([
    ['2026-10-04T10:24:00Z', 'Hoy, 10:24'],
    ['2026-10-03T10:24:00Z', 'Ayer, 10:24'],
    ['2026-09-28T10:24:00Z', '28 sept, 10:24'],
    ['2025-12-31T10:24:00Z', '31 dic 2025, 10:24'],
  ])('%s → %s', (date, expected) => {
    expect(formatDateTime(new Date(date), now)).toBe(expected)
  })
})

describe('formatDateTime en la zona de la organización', () => {
  // La suite corre con TZ=UTC: cualquier resultado distinto sale de `timeZone`, no del navegador.
  it('usa el día de la zona, no el del navegador', () => {
    const date = new Date('2026-10-04T05:30:00Z')
    expect(formatDateTime(date, date, 'America/Mexico_City')).toBe('Hoy, 23:30')
    expect(formatDateTime(date, new Date('2026-10-04T12:00:00Z'), 'America/Mexico_City')).toBe('Ayer, 23:30')
    expect(formatDateTime(date, new Date('2026-10-04T12:00:00Z'), 'Asia/Tokyo')).toBe('Hoy, 14:30')
    expect(formatDateTime(date, new Date('2026-10-04T12:00:00Z'), 'UTC')).toBe('Hoy, 05:30')
  })

  it('compara el año en la zona: 31 dic en Tokio ya es 1 ene del año siguiente', () => {
    const date = new Date('2025-12-31T20:00:00Z')
    expect(formatDateTime(date, new Date('2027-06-01T00:00:00Z'), 'Asia/Tokyo')).toBe('1 ene 2026, 05:00')
    // Mismo año en la zona (2026) aunque en el navegador (UTC) la fecha sea de 2025: no lleva año.
    expect(formatDateTime(date, new Date('2026-03-01T00:00:00Z'), 'Asia/Tokyo')).toBe('1 ene, 05:00')
    expect(formatDateTime(date, new Date('2026-01-01T12:00:00Z'), 'Asia/Tokyo')).toBe('Hoy, 05:00')
    expect(formatDateTime(date, new Date('2026-01-01T12:00:00Z'), 'UTC')).toBe('Ayer, 20:00')
  })

  it('cuenta días naturales en la entrada del horario de verano (2026-03-08, 23 h)', () => {
    const now = new Date('2026-03-08T16:00:00Z') // 12:00 EDT
    expect(formatDateTime(new Date('2026-03-08T06:00:00Z'), now, 'America/New_York')).toBe('Hoy, 01:00')
    expect(formatDateTime(new Date('2026-03-08T04:59:00Z'), now, 'America/New_York')).toBe('Ayer, 23:59')
    expect(formatDateTime(new Date('2026-03-06T05:00:00Z'), now, 'America/New_York')).toBe('6 mar, 00:00')
  })

  it('cuenta días naturales en la salida del horario de verano (2026-11-01, 25 h)', () => {
    const now = new Date('2026-11-01T23:30:00Z') // 18:30 EST
    expect(formatDateTime(new Date('2026-11-01T04:00:00Z'), now, 'America/New_York')).toBe('Hoy, 00:00')
    expect(formatDateTime(new Date('2026-11-01T05:30:00Z'), now, 'America/New_York')).toBe('Hoy, 01:30')
    expect(formatDateTime(new Date('2026-11-01T03:59:00Z'), now, 'America/New_York')).toBe('Ayer, 23:59')
  })

  it('sin zona usa la del navegador', () => {
    const date = new Date('2026-10-04T05:30:00Z')
    expect(formatDateTime(date, date)).toBe(formatDateTime(date, date, 'UTC'))
  })
})

describe('formatRelative en la zona de la organización', () => {
  it('el tiempo reciente sigue en horas y el día anterior natural dice «ayer»', () => {
    // 23:30 del día 3 en Ciudad de México; ahora son 00:30 del día 4 allí.
    const date = new Date('2026-10-04T05:30:00Z')
    const now = new Date('2026-10-04T06:30:00Z')
    expect(formatRelative(date, now, 'America/Mexico_City')).toBe('hace 1 hora')
    expect(formatRelative(new Date('2026-10-03T06:30:00Z'), now, 'America/Mexico_City')).toBe('ayer')
  })

  it('distingue ayer y anteayer según la zona', () => {
    const date = new Date('2026-10-02T22:00:00Z')
    const now = new Date('2026-10-04T10:00:00Z') // 36 h después
    expect(formatRelative(date, now, 'UTC')).toBe('anteayer')
    expect(formatRelative(date, now, 'Asia/Tokyo')).toBe('ayer') // 07:00 del 3 vs 19:00 del 4
    expect(formatRelative(date, now, 'America/Mexico_City')).toBe('anteayer') // 16:00 del 2 vs 04:00 del 4
    const early = new Date('2026-10-02T20:00:00Z') // 38 h antes de `now`
    expect(formatRelative(early, now, 'UTC')).toBe('anteayer')
    expect(formatRelative(early, now, 'Asia/Tokyo')).toBe('ayer') // 05:00 del 3 vs 19:00 del 4
  })

  it('cuenta días naturales a través de un cambio de horario', () => {
    // 47 h y 30 min: 00:30 EDT del 31 de octubre contra las 23:00 EST del 1 de noviembre (día de 25 h).
    const date = new Date('2026-10-31T04:30:00Z')
    const now = new Date('2026-11-02T04:00:00Z')
    expect(formatRelative(date, now, 'America/New_York')).toBe('ayer')
    expect(formatRelative(date, now, 'UTC')).toBe('anteayer')
  })

  it('un intervalo de 24 h dentro del mismo día de 25 h se cuenta en horas', () => {
    expect(formatRelative(new Date('2026-11-01T04:30:00Z'), new Date('2026-11-02T04:45:00Z'), 'America/New_York')).toBe(
      'hace 24 horas',
    )
  })
})

describe('formatWeekdayShort', () => {
  it('da tres letras por día, sin punto y con «mié» en lugar de «X»', () => {
    const week = [28, 29, 30, 1, 2, 3, 4].map((day, index) => new Date(Date.UTC(2026, index < 3 ? 8 : 9, day)))
    expect(week.map(formatWeekdayShort)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  })
})
