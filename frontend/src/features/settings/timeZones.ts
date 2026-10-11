export interface TimeZoneGroup {
  /** Región en español: «América», «Europa»… */
  label: string
  zones: { id: string; label: string }[]
}

const regionLabels: Record<string, string> = {
  Africa: 'África',
  America: 'América',
  Antarctica: 'Antártida',
  Arctic: 'Ártico',
  Asia: 'Asia',
  Atlantic: 'Atlántico',
  Australia: 'Australia',
  Europe: 'Europa',
  Indian: 'Índico',
  Pacific: 'Pacífico',
}

const OTHER = 'Otras'

/**
 * Nombre en español de las ciudades que lo tienen distinto (con tilde o traducido). `Intl` da el desfase de una zona
 * pero no el nombre de su ciudad, así que se mantiene esta tabla pequeña; el resto usa el nombre del identificador.
 * Lleva los dos identificadores de las zonas que renombró la IANA: el moderno (`Asia/Kolkata`) y el de CLDR, que es el
 * que lista Chromium (`Asia/Calcutta`).
 */
const cityNames: Record<string, string> = {
  'Africa/Cairo': 'El Cairo',
  'Africa/Ceuta': 'Ceuta',
  'Africa/Johannesburg': 'Johannesburgo',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Buenos_Aires': 'Buenos Aires',
  'America/Catamarca': 'Catamarca',
  'America/Cordoba': 'Córdoba',
  'America/Jujuy': 'Jujuy',
  'America/Mendoza': 'Mendoza',
  'America/Argentina/Catamarca': 'Catamarca',
  'America/Argentina/Cordoba': 'Córdoba',
  'America/Argentina/Jujuy': 'Jujuy',
  'America/Argentina/La_Rioja': 'La Rioja',
  'America/Argentina/Mendoza': 'Mendoza',
  'America/Argentina/Rio_Gallegos': 'Río Gallegos',
  'America/Argentina/Salta': 'Salta',
  'America/Argentina/San_Juan': 'San Juan',
  'America/Argentina/San_Luis': 'San Luis',
  'America/Argentina/Tucuman': 'Tucumán',
  'America/Argentina/Ushuaia': 'Ushuaia',
  'America/Asuncion': 'Asunción',
  'America/Bogota': 'Bogotá',
  'America/Cancun': 'Cancún',
  'America/Chicago': 'Chicago',
  'America/Chihuahua': 'Chihuahua',
  'America/Costa_Rica': 'Costa Rica',
  'America/Denver': 'Denver',
  'America/El_Salvador': 'El Salvador',
  'America/Guatemala': 'Guatemala',
  'America/Hermosillo': 'Hermosillo',
  'America/Havana': 'La Habana',
  'America/Los_Angeles': 'Los Ángeles',
  'America/Matamoros': 'Matamoros',
  'America/Mazatlan': 'Mazatlán',
  'America/Mexico_City': 'Ciudad de México',
  'America/Monterrey': 'Monterrey',
  'America/New_York': 'Nueva York',
  'America/Merida': 'Mérida',
  'America/Panama': 'Panamá',
  'America/Puerto_Rico': 'Puerto Rico',
  'America/Santo_Domingo': 'Santo Domingo',
  'America/Sao_Paulo': 'São Paulo',
  'America/Tijuana': 'Tijuana',
  'America/Toronto': 'Toronto',
  'Asia/Calcutta': 'Calcuta',
  'Asia/Dubai': 'Dubái',
  'Asia/Katmandu': 'Katmandú',
  'Asia/Kathmandu': 'Katmandú',
  'Asia/Rangoon': 'Rangún',
  'Asia/Saigon': 'Ho Chi Minh',
  'Atlantic/Canary': 'Canarias',
  'Asia/Kolkata': 'Calcuta',
  'Asia/Seoul': 'Seúl',
  'Asia/Singapore': 'Singapur',
  'Asia/Tokyo': 'Tokio',
  'Europe/Athens': 'Atenas',
  'Europe/Berlin': 'Berlín',
  'Europe/Brussels': 'Bruselas',
  'Europe/Copenhagen': 'Copenhague',
  'Europe/Dublin': 'Dublín',
  'Europe/Istanbul': 'Estambul',
  'Europe/Kiev': 'Kiev',
  'Europe/Kyiv': 'Kiev',
  'Europe/Lisbon': 'Lisboa',
  'Europe/London': 'Londres',
  'Europe/Moscow': 'Moscú',
  'Europe/Paris': 'París',
  'Europe/Prague': 'Praga',
  'Europe/Rome': 'Roma',
  'Europe/Vienna': 'Viena',
  'Europe/Warsaw': 'Varsovia',
  'Europe/Zurich': 'Zúrich',
  'Pacific/Auckland': 'Auckland',
}

