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

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

/** Hora local en formato 24 h: 10:24. */
export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/** Tiempo relativo breve: «hace 5 minutos», «ayer». */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return relativeFormat.format(0, 'minute')
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Fecha y hora breves en la zona del navegador: «Hoy, 10:24», «Ayer, 10:24», «3 oct, 10:24». */
export function formatDateTime(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const time = formatTime(date)
  if (days === 0) return `Hoy, ${time}`
  if (days === 1) return `Ayer, ${time}`
  const day = date.getFullYear() === now.getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date)
  return `${day}, ${time}`
}
