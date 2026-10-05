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
export function timeZoneGroups(current: string, zones: string[] = supportedZones()): TimeZoneGroup[] {
  const ids = zones.includes(current) ? zones : [...zones, current]
  const groups = new Map<string, TimeZoneGroup>()
  for (const id of [...ids].sort((a, b) => a.localeCompare(b, 'en'))) {
    const slash = id.indexOf('/')
    const region = slash === -1 ? OTHER : (regionLabels[id.slice(0, slash)] ?? OTHER)
    const label = (slash === -1 ? id : id.slice(slash + 1)).replaceAll('_', ' ')
    const group = groups.get(region) ?? { label: region, zones: [] }
    group.zones.push({ id, label })
    groups.set(region, group)
  }
  // «Otras» al final; las regiones, por orden alfabético en español.
  return [...groups.values()].sort((a, b) =>
    a.label === OTHER ? 1 : b.label === OTHER ? -1 : a.label.localeCompare(b.label, 'es'),
  )
}
