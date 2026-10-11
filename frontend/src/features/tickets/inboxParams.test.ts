import { describe, expect, it } from 'vitest'
import { hasActiveFilters, inboxListParams, readInboxState, writeInboxState, type InboxState } from './inboxParams'

const base: InboxState = { view: 'all', q: '', sort: 'updatedAt,desc' }

describe('inboxParams', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readInboxState(new URLSearchParams())).toEqual(base)
  })

  it('ignora valores desconocidos y el page de enlaces antiguos, pero no su orden', () => {
    const state = readInboxState(new URLSearchParams('view=todos&status=cerrado&priority=high&page=3&sort=number,asc'))
    expect(state).toEqual({ ...base, priority: 'high', sort: 'number,asc' })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    expect(writeInboxState({ ...base, view: 'mine', status: 'open', q: '  pago ', ticket: 1048 }).toString()).toBe(
      'view=mine&status=open&q=pago&ticket=1048',
    )
    expect(writeInboxState(base).toString()).toBe('')
  })

  it('ida y vuelta conservan el estado, la selección incluida', () => {
    const url = 'view=unassigned&priority=urgent&assignee=none&q=%231048&ticket=1048&sort=priority%2Cdesc'
    expect(writeInboxState(readInboxState(new URLSearchParams(url))).toString()).toBe(url)
  })

  it('solo admite un número de ticket entero positivo', () => {
    for (const ticket of ['0', '-4', '1.5', 'abc', '', '1e3', '99999999999999999999']) {
      expect(readInboxState(new URLSearchParams({ ticket })).ticket).toBeUndefined()
    }
    expect(readInboxState(new URLSearchParams('ticket=1048')).ticket).toBe(1048)
  })

  it('distingue filtros activos de la vista y de la selección', () => {
    expect(hasActiveFilters({ ...base, view: 'mine', ticket: 1048 })).toBe(false)
    expect(hasActiveFilters({ ...base, q: 'x' })).toBe(true)
  })

  it('lee y escribe un orden válido y solo escribe el que no es el de por defecto', () => {
    expect(readInboxState(new URLSearchParams('sort=priority,asc')).sort).toBe('priority,asc')
    expect(writeInboxState({ ...base, sort: 'number,desc' }).toString()).toBe('sort=number%2Cdesc')
    expect(writeInboxState({ ...base, sort: 'updatedAt,desc' }).has('sort')).toBe(false)
  })

  it('un orden no válido vuelve al de por defecto y no se escribe', () => {
    for (const sort of ['priority', 'priority,up', 'title,asc', 'updatedAt,desc,asc', '']) {
      const state = readInboxState(new URLSearchParams({ sort }))
      expect(state.sort).toBe('updatedAt,desc')
      expect(writeInboxState(state).has('sort')).toBe(false)
    }
  })
})

describe('inboxListParams', () => {
  it('«Abiertos» pide solo los estados abiertos', () => {
    expect(inboxListParams(base).status).toEqual(['open', 'in_progress', 'waiting'])
  })

  it('con una búsqueda, «Abiertos» busca en todos los estados', () => {
    expect(inboxListParams({ ...base, q: 'factura' }).status).toEqual([])
    expect(inboxListParams({ ...base, q: '  #1040 ' }).status).toEqual([])
  })

  it('una búsqueda en blanco no cuenta como búsqueda', () => {
    expect(inboxListParams({ ...base, q: '   ' }).status).toEqual(['open', 'in_progress', 'waiting'])
  })

  it('un filtro de estado explícito manda, con o sin búsqueda', () => {
    expect(inboxListParams({ ...base, q: 'x', status: 'waiting' }).status).toEqual(['waiting'])
  })

  it('lleva el orden a la consulta', () => {
    expect(inboxListParams({ ...base, sort: 'priority,desc' }).sort).toBe('priority,desc')
  })
})
