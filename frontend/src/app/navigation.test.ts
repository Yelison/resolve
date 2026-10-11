import type { Role } from '../api/schema'
import { describe, expect, it } from 'vitest'
import { mainNavigation, navigationFor } from './navigation'

const paths = (role: Role | undefined) => navigationFor(role).map((item) => item.to)
const labels = (role: Role | undefined) => navigationFor(role).map((item) => item.label)

describe('navegación principal', () => {
  it('los clientes ven Tickets, Conocimiento y Configuración (solo Perfil y Apariencia)', () => {
    expect(paths('customer')).toEqual(['/tickets', '/conocimiento', '/configuracion'])
  })

  it('la página de inicio se llama Inicio para el personal', () => {
    expect(labels('admin')).toEqual([
      'Inicio',
      'Tickets',
      'Clientes',
      'Equipo',
      'Reportes',
      'Conocimiento',
      'Configuración',
    ])
    expect(labels('agent')).toEqual(labels('admin'))
    expect(navigationFor('agent')[0]).toMatchObject({ to: '/', label: 'Inicio' })
  })

  it('los clientes ven «Mis solicitudes» y «Ayuda» en las mismas rutas', () => {
    expect(labels('customer')).toEqual(['Mis solicitudes', 'Ayuda', 'Configuración'])
    expect(paths('customer')).toEqual(['/tickets', '/conocimiento', '/configuracion'])
  })

  it('el cambio de nombre de los clientes no altera la fuente de la navegación', () => {
    navigationFor('customer')
    expect(mainNavigation.map((item) => item.label)).toContain('Tickets')
    expect(mainNavigation.map((item) => item.label)).toContain('Conocimiento')
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
