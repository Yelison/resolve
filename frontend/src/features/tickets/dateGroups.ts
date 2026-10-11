/** Grupos por fecha de la bandeja, contados en días naturales de la zona horaria de la organización. */
export type DayGroup = 'today' | 'yesterday' | 'week' | 'older'

export const dayGroupLabels: Record<DayGroup, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  older: 'Anteriores',
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/** Índice de día de calendario (días desde 1970) de un instante en la zona indicada. */
function dayIndex(date: Date, timeZone: string): number {
  let formatter = dayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    dayFormatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
}

/** Hoy, ayer, los cinco días anteriores («esta semana») o antes: por día natural, no por 24 h. */
export function dayGroup(date: Date, now: Date, timeZone: string): DayGroup {
  const days = dayIndex(now, timeZone) - dayIndex(date, timeZone)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return 'week'
  return 'older'
}

export interface DayGroupSection<T> {
  group: DayGroup
  label: string
  items: T[]
}

/** Agrupa elementos ya ordenados por fecha descendente en secciones consecutivas; una sección vacía no aparece. */
export function groupByDay<T>(
  items: readonly T[],
  dateOf: (item: T) => Date,
  now: Date,
  timeZone: string,
): DayGroupSection<T>[] {
  const sections: DayGroupSection<T>[] = []
  for (const item of items) {
    const group = dayGroup(dateOf(item), now, timeZone)
    const last = sections.at(-1)
    if (last?.group === group) last.items.push(item)
    else sections.push({ group, label: dayGroupLabels[group], items: [item] })
  }
  return sections
}
