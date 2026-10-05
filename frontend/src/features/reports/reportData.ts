import type {
  ParameterReportPeriod as ReportPeriod,
  ReportAgent,
  ReportChannel,
  ReportDay,
  ReportRange,
  TicketChannel,
} from '../../api/schema'
import type { BarChartPoint, MetricTrend } from '../../components/ui'
import { memberStatusLabels } from '../../domain/member'
import { toCsv } from './csv'

export const channelLabels: Record<TicketChannel, string> = {
  email: 'Correo',
  chat: 'Chat',
  phone: 'Teléfono',
  web: 'Web',
}

const integer = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })

export interface CountComparison {
  /** Frase que se explica sola: no depende de la flecha ni del color. */
  text: string
  arrow: '↑' | '↓' | null
  trend: MetricTrend
}

/**
 * Compara un recuento con el del periodo anterior, que el servidor mide con la misma duración transcurrida. La
 * diferencia es siempre absoluta; el porcentaje solo existe si el periodo anterior tuvo alguno (con 0 no hay base) y si
 * no redondea a 0. La tendencia es neutra: que lleguen más solicitudes no es bueno ni malo por sí mismo.
 */
export function compareCount(value: number, previous: number, days: number): CountComparison {
  const reference = `frente a los ${days} días anteriores`
  const difference = value - previous
  if (difference === 0) return { text: `Sin cambios ${reference}`, arrow: null, trend: 'neutral' }
  const rounded = previous > 0 ? Math.round((Math.abs(difference) / previous) * 100) : 0
  const percent = rounded > 0 ? ` (${integer.format(rounded)} %)` : ''
  const amount = Math.abs(difference)
  return {
    text: `${amount} ${difference > 0 ? 'más' : 'menos'}${percent} ${reference}`,
    arrow: difference > 0 ? '↑' : '↓',
    trend: 'neutral',
  }
}

/**
 * «N % de las creadas»: resueltos entre creados del periodo, o `null` si no se creó ninguno. Puede pasar de 100 %:
 * entre los resueltos hay tickets creados antes del periodo.
 */
export function resolvedShare(resolved: number, created: number): string | null {
  return created > 0 ? `${integer.format(Math.round((resolved / created) * 100))} % de las creadas` : null
}

export const formatMinutes = (minutes: number | null) => (minutes === null ? 'Sin datos' : `${minutes} min`)
export const formatHours = (hours: number | null) => (hours === null ? 'Sin datos' : `${decimal.format(hours)} h`)

/** Valor y porcentaje de un canal: «71,4 % · 30 tickets». */
export function channelValueText({ share, created }: ReportChannel): string {
  return `${decimal.format(share)} % · ${created === 1 ? '1 ticket' : `${created} tickets`}`
}

const weekdayInitials = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const longDay = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Las fechas de `byDay` son días de calendario de la organización, no instantes: se leen como UTC para no desplazarlas. */
function calendarDate(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export interface ChartData {
  points: BarChartPoint[]
  /** Con 90 días el gráfico agrega por semanas: 90 barras diarias no caben en móvil. */
  granularity: 'day' | 'week'
}

/** Más de 30 puntos diarios no caben en un móvil con dos series (ver los límites de `BarChart`). */
const MAX_DAILY_POINTS = 30
const WEEK = 7

/**
 * Puntos del gráfico a partir de `byDay`: uno por día hasta 30 días y uno por semana por encima, contando desde el
 * primer día del periodo (la última semana puede ser parcial y lo dice su rango). Los resueltos semanales suman los de
 * cada día, que cuenta un ticket por día en que se resolvió, así que pueden pasar de los «Resueltos» del periodo.
 */
export function chartData(days: ReportDay[]): ChartData {
  if (days.length <= MAX_DAILY_POINTS) {
    const daily = days.length <= WEEK
    return {
      granularity: 'day',
      points: days.map((day) => {
        const date = calendarDate(day.date)
        return {
          key: day.date,
          label: longDay.format(date),
          shortLabel: daily ? weekdayInitials[date.getUTCDay()] : String(date.getUTCDate()),
          values: { created: day.created, resolved: day.resolved },
        }
      }),
    }
  }
  const points: BarChartPoint[] = []
  for (let start = 0; start < days.length; start += WEEK) {
    const week = days.slice(start, start + WEEK)
    const first = calendarDate(week[0]!.date)
    const last = calendarDate(week[week.length - 1]!.date)
    points.push({
      key: week[0]!.date,
      label: week.length === 1 ? shortDay.format(first) : `${shortDay.format(first)} – ${shortDay.format(last)}`,
      shortLabel: shortDay.format(first),
      values: {
        created: week.reduce((sum, day) => sum + day.created, 0),
        resolved: week.reduce((sum, day) => sum + day.resolved, 0),
      },
    })
  }
  return { points, granularity: 'week' }
}

/** Sin ningún ticket creado ni resuelto, el gráfico serían barras vacías. */
export const hasActivity = (days: ReportDay[]) => days.some((day) => day.created > 0 || day.resolved > 0)

function dateParts(instant: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es', { ...options, timeZone }).formatToParts(new Date(instant))
}

/**
 * «28 sept 2026 – 4 oct 2026» en la zona indicada. `to` es el momento de la petición (truncado a segundos), así que
 * su día es hoy en la organización; `from` es el comienzo del primer día.
 */
export function formatRange(period: Pick<ReportRange, 'from' | 'to'>, timeZone: string): string {
  const format = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
  return `${format.format(new Date(period.from))} – ${format.format(new Date(period.to))}`
}

/** `reporte-agentes-<periodo>-<AAAA-MM-DD>.csv` con la fecha de `to` en la zona de la organización, no en UTC. */
export function csvFileName(period: ReportPeriod, to: string, timeZone: string): string {
  const part = (type: 'year' | 'month' | 'day') =>
    dateParts(to, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).find((p) => p.type === type)?.value
  return `reporte-agentes-${period}-${part('year')}-${part('month')}-${part('day')}.csv`
}

/** Etiqueta de estado que acompaña a quien no es del equipo activo; `null` para los activos. */
export const agentStatusLabel = (agent: ReportAgent): string | null =>
  agent.status === 'active' ? null : memberStatusLabels[agent.status]

/** CSV de la tabla de agentes con el estado de cada persona, para no mezclar sin marca a quienes ya no están. */
export function agentsCsv(agents: ReportAgent[]): string {
  return toCsv(
    ['Agente', 'Estado', 'Resueltos', 'Primera respuesta (min)', 'Asignados abiertos'],
    agents.map((agent) => [
      agent.member.name,
      memberStatusLabels[agent.status],
      agent.resolved,
      agent.firstResponseMinutes,
      agent.openAssigned,
    ]),
  )
}
