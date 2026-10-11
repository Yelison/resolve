import { describe, expect, it } from 'vitest'
import { teamMember } from './teamFixtures'
import { loadEntries, loadScale } from './teamLoad'

describe('loadEntries', () => {
  it('ordena a las personas activas de más a menos abiertos y a igual carga por nombre', () => {
    const entries = loadEntries([
      teamMember({ id: 'b', name: 'Beatriz', openTickets: 2, urgentOpenTickets: 0 }),
      teamMember({ id: 'a', name: 'Álvaro', openTickets: 2, urgentOpenTickets: 1 }),
      teamMember({ id: 'c', name: 'Carlos', openTickets: 5, urgentOpenTickets: 5 }),
    ])
    expect(entries.map((entry) => entry.member.id)).toEqual(['c', 'a', 'b'])
    expect(entries.map((entry) => [entry.open, entry.urgent, entry.rest])).toEqual([
      [5, 5, 0],
      [2, 1, 1],
      [2, 0, 2],
    ])
  })

  it('deja fuera a quien está invitado o retirado, aunque conserve tickets', () => {
    const entries = loadEntries([
      teamMember({ id: 'a', status: 'invited', openTickets: 4 }),
      teamMember({ id: 'b', status: 'removed', openTickets: 4 }),
      teamMember({ id: 'c', status: 'active', openTickets: 0, urgentOpenTickets: 0 }),
    ])
    expect(entries.map((entry) => entry.member.id)).toEqual(['c'])
  })

  it('recorta unos urgentes mayores que el total para que la barra no tenga segmentos negativos', () => {
    const [entry] = loadEntries([teamMember({ openTickets: 2, urgentOpenTickets: 9 })])
    expect([entry!.open, entry!.urgent, entry!.rest]).toEqual([2, 2, 0])
  })
})

describe('loadScale', () => {
  it('es la mayor carga y nunca menos de uno, para no dividir entre cero', () => {
    expect(loadScale([])).toBe(1)
    expect(loadScale(loadEntries([teamMember({ openTickets: 0, urgentOpenTickets: 0 })]))).toBe(1)
    expect(loadScale(loadEntries([teamMember({ openTickets: 12 }), teamMember({ id: 'x', openTickets: 4 })]))).toBe(12)
  })
})
