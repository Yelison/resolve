import type {
  ParameterReportPeriod as ReportPeriod,
  ReportAgent,
  ReportChannel,
  ReportDay,
  ReportRange,
  TicketChannel,
} from '../../api/schema'
import type {
  BarChartPoint,
  DonutColor,
  DonutSegment,
  DotPlotRow,
  LineChartPoint,
  MetricTrend,
} from '../../components/ui'
import { memberStatusLabels } from '../../domain/member'
import { formatWeekdayShort } from '../../lib/format'
import { toCsv } from './csv'

export const channelLabels: Record<TicketChannel, string> = {
  email: 'Correo',
  chat: 'Chat',
  phone: 'Teléfono',
  web: 'Web',
}

export const integer = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })
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
  const amount = integer.format(Math.abs(difference))
  return {
    text: `${amount} ${difference > 0 ? 'más' : 'menos'}${percent} ${reference}`,
    arrow: difference > 0 ? '↑' : '↓',
    trend: 'neutral',
  }
}

/**
 * «N resueltos por cada 100 creados»: cociente entre los resueltos y los creados del periodo, o `null` si no se creó
 * ninguno. Puede pasar de 100: entre los resueltos hay tickets creados antes del periodo, así que no es un subconjunto
 * de los creados y no se redacta como «% de las creadas».
 */
export function resolvedShare(resolved: number, created: number): string | null {
  return created > 0 ? `${integer.format(Math.round((resolved / created) * 100))} resueltos por cada 100 creados` : null
}

export const formatMinutes = (minutes: number | null) =>
  minutes === null ? 'Sin datos' : `${integer.format(minutes)} min`
export const formatHours = (hours: number | null) => (hours === null ? 'Sin datos' : `${decimal.format(hours)} h`)

/** Valor y porcentaje de un canal: «71,4 % · 30 tickets». */
export function channelValueText({ share, created }: ReportChannel): string {
  return `${decimal.format(share)} % · ${created === 1 ? '1 ticket' : `${integer.format(created)} tickets`}`
}

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
          shortLabel: daily ? formatWeekdayShort(date) : String(date.getUTCDate()),
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

/**
 * Color de cada canal en los gráficos. Va con la entidad y no con su puesto: «Correo» es siempre la serie 1 aunque el
 * canal con más volumen cambie de un periodo a otro.
 */
export const channelColors: Record<TicketChannel, DonutColor> = { email: 1, chat: 2, phone: 3, web: 4 }

/** Segmentos del anillo de canales y su total, en el orden en que llegan (de mayor a menor volumen). */
export function channelSegments(channels: ReportChannel[]): { segments: DonutSegment[]; total: number } {
  return {
    segments: channels.map((channel) => ({
      id: channel.channel,
      label: channelLabels[channel.channel],
      value: channel.created,
      color: channelColors[channel.channel],
      valueText: channelValueText(channel),
    })),
    total: channels.reduce((sum, channel) => sum + channel.created, 0),
  }
}

/** Valor con signo explícito y menos tipográfico: «+10», «0», «−3». */
export const signedInteger = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + integer.format(Math.abs(n))

/** «+10 pendientes», «0 pendientes», «−1 pendiente»: lo que se acumula respecto al comienzo del periodo. */
export const pendingText = (n: number) => `${signedInteger(n)} ${Math.abs(n) === 1 ? 'pendiente' : 'pendientes'}`

/** Solicitudes menos resueltos acumulados día a día: lo que el periodo suma (o resta) a los pendientes con que empezó. */
export function cumulativePending(days: ReportDay[]): number[] {
  let total = 0
  return days.map((day) => (total += day.created - day.resolved))
}

/** Puntos de la línea de pendientes acumulados: uno por día, con la etiqueta corta según cuántos haya. */
export function pendingPoints(days: ReportDay[]): LineChartPoint[] {
  const totals = cumulativePending(days)
  return days.map((day, index) => {
    const date = calendarDate(day.date)
    return {
      key: day.date,
      label: longDay.format(date),
      shortLabel:
        days.length <= WEEK
          ? formatWeekdayShort(date)
          : days.length <= MAX_DAILY_POINTS
            ? String(date.getUTCDate())
            : shortDay.format(date),
      value: totals[index] ?? 0,
    }
  })
}

export interface AgentResponses {
  /** Agentes con primera respuesta en el periodo, en el orden de la API. */
  rows: DotPlotRow[]
  /** Nombres de quienes no la tienen (`null`): no salen en el gráfico y se nombran en una nota. */
  missing: string[]
}

/** Separa a los agentes con primera respuesta de quienes no tienen: un `null` no es 0 minutos y no puede dibujarse. */
export function agentResponses(agents: ReportAgent[]): AgentResponses {
  const rows: DotPlotRow[] = []
  const missing: string[] = []
  for (const agent of agents) {
    if (agent.firstResponseMinutes === null) missing.push(agent.member.name)
    else rows.push({ key: agent.member.id, label: agent.member.name, value: agent.firstResponseMinutes })
  }
  return { rows, missing }
}

const names = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' })

/** «Sin primeras respuestas en el periodo: Ana, Luis y Marta.» */
export const missingResponsesNote = (missing: string[]) =>
  `Sin primeras respuestas en el periodo: ${names.format(missing)}.`
