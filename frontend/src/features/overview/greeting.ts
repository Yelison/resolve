/** Hora del día (0–23) en la zona indicada: la de la organización, no la del navegador. */
function hourIn(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)
  return Number(hour)
}

/** «Buenos días» de 05:00 a 11:59, «Buenas tardes» hasta las 19:59 y «Buenas noches» el resto. */
export function greetingFor(now: Date, timeZone: string): string {
  const hour = hourIn(now, timeZone)
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** «Sábado, 10 de octubre» (el día de la zona de la organización, con la inicial en mayúscula). */
export function formatToday(now: Date, timeZone: string): string {
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(now)
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1)
}
