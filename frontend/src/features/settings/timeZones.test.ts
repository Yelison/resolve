import { describe, expect, it } from 'vitest'
import { timeZoneGroups } from './timeZones'

describe('timeZoneGroups', () => {
  const zones = ['Europe/Madrid', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'Asia/Tokyo', 'UTC']

  it('agrupa por región con nombre en español y deja «Otras» al final', () => {
    const groups = timeZoneGroups('America/Bogota', zones)
    expect(groups.map((group) => group.label)).toEqual(['América', 'Asia', 'Europa', 'Otras'])
  })

  it('conserva el id exacto y muestra la ciudad sin guiones bajos', () => {
    const america = timeZoneGroups('America/Bogota', zones)[0]!
    expect(america.zones).toEqual([
      { id: 'America/Argentina/Buenos_Aires', label: 'Argentina/Buenos Aires' },
      { id: 'America/Bogota', label: 'Bogota' },
    ])
  })

  it('añade la zona actual si el navegador no la lista, para no mostrar otra distinta', () => {
    const groups = timeZoneGroups('Pacific/Kanton', zones)
    const pacific = groups.find((group) => group.label === 'Pacífico')
    expect(pacific?.zones).toEqual([{ id: 'Pacific/Kanton', label: 'Kanton' }])
  })

  it('no duplica la zona actual cuando sí está en la lista', () => {
    const ids = timeZoneGroups('Asia/Tokyo', zones).flatMap((group) => group.zones.map((zone) => zone.id))
    expect(ids.filter((id) => id === 'Asia/Tokyo')).toHaveLength(1)
  })

  it('con el navegador real incluye la zona actual', () => {
    const ids = timeZoneGroups('America/Bogota').flatMap((group) => group.zones.map((zone) => zone.id))
    expect(ids).toContain('America/Bogota')
  })
})
