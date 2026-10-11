import { describe, expect, it } from 'vitest'
import {
  forCompany,
  hasActiveCustomerFilters,
  isCompanyView,
  readCustomerListState,
  withoutCompanyFilter,
  writeCustomerListState,
  type CustomerListState,
} from './listParams'

const base: CustomerListState = {
  q: '',
  withoutCompany: false,
  archived: false,
  sort: 'name,asc',
  page: 1,
  group: 'company',
}

describe('listParams de clientes', () => {
  it('lee el estado por defecto de una URL vacía', () => {
    expect(readCustomerListState(new URLSearchParams())).toEqual(base)
  })

  it('ignora órdenes desconocidos, archived distinto de true y páginas no válidas', () => {
    const state = readCustomerListState(new URLSearchParams('sort=email,asc&archived=1&page=0&company=Northstar'))
    expect(state).toEqual({ ...base, company: 'Northstar' })
  })

  it('solo reconoce «none» como agrupación distinta de la de por defecto', () => {
    expect(readCustomerListState(new URLSearchParams('group=none')).group).toBe('none')
    expect(readCustomerListState(new URLSearchParams('group=company')).group).toBe('company')
    expect(readCustomerListState(new URLSearchParams('group=otra')).group).toBe('company')
  })

  it('«sin empresa» solo vale si no hay una empresa concreta', () => {
    expect(readCustomerListState(new URLSearchParams('withoutCompany=true')).withoutCompany).toBe(true)
    expect(readCustomerListState(new URLSearchParams('withoutCompany=1')).withoutCompany).toBe(false)
    const both = readCustomerListState(new URLSearchParams('company=Acme&withoutCompany=true'))
    expect(both).toMatchObject({ company: 'Acme', withoutCompany: false })
  })

  it('escribe solo lo que difiere del estado por defecto', () => {
    expect(writeCustomerListState({ ...base, q: '  ana ', archived: true, page: 2 }).toString()).toBe(
      'q=ana&archived=true&page=2',
    )
    expect(writeCustomerListState(base).toString()).toBe('')
    expect(writeCustomerListState({ ...base, group: 'none' }).toString()).toBe('group=none')
    expect(writeCustomerListState({ ...base, withoutCompany: true }).toString()).toBe('withoutCompany=true')
  })

  it('ida y vuelta conservan el estado', () => {
    const url = 'q=ana&company=Orbit+Labs&archived=true&sort=openTickets%2Cdesc&page=3&group=none'
    expect(writeCustomerListState(readCustomerListState(new URLSearchParams(url))).toString()).toBe(url)
    const sinEmpresa = 'q=ana&withoutCompany=true&page=2'
    expect(writeCustomerListState(readCustomerListState(new URLSearchParams(sinEmpresa))).toString()).toBe(sinEmpresa)
  })

  it('distingue filtros activos del orden y de la agrupación', () => {
    expect(hasActiveCustomerFilters({ ...base, sort: 'openTickets,desc', group: 'none' })).toBe(false)
    expect(hasActiveCustomerFilters({ ...base, q: ' ', company: 'Orbit' })).toBe(true)
    expect(hasActiveCustomerFilters({ ...base, withoutCompany: true })).toBe(true)
    expect(hasActiveCustomerFilters({ ...base, archived: true })).toBe(true)
  })

  it('abrir una empresa y volver a todas conserva lo demás y vuelve a la primera página', () => {
    const state = { ...base, q: 'ana', archived: true, sort: 'createdAt,desc', page: 4, group: 'company' } as const
    const acme = forCompany(state, 'Lumen Diseño')
    expect(acme).toMatchObject({ company: 'Lumen Diseño', withoutCompany: false, page: 1, q: 'ana', archived: true })
    expect(isCompanyView(acme)).toBe(true)
    expect(forCompany(acme, null)).toMatchObject({ company: undefined, withoutCompany: true, page: 1 })
    const back = withoutCompanyFilter({ ...acme, page: 3 })
    expect(back).toMatchObject({ company: undefined, withoutCompany: false, page: 1, q: 'ana' })
    expect(isCompanyView(back)).toBe(false)
  })
})
