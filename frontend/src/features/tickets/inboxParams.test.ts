import { describe, expect, it } from 'vitest'
import { hasActiveFilters, readInboxState, writeInboxState } from './inboxParams'

describe('inboxParams', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readInboxState(new URLSearchParams())).toEqual({ view: 'all', q: '' })
  })

  it('ignora valores desconocidos y el page y el sort de enlaces antiguos', () => {
    const state = readInboxState(new URLSearchParams('view=todos&status=cerrado&priority=high&page=3&sort=number,asc'))
    expect(state).toEqual({ view: 'all', priority: 'high', q: '' })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    expect(writeInboxState({ view: 'mine', status: 'open', q: '  pago ', ticket: 1048 }).toString()).toBe(
      'view=mine&status=open&q=pago&ticket=1048',
    )
    expect(writeInboxState({ view: 'all', q: '' }).toString()).toBe('')
  })

  it('ida y vuelta conservan el estado, la selección incluida', () => {
    const url = 'view=unassigned&priority=urgent&assignee=none&q=%231048&ticket=1048'
    expect(writeInboxState(readInboxState(new URLSearchParams(url))).toString()).toBe(url)
  })

  it('solo admite un número de ticket entero positivo', () => {
    for (const ticket of ['0', '-4', '1.5', 'abc', '', '1e3', '99999999999999999999']) {
      expect(readInboxState(new URLSearchParams({ ticket })).ticket).toBeUndefined()
    }
    expect(readInboxState(new URLSearchParams('ticket=1048')).ticket).toBe(1048)
  })

  it('distingue filtros activos de la vista y de la selección', () => {
    expect(hasActiveFilters({ view: 'mine', q: '', ticket: 1048 })).toBe(false)
    expect(hasActiveFilters({ view: 'all', q: 'x' })).toBe(true)
  })
})