/** Los formateadores son caros de construir (hay ~420 zonas): uno por zona. `null` si el navegador no la conoce. */
const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatterFor(id: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(id)
  if (cached !== undefined) return cached
  let formatter: Intl.DateTimeFormat | null = null
  try {
    formatter = new Intl.DateTimeFormat('en', { timeZone: id, timeZoneName: 'shortOffset' })
  } catch {
    // Una zona que el navegador no conoce (solo la sabe el servidor) se muestra sin desfase.
  }
  formatters.set(id, formatter)
  return formatter
}

/**
 * Desfase de la zona respecto a GMT en el instante `at`, con el signo menos tipográfico: «GMT−5», «GMT+5:30», «GMT» en
 * el meridiano. Se calcula cada vez (solo se cachea el formateador) porque cambia con el horario de verano.
 */
function offsetOf(id: string, at: Date): string {
  const parts = formatterFor(id)?.formatToParts(at)
  return (parts?.find((part) => part.type === 'timeZoneName')?.value ?? '').replace('-', '\u2212')
}

/** Nombre legible de la zona, con tildes: «Bogotá», «Ciudad de México», «Argentina/Buenos Aires» si no tiene el suyo. */
function cityOf(id: string): string {
  const known = cityNames[id]
  if (known) return known
  const slash = id.indexOf('/')
  return (slash === -1 ? id : id.slice(slash + 1)).replaceAll('_', ' ')
}

/** Zona legible con su desfase: «Bogotá (GMT−5)». `UTC` ya lo dice todo y va sin desfase. */
export function timeZoneLabel(id: string, at: Date = new Date()): string {
  const offset = id === 'UTC' ? '' : offsetOf(id, at)
  return offset ? `${cityOf(id)} (${offset})` : cityOf(id)
}

/** Zonas que conoce el navegador; sin `Intl.supportedValuesOf` (navegadores antiguos) solo queda la actual. */
function supportedZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

/**
 * Zonas horarias agrupadas por región para un `Select`. La zona `current` siempre está: si el navegador no la lista
 * (p. ej. `UTC` en algunos motores o una zona que solo conoce el servidor), el campo no puede mostrar otra distinta
 * y guardar sin tocarlo la cambiaría sin querer.
 */
export function timeZoneGroups(
  current: string,
  zones: string[] = supportedZones(),
  at: Date = new Date(),
): TimeZoneGroup[] {
  const ids = zones.includes(current) ? zones : [...zones, current]
  const groups = new Map<string, TimeZoneGroup>()
  for (const id of [...ids].sort((a, b) => a.localeCompare(b, 'en'))) {
    const slash = id.indexOf('/')
    const region = slash === -1 ? OTHER : (regionLabels[id.slice(0, slash)] ?? OTHER)
    const group = groups.get(region) ?? { label: region, zones: [] }
    group.zones.push({ id, label: timeZoneLabel(id, at) })
    groups.set(region, group)
  }
  // Dentro de cada región, por el nombre que ve la persona.
  for (const group of groups.values()) group.zones.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  // «Otras» al final; las regiones, por orden alfabético en español.
  return [...groups.values()].sort((a, b) =>
    a.label === OTHER ? 1 : b.label === OTHER ? -1 : a.label.localeCompare(b.label, 'es'),
  )
}
