import { describe, expect, it } from 'vitest'
import { companyMark, customersSummary, groupSummary, openTicketsLabel, viewAllLabel } from './directory'

describe('customersSummary', () => {
  const metrics = { total: 3, companies: 3, withOpenTickets: 2, newThisMonth: 1 }

  it('dice «3 clientes de 3 empresas · 2 con tickets abiertos · 1 nuevo este mes»', () => {
    expect(customersSummary(metrics)).toBe('3 clientes de 3 empresas · 2 con tickets abiertos · 1 nuevo este mes')
  })

  it('usa el singular y el plural que corresponden', () => {
    expect(customersSummary({ total: 1, companies: 1, withOpenTickets: 1, newThisMonth: 2 })).toBe(
      '1 cliente de 1 empresa · 1 con tickets abiertos · 2 nuevos este mes',
    )
  })

  it('con cero lo dice con palabras en lugar de «0 …»', () => {
    expect(customersSummary({ total: 4, companies: 2, withOpenTickets: 0, newThisMonth: 0 })).toBe(
      '4 clientes de 2 empresas · ninguno con tickets abiertos · ninguno nuevo este mes',
    )
    expect(customersSummary({ total: 2, companies: 0, withOpenTickets: 1, newThisMonth: 1 })).toBe(
      '2 clientes sin empresa · 1 con tickets abiertos · 1 nuevo este mes',
    )
    expect(customersSummary({ total: 1, companies: 0, withOpenTickets: 0, newThisMonth: 1 })).toBe(
      '1 cliente sin empresa · ninguno con tickets abiertos · 1 nuevo este mes',
    )
  })

  it('sin clientes activos no enumera ceros', () => {
    expect(customersSummary({ total: 0, companies: 0, withOpenTickets: 0, newThisMonth: 0 })).toBe(
      'Todavía no hay clientes activos.',
    )
  })
})

describe('groupSummary', () => {
  it('cuenta clientes y tickets abiertos con su singular y plural', () => {
    expect(groupSummary(1, 2)).toBe('1 cliente · 2 tickets abiertos')
    expect(groupSummary(2, 1)).toBe('2 clientes · 1 ticket abierto')
    expect(groupSummary(1, 0)).toBe('1 cliente · sin tickets abiertos')
  })

  it('sin el dato de tickets solo cuenta los clientes', () => {
    expect(groupSummary(14)).toBe('14 clientes')
    expect(groupSummary(1)).toBe('1 cliente')
  })
})

describe('viewAllLabel', () => {
  it('nombra la empresa o dice que no la tienen', () => {
    expect(viewAllLabel(14, 'Lumen Diseño')).toBe('Ver los 14 clientes de Lumen Diseño')
    expect(viewAllLabel(9, null)).toBe('Ver los 9 clientes sin empresa')
  })
})

describe('etiquetas', () => {
  it('openTicketsLabel', () => {
    expect([0, 1, 2].map(openTicketsLabel)).toEqual(['Sin abiertos', '1 abierto', '2 abiertos'])
  })

  it('companyMark usa dos letras: las de dos palabras o las dos primeras de una', () => {
    expect(companyMark('Lumen Diseño')).toBe('LD')
    expect(companyMark('Orbit Labs de Madrid')).toBe('OL')
    expect(companyMark('Northstar')).toBe('NO')
    expect(companyMark('X')).toBe('X')
    expect(companyMark('  ')).toBe('')
  })
})
