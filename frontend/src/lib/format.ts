const LOCALE = 'es'

const units = ['B', 'KB', 'MB', 'GB'] as const

/** Tamaño de archivo legible: 240 KB, 1,5 MB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  let value = bytes
  let unit = 0
  const digitsFor = (amount: number, index: number) => (index === 0 || amount >= 10 ? 0 : 1)
  const rounded = (amount: number, index: number) => {
    const factor = 10 ** digitsFor(amount, index)
    return Math.round(amount * factor) / factor
  }
  // Se redondea antes de elegir la unidad para que 1 048 575 B sea «1 MB» y no «1024 KB».
  while (rounded(value, unit) >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = digitsFor(value, unit)
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`
}

type Zone = string | undefined

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Los `Intl.DateTimeFormat` son caros de construir: uno por combinación de opciones y zona. */
function formatterFor(kind: string, options: Intl.DateTimeFormatOptions, timeZone: Zone): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone ?? ''}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

/** Hora en formato 24 h en la zona indicada (la del navegador por defecto): 10:24. */
export function formatTime(date: Date, timeZone?: string): string {
  return formatterFor('time', { hour: '2-digit', minute: '2-digit' }, timeZone).format(date)
}

/** Año, mes y día del calendario en la zona indicada, leídos de las partes formateadas, nunca de `getDate()`. */
function calendarDay(date: Date, timeZone: Zone): { year: number; month: number; day: number } {
  const parts = formatterFor('day', { year: 'numeric', month: 'numeric', day: 'numeric' }, timeZone).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

/** Días naturales de `later` sobre `earlier` en la zona indicada: 1 si `earlier` cayó ayer allí, aunque pasen menos de 24 h. */
function daysBetween(later: Date, earlier: Date, timeZone: Zone): number {
  const index = ({ year, month, day }: ReturnType<typeof calendarDay>) => Date.UTC(year, month - 1, day) / 86_400_000
  return index(calendarDay(later, timeZone)) - index(calendarDay(earlier, timeZone))
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/**
 * Tiempo relativo breve: «hace 5 minutos», «ayer». Los días se cuentan como días naturales de la zona indicada,
 * de modo que «ayer» coincide con el «Ayer» de `formatDateTime`.
 */
export function formatRelative(date: Date, now: Date = new Date(), timeZone?: string): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  if (Math.abs(seconds) >= 86_400 && Math.abs(seconds) < 2_592_000) {
    const days = -daysBetween(now, date, timeZone)
    // Un día de 25 h (fin del horario de verano) puede contener 24 h enteras: sigue siendo «hoy», se cuenta en horas.
    if (days !== 0) return relativeFormat.format(days, 'day')
  }
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return relativeFormat.format(0, 'minute')
}

const dayMonth: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
const dayMonthYear: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/**
 * Fecha y hora breves en la zona indicada (la del navegador por defecto): «Hoy, 10:24», «Ayer, 10:24»,
 * «3 oct, 10:24». «Hoy» y «Ayer» se deciden por día natural en esa zona.
 */
export function formatDateTime(date: Date, now: Date = new Date(), timeZone?: string): string {
  const days = daysBetween(now, date, timeZone)
  const time = formatTime(date, timeZone)
  if (days === 0) return `Hoy, ${time}`
  if (days === 1) return `Ayer, ${time}`
  const sameYear = calendarDay(date, timeZone).year === calendarDay(now, timeZone).year
  const day = sameYear
    ? formatterFor('dayMonth', dayMonth, timeZone).format(date)
    : formatterFor('dayMonthYear', dayMonthYear, timeZone).format(date)
  return `${day}, ${time}`
}
