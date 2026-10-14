import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceMark } from '../Sidebar/WorkspaceMark'
import { Avatar, initialsOf } from './Avatar'

// `initialsOf` y la lógica de las iniciales son de @yelison/forma-ui. Lo que se fija aquí es lo de Resolve: que el
// cuadro de un espacio (`WorkspaceMark`) y el `<Avatar>` pintan las mismas letras para el mismo nombre.
describe('iniciales de WorkspaceMark frente a las del Avatar', () => {
  it.each([
    'Acme Studio',
    'Norte Viajes',
    'Taller Sur',
    'Lumen Diseño',
    'Mío',
    'acme estudio',
    '  Ana   Ruiz  ',
    'Zoë Ångström Öberg',
    'émile durand',
    '👩‍💻 dev',
    '李 小龙',
  ])('%j: el espacio y el avatar pintan lo mismo', (name) => {
    const mark = render(<WorkspaceMark name={name} />).container.firstElementChild
    const avatar = render(<Avatar name={name} />).container.firstElementChild
    expect(mark?.textContent).toBe(avatar?.textContent)
    expect(mark?.textContent).toBe(initialsOf(name))
    expect(mark?.textContent).not.toBe('')
  })

  it('las iniciales de los espacios de la demo son las que se ven en el sidebar', () => {
    expect(initialsOf('Acme Studio')).toBe('AS')
    expect(initialsOf('Lumen Diseño')).toBe('LD')
    expect(initialsOf('Mío')).toBe('M')
  })
})
