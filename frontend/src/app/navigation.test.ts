import { describe, expect, it } from 'vitest'
import { mainNavigation, navigationFor } from './navigation'

const paths = (role: Parameters<typeof navigationFor>[0]) => navigationFor(role).map((item) => item.to)

describe('navegación principal', () => {
  it('los clientes solo ven Tickets', () => {
    expect(paths('customer')).toEqual(['/tickets'])
  })

  it('el personal ve todas las secciones', () => {
    const all = mainNavigation.map((item) => item.to)
    expect(paths('admin')).toEqual(all)
    expect(paths('agent')).toEqual(all)
  })

  it('sin sesión devuelve todas las secciones', () => {
    expect(paths(undefined)).toEqual(mainNavigation.map((item) => item.to))
  })
})
