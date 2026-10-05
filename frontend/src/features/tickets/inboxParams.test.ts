import { describe, expect, it } from 'vitest'
import { hasActiveFilters, readInboxState, writeInboxState } from './inboxParams'

describe('inboxParams', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readInboxState(new URLSearchParams())).toEqual({ view: 'all', q: '', page: 1, sort: 'updatedAt,desc' })
  })

  it('ignora valores desconocidos y páginas no válidas', () => {
    const state = readInboxState(new URLSearchParams('view=todos&status=cerrado&priority=high&page=-2'))
    expect(state).toEqual({ view: 'all', priority: 'high', q: '', page: 1, sort: 'updatedAt,desc' })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    const params = writeInboxState({ view: 'mine', status: 'open', q: '  pago ', page: 2, sort: 'updatedAt,desc' })
    expect(params.toString()).toBe('view=mine&status=open&q=pago&page=2')
    expect(writeInboxState({ view: 'all', q: '', page: 1, sort: 'updatedAt,desc' }).toString()).toBe('')
  })

  it('ida y vuelta conservan el estado', () => {
    const url = 'view=unassigned&priority=urgent&assignee=none&q=%231048&sort=priority%2Casc&page=3'
    expect(writeInboxState(readInboxState(new URLSearchParams(url))).toString()).toBe(url)
  })

  it('distingue filtros activos de la vista', () => {
    expect(hasActiveFilters({ view: 'mine', q: '', page: 1, sort: 'priority,asc' })).toBe(false)
    expect(hasActiveFilters({ view: 'all', q: 'x', page: 1, sort: 'updatedAt,desc' })).toBe(true)
  })

  it('lee y escribe un orden válido', () => {
    expect(readInboxState(new URLSearchParams('sort=priority,asc')).sort).toBe('priority,asc')
    expect(writeInboxState({ view: 'all', q: '', page: 1, sort: 'number,desc' }).toString()).toBe('sort=number%2Cdesc')
  })

  it('un orden no válido vuelve al de por defecto y no se escribe', () => {
    for (const sort of ['priority', 'priority,up', 'title,asc', 'updatedAt,desc,asc', '']) {
      const state = readInboxState(new URLSearchParams({ sort }))
      expect(state.sort).toBe('updatedAt,desc')
      expect(writeInboxState(state).has('sort')).toBe(false)
    }
  })
})
