/** «1 h», «3 h»; desde 48 h pasa a días: «5 días». La duración se redondea hacia abajo. */
export function elapsedText(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000))
  if (minutes < 60) return minutes <= 1 ? '1 min' : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} días`
}

/** «1 día», «5 días». */
export function daysText(days: number): string {
  return days === 1 ? '1 día' : `${days} días`
}

/** «1 lleva más de 4 h», «9 llevan más de 4 h». */
export function overFourHours(count: number): string {
  return count === 1 ? '1 lleva más de 4 h' : `${count} llevan más de 4 h`
}
