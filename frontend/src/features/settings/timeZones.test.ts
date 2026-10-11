import { describe, expect, it } from 'vitest'
import { timeZoneGroups, timeZoneLabel } from './timeZones'

describe('timeZoneGroups', () => {
  const zones = ['Europe/Madrid', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'Asia/Tokyo', 'UTC']

  it('agrupa por región con nombre en español y deja «Otras» al final', () => {
    const groups = timeZoneGroups('America/Bogota', zones)
    expect(groups.map((group) => group.label)).toEqual(['América', 'Asia', 'Europa', 'Otras'])
  })

  it('conserva el id exacto y muestra la ciudad sin guiones bajos', () => {
    const america = timeZoneGroups('America/Bogota', zones)[0]!
    expect(america.zones).toEqual([
      { id: 'America/Bogota', label: 'Bogotá (GMT−5)' },
      { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT−3)' },
    ])
  })

  it('añade la zona actual si el navegador no la lista, para no mostrar otra distinta', () => {
    const groups = timeZoneGroups('Pacific/Kanton', zones)
    const pacific = groups.find((group) => group.label === 'Pacífico')
    expect(pacific?.zones).toEqual([{ id: 'Pacific/Kanton', label: 'Kanton (GMT+13)' }])
  })

  it('no duplica la zona actual cuando sí está en la lista', () => {
    const ids = timeZoneGroups('Asia/Tokyo', zones).flatMap((group) => group.zones.map((zone) => zone.id))
    expect(ids.filter((id) => id === 'Asia/Tokyo')).toHaveLength(1)
  })

  it('da un nombre legible con tildes y el desfase, con el signo menos tipográfico', () => {
    expect(timeZoneLabel('America/Bogota')).toBe('Bogotá (GMT−5)')
    expect(timeZoneLabel('America/Mexico_City')).toBe('Ciudad de México (GMT−6)')
    expect(timeZoneLabel('Asia/Kolkata')).toBe('Calcuta (GMT+5:30)')
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires (GMT−3)')
  })

  it('las zonas de España, México y Argentina tienen nombre en español con tildes', () => {
    expect(timeZoneLabel('Atlantic/Canary')).toBe('Canarias (GMT+1)')
    expect(timeZoneLabel('America/Mazatlan')).toBe('Mazatlán (GMT−7)')
    expect(timeZoneLabel('America/Argentina/Cordoba')).toBe('Córdoba (GMT−3)')
    expect(timeZoneLabel('America/Argentina/Tucuman')).toBe('Tucumán (GMT−3)')
    expect(timeZoneLabel('America/New_York')).toMatch(/^Nueva York \(GMT−[45]\)$/)
  })

  it('el meridiano de Greenwich es «GMT» y UTC va sin desfase', () => {
    expect(timeZoneLabel('Atlantic/Reykjavik')).toBe('Reykjavik (GMT)')
    expect(timeZoneLabel('UTC')).toBe('UTC')
  })

  it('una zona que el navegador no conoce se muestra con su nombre y sin desfase', () => {
    expect(timeZoneLabel('Mars/Olympus_Mons')).toBe('Olympus Mons')
  })

  it('con el navegador real incluye la zona actual', () => {
    const ids = timeZoneGroups('America/Bogota').flatMap((group) => group.zones.map((zone) => zone.id))
    expect(ids).toContain('America/Bogota')
  })
})
