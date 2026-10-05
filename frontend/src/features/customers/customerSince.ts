/** Fecha de alta para el subtítulo («1 de septiembre de 2026»), en la zona horaria de la organización. */
export function customerSince(createdAt: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(
    new Date(createdAt),
  )
}
