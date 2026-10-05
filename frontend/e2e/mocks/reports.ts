import type { ReportAgent, ReportSummary } from '../../src/api/schema'
import { daniel, json, laura, problem, type MockFeature } from './shared'

/**
 * Informe de demostración con el contrato de `getReportSummary` para cada periodo. El de 7 días conserva los mismos
 * `byDay` que usa el resumen; los demás derivan sus días con una serie fija para que las pruebas sean deterministas.
 */
const reportDays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
const dayAt = (daysBack: number) => new Date(Date.UTC(2026, 9, 4 - daysBack)).toISOString().slice(0, 10)
const reportAgent = (agent: Partial<ReportAgent> & Pick<ReportAgent, 'member'>): ReportAgent => ({
  status: 'active',
  resolved: 0,
  firstResponseMinutes: null,
  openAssigned: 0,
  ...agent,
})
const reportAgents: ReportAgent[] = [
  reportAgent({ member: laura, resolved: 128, firstResponseMinutes: 14, openAssigned: 1 }),
  reportAgent({ member: daniel, resolved: 112, firstResponseMinutes: 18, openAssigned: 1 }),
  reportAgent({
    member: { id: 'u-largo', name: 'Alejandra Fernández de la Fuente y Montenegro' },
    resolved: 40,
    firstResponseMinutes: 21,
  }),
  reportAgent({ member: { id: 'u-sofia', name: 'Sofía Ríos' }, status: 'invited', resolved: 2 }),
  reportAgent({
    member: { id: 'u-pablo', name: 'Pablo Viejo' },
    status: 'removed',
    resolved: 9,
    firstResponseMinutes: 45,
  }),
  // Un nombre que empieza como una fórmula: el CSV debe neutralizarlo.
  reportAgent({ member: { id: 'u-formula', name: '=Carlos, "Fórmula"' }, resolved: 1 }),
]
const reportSummaries: Record<'7d' | '30d' | '90d', ReportSummary> = {
  '7d': {
    period: { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 7, timeZone: 'America/Bogota' },
    created: { value: 361, previous: 300 },
    resolved: { value: 300, previous: 280 },
    firstResponseMinutes: { value: 18, previous: 22, target: 30 },
    resolutionHours: { value: 6.5, previous: null },
    byDay: reportDays.map((date, index) => ({ date, created: [44, 61, 54, 72, 65, 35, 30][index]!, resolved: 0 })),
    byChannel: [
      { channel: 'email', created: 258, share: 71.5 },
      { channel: 'chat', created: 72, share: 19.9 },
      { channel: 'web', created: 31, share: 8.6 },
    ],
    byAgent: reportAgents,
  },
  '30d': {
    period: { from: '2026-09-05T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 30, timeZone: 'America/Bogota' },
    created: { value: 1320, previous: 1210 },
    resolved: { value: 1180, previous: 1100 },
    firstResponseMinutes: { value: 41, previous: 36, target: 30 },
    resolutionHours: { value: 9, previous: 8.5 },
    byDay: Array.from({ length: 30 }, (_, index) => ({
      date: dayAt(29 - index),
      created: 30 + ((index * 7) % 25),
      resolved: 25 + ((index * 5) % 20),
    })),
    byChannel: [
      { channel: 'email', created: 700, share: 53 },
      { channel: 'chat', created: 330, share: 25 },
      { channel: 'phone', created: 200, share: 15.2 },
      { channel: 'web', created: 90, share: 6.8 },
    ],
    byAgent: reportAgents,
  },
  '90d': {
    period: { from: '2026-07-07T05:00:00Z', to: '2026-10-04T15:00:00Z', days: 90, timeZone: 'America/Bogota' },
    created: { value: 3900, previous: 0 },
    resolved: { value: 3500, previous: 0 },
    firstResponseMinutes: { value: null, previous: null, target: 30 },
    resolutionHours: { value: null, previous: null },
    byDay: Array.from({ length: 90 }, (_, index) => ({
      date: dayAt(89 - index),
      created: 20 + ((index * 11) % 45),
      resolved: 18 + ((index * 3) % 40),
    })),
    byChannel: [{ channel: 'email', created: 3900, share: 100 }],
    byAgent: reportAgents,
  },
}

/** Informes simulados por periodo (`7d`, `30d`, `90d`). */
export function reportsMock(): MockFeature {
  return {
    handle: ({ route, url, path, method }) => {
      if (method === 'GET' && path === '/reports/summary') {
        const period = url.searchParams.get('period') ?? '7d'
        const summary = reportSummaries[period as keyof typeof reportSummaries]
        return summary ? json(route, summary) : problem(route, 400, 'Datos no válidos')
      }
      return undefined
    },
  }
}
