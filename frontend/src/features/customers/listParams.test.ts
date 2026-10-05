import { describe, expect, it } from 'vitest'
import { hasActiveCustomerFilters, readCustomerListState, writeCustomerListState } from './listParams'

describe('listParams de clientes', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readCustomerListState(new URLSearchParams())).toEqual({ q: '', archived: false, sort: 'name,asc', page: 1 })
  })

  it('ignora órdenes desconocidos, archived distinto de true y páginas no válidas', () => {
    const state = readCustomerListState(new URLSearchParams('sort=email,asc&archived=1&page=0&company=Northstar'))
    expect(state).toEqual({ q: '', company: 'Northstar', archived: false, sort: 'name,asc', page: 1 })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    expect(writeCustomerListState({ q: '  ana ', archived: true, sort: 'name,asc', page: 2 }).toString()).toBe(
      'q=ana&archived=true&page=2',
    )
    expect(writeCustomerListState({ q: '', archived: false, sort: 'name,asc', page: 1 }).toString()).toBe('')
  })

  it('ida y vuelta conservan el estado', () => {
    const url = 'q=ana&company=Orbit+Labs&archived=true&sort=openTickets%2Cdesc&page=3'
    expect(writeCustomerListState(readCustomerListState(new URLSearchParams(url))).toString()).toBe(url)
  })

  it('distingue filtros activos del orden', () => {
    expect(hasActiveCustomerFilters({ q: '', archived: false, sort: 'openTickets,desc', page: 1 })).toBe(false)
    expect(hasActiveCustomerFilters({ q: ' ', company: 'Orbit', archived: false, sort: 'name,asc', page: 1 })).toBe(
      true,
    )
    expect(hasActiveCustomerFilters({ q: '', archived: true, sort: 'name,asc', page: 1 })).toBe(true)
  })
})
