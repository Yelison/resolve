import type { ReportDay } from '../../api/schema'
import type { BarChartPoint, MetricTrend } from '../../components/ui'

export interface ResolvedComparison {
  /** Frase que se explica sola: no depende de la flecha ni del color. */
  text: string
  /** Flecha decorativa; `null` si no hay cambio. */
  arrow: '↑' | '↓' | null
  trend: MetricTrend
}

const percentFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })

/**
 * Compara los resueltos de hoy con los de ayer (ambos «hoy» y «ayer» de la zona de la organización, calculados por el
 * servidor). La diferencia siempre es absoluta; el porcentaje solo existe si ayer hubo alguno, porque con ayer = 0 no
 * hay base y sería infinito o inventado.
 */
export function compareResolved(today: number, yesterday: number): ResolvedComparison {
  const difference = today - yesterday
  if (difference === 0) return { text: 'Igual que ayer', arrow: null, trend: 'neutral' }
  const amount = Math.abs(difference)
  const percent = yesterday > 0 ? ` (${percentFormat.format(Math.round((amount / yesterday) * 100))} %)` : ''
  return difference > 0
    ? { text: `${amount} más que ayer${percent}`, arrow: '↑', trend: 'positive' }
    : { text: `${amount} menos que ayer${percent}`, arrow: '↓', trend: 'negative' }
}

/** «1 nuevo hoy», «8 nuevos hoy». */
export function newToday(count: number): string {
  return count === 1 ? '1 nuevo hoy' : `${count} nuevos hoy`
}

const weekdayInitials = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const dayLabel = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Puntos del gráfico a partir de `byDay`. La fecha del servidor es un día de calendario de la organización
 * (`2026-09-28`), no un instante: se interpreta como UTC para que el día de la semana no dependa de la zona del
 * navegador (`new Date('2026-09-28')` en Bogotá caería en el domingo).
 */
export function requestPoints(days: ReportDay[]): BarChartPoint[] {
  return days.map((day) => {
    const [year = 0, month = 1, date = 1] = day.date.split('-').map(Number)
    const utc = new Date(Date.UTC(year, month - 1, date))
    return {
      key: day.date,
      label: dayLabel.format(utc),
      shortLabel: weekdayInitials[utc.getUTCDay()],
      values: { created: day.created },
    }
  })
}
