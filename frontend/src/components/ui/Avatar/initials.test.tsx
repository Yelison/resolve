import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it.each([
    ['Laura Méndez', 'LM'],
    ['María Pérez Gómez', 'MG'],
    ['yelisson', 'Y'],
    ['  Ana   Ruiz  ', 'AR'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('no parte una letra con el acento combinado: «e» + U+0301 sigue entera', () => {
    expect(initialsOf('émile durand')).toBe('ÉD')
  })

  it('no parte un emoji compuesto', () => {
    expect(initialsOf('👩‍💻 dev')).toBe('👩‍💻D')
  })

  it('deja «ß» como está: su mayúscula son dos letras', () => {
    expect(initialsOf('ßeta Ruiz')).toBe('ßR')
  })
})

describe('initialsOf frente al Avatar del paquete', () => {
  // El paquete no exporta su ayudante. Si su lógica cambia, este test avisa de que el espacio y el avatar se separan.
  it.each([
    'Laura Méndez',
    'María Pérez Gómez',
    'yelisson',
    '  Ana   Ruiz  ',
    'émile durand',
    '👩‍💻 dev',
    'ßeta Ruiz',
    'ǆuro Ǆurić',
    'Zoë Ångström Öberg',
    '李 小龙',
  ])('%j pinta lo mismo que el avatar', (name) => {
    const { container } = render(<Avatar name={name} />)
    expect(container.firstElementChild?.textContent).toBe(initialsOf(name))
  })
})
