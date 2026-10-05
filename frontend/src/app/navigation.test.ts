import type { Role } from '../api/schema'
import { describe, expect, it } from 'vitest'
import { mainNavigation, navigationFor } from './navigation'

const paths = (role: Role | undefined) => navigationFor(role).map((item) => item.to)

describe('navegación principal', () => {
  it('los clientes ven Tickets, Conocimiento y Configuración (solo Perfil y Apariencia)', () => {
    expect(paths('customer')).toEqual(['/tickets', '/conocimiento', '/configuracion'])
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
