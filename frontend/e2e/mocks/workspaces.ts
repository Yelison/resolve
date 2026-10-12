import type { NewOrganization, OrganizationColor } from '../../src/api/schema'

/** Cuántos espacios puede haber creado una persona y seguir en ellos (`resolve.organizations.per-person-limit`). */
export const ORGANIZATION_LIMIT = 3

const MAX_NAME = 120

/** Las 8 claves de color en el orden del contrato: un espacio nuevo toma `keys[último byte de su id mod 8]`. */
const colorKeys: readonly OrganizationColor[] = [
  'blue',
  'green',
  'magenta',
  'orange',
  'violet',
  'teal',
  'brick',
  'slate',
]

/** Como el servidor: el color sale del último byte del id, así los espacios nuevos se reparten por la paleta. */
export function colorOfId(id: string): OrganizationColor {
  const lastByte = Number.parseInt(id.replaceAll('-', '').slice(-2), 16)
  return colorKeys[(Number.isNaN(lastByte) ? 0 : lastByte) % colorKeys.length]!
}

/** Una zona que el servidor real rechazaría aunque el navegador la conozca: sirve de ejemplo del `400` por campo. */
export const REJECTED_TIME_ZONE = 'Pacific/Honolulu'

/** Aproxima «una región IANA que PostgreSQL también conoce»: con nombre de región (o `UTC`) y conocida por el motor. */
function isKnownZone(zone: string) {
  if (zone !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)+$/.test(zone)) return false
  if (zone === REJECTED_TIME_ZONE) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export type FieldError = { field: string; message: string }

/** Los errores por campo de `POST /organizations`, con las reglas del contrato (el nombre se recorta antes de medirlo). */
export function organizationErrors(body: Partial<NewOrganization> | null): FieldError[] {
  const errors: FieldError[] = []
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) errors.push({ field: 'name', message: 'Escribe un nombre para el espacio.' })
  else if (name.length > MAX_NAME) errors.push({ field: 'name', message: `Usa como máximo ${MAX_NAME} caracteres.` })
  if (typeof body?.timeZone !== 'string' || !isKnownZone(body.timeZone)) {
    errors.push({ field: 'timeZone', message: 'Zona horaria no reconocida por el servidor.' })
  }
  return errors
}

/** Un UUID con la forma del real; el servidor usa UUIDv7, pero solo importa el último byte para el color. */
export const newOrganizationId = () => crypto.randomUUID()
