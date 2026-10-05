import type { ReportAgent, ReportDay, ReportSummary } from '../../api/schema'

const dayOf = (index: number) => new Date(Date.UTC(2026, 8, 28 + index)).toISOString().slice(0, 10)

export const reportDays = (count: number, created = [44, 61, 54, 72, 65, 35, 30]): ReportDay[] =>
  Array.from({ length: count }, (_, index) => ({
    date: dayOf(index),
    created: created[index % created.length] ?? 0,
    resolved: index % 3,
  }))

export const reportAgent = (overrides: Partial<ReportAgent> = {}): ReportAgent => ({
  member: { id: 'u-laura', name: 'Laura Méndez' },
  status: 'active',
  resolved: 20,
  firstResponseMinutes: 15,
  openAssigned: 4,
  ...overrides,
})

/** Informe de demostración (contrato de `getReportSummary`) con valores de prueba; `overrides` cambia lo que cada test necesita. */
export const reportSummary = (overrides: Partial<ReportSummary> = {}): ReportSummary => ({
  period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 7, timeZone: 'America/Bogota' },
  created: { value: 361, previous: 300 },
  resolved: { value: 300, previous: 280 },
  firstResponseMinutes: { value: 18, previous: 22, target: 30 },
  resolutionHours: { value: 6.5, previous: null },
  byDay: reportDays(7),
  byChannel: [
    { channel: 'email', created: 258, share: 71.5 },
    { channel: 'chat', created: 72, share: 19.9 },
    { channel: 'web', created: 31, share: 8.6 },
  ],
  byAgent: [
    reportAgent(),
    reportAgent({ member: { id: 'u-daniel', name: 'Daniel Santos' }, resolved: 12, firstResponseMinutes: null }),
    reportAgent({ member: { id: 'u-pablo', name: 'Pablo Viejo' }, status: 'removed', resolved: 3, openAssigned: 0 }),
    reportAgent({ member: { id: 'u-sofia', name: 'Sofía Ríos' }, status: 'invited', resolved: 1, openAssigned: 0 }),
  ],
  ...overrides,
})
