import { describe, expect, it } from 'vitest'
import { searchGroupsFor } from './groups'

const ids = (role: Parameters<typeof searchGroupsFor>[0]) => searchGroupsFor(role).map((group) => group.id)

describe('searchGroupsFor', () => {
  it('el personal busca en tickets, clientes y artículos', () => {
    expect(ids('admin')).toEqual(['tickets', 'customers', 'articles'])
    expect(ids('agent')).toEqual(['tickets', 'customers', 'articles'])
  })

  it('un cliente no busca en clientes: no puede abrir esa sección', () => {
    expect(ids('customer')).toEqual(['tickets', 'articles'])
  })

  it('mientras no se conoce el rol se ofrece lo del rol con menos permisos', () => {
    expect(ids(undefined)).toEqual(ids('customer'))
  })
})
