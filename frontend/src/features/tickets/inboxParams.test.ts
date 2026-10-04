import { describe, expect, it } from 'vitest'
import { hasActiveFilters, readInboxState, writeInboxState } from './inboxParams'

describe('inboxParams', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readInboxState(new URLSearchParams())).toEqual({ view: 'all', q: '', page: 1 })
  })

  it('ignora valores desconocidos y páginas no válidas', () => {
    const state = readInboxState(new URLSearchParams('view=todos&status=cerrado&priority=high&page=-2'))
    expect(state).toEqual({ view: 'all', priority: 'high', q: '', page: 1 })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    const params = writeInboxState({ view: 'mine', status: 'open', q: '  pago ', page: 2 })
    expect(params.toString()).toBe('view=mine&status=open&q=pago&page=2')
    expect(writeInboxState({ view: 'all', q: '', page: 1 }).toString()).toBe('')
  })

  it('ida y vuelta conservan el estado', () => {
    const url = 'view=unassigned&priority=urgent&assignee=none&q=%231048&page=3'
    expect(writeInboxState(readInboxState(new URLSearchParams(url))).toString()).toBe(url)
  })

  it('distingue filtros activos de la vista', () => {
    expect(hasActiveFilters({ view: 'mine', q: '', page: 1 })).toBe(false)
    expect(hasActiveFilters({ view: 'all', q: 'x', page: 1 })).toBe(true)
  })
})
