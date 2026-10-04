import { describe, expect, it } from 'vitest'
import { formatBytes, formatDateTime, formatRelative } from './format'

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
