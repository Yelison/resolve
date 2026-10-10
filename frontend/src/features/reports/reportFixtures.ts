import type { ReportAgent, ReportDay, ReportResolutionBucket, ReportSummary, ReportWeekdayHour } from '../../api/schema'

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

/** Seis tramos fijos y en orden; por defecto suman 300, igual que `resolved` de `reportSummary`. */
export const reportResolutionTimes = (
  counts: [number, number, number, number, number, number] = [24, 96, 78, 54, 36, 12],
): ReportResolutionBucket[] => {
  const buckets = ['under1h', 'from1To4h', 'from4To8h', 'from8To24h', 'from1To3d', 'over3d'] as const
  return buckets.map((bucket, index) => ({ bucket, resolved: counts[index]! }))
}

/** Celdas dispersas (día ISO y hora local) que suman 361, igual que `created` de `reportSummary`. */
export const reportWeekdayHours = (): ReportWeekdayHour[] => [
  { weekday: 1, hour: 9, created: 60 },
  { weekday: 1, hour: 10, created: 52 },
  { weekday: 2, hour: 9, created: 47 },
  { weekday: 2, hour: 14, created: 41 },
  { weekday: 3, hour: 11, created: 55 },
  { weekday: 4, hour: 15, created: 38 },
  { weekday: 5, hour: 10, created: 44 },
  { weekday: 7, hour: 11, created: 24 },
]

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
  openByStatus: { open: 9, inProgress: 14, waiting: 5 },
  openByPriority: { urgent: 2, high: 8, medium: 13, low: 5 },
  resolutionTimes: reportResolutionTimes(),
  createdByWeekdayHour: reportWeekdayHours(),
  ...overrides,
})
