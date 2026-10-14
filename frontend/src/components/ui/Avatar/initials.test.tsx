import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceMark } from '../Sidebar/WorkspaceMark'
import { Avatar, initialsOf } from './Avatar'

// `initialsOf` y la lógica de las iniciales son de @yelison/forma-ui. Lo que se fija aquí es lo de Resolve: que el
// cuadro de un espacio (`WorkspaceMark`) y el `<Avatar>` pintan las mismas letras para el mismo nombre.
const draw = (name: string) => ({
  mark: render(<WorkspaceMark name={name} />).container.firstElementChild?.textContent,
  avatar: render(<Avatar name={name} />).container.firstElementChild?.textContent,
})

describe('iniciales de WorkspaceMark frente a las del Avatar', () => {
  // Los cuatro espacios de la demostración (`src/showcase/install.test.ts`: Acme, Kora, Lumen y Norte).
  describe.each([
    ['Acme Studio', 'AS'],
    ['Kora Fitness', 'KF'],
    ['Lumen Diseño', 'LD'],
    ['Norte Viajes', 'NV'],
  ])('espacio de la demo %j', (name, initials) => {
    it(`el espacio y el avatar pintan «${initials}»`, () => {
      expect(draw(name)).toEqual({ mark: initials, avatar: initials })
      expect(initialsOf(name)).toBe(initials)
    })
  })

  // Casos de la lógica del paquete (cortar por carácter percibido, no partir un acento ni un emoji, dejar `ß`): no son
  // espacios de la demo, sino nombres con los que el espacio y el avatar podrían separarse.
  it.each([
    ['ßeta Ruiz', 'ßR'],
    ['ǆuro Ǆurić', 'ǄǄ'],
    // «Émile» con la É precompuesta (U+00C9), y con el acento combinado (E + U+0301), en mayúscula y en minúscula.
    ['\u00c9mile Durand', '\u00c9D'],
    ['E\u0301mile Durand', 'E\u0301D'],
    ['e\u0301mile durand', 'E\u0301D'],
    ['👩‍💻 dev', '👩‍💻D'],
    ['Zoë Ångström Öberg', 'ZÖ'],
    ['李 小龙', '李小'],
    ['  Ana   Ruiz  ', 'AR'],
    ['Mío', 'M'],
  ])('nombre %j: el espacio y el avatar pintan lo mismo', (name, expected) => {
    const { mark, avatar } = draw(name)
    expect(mark).toBe(avatar)
    expect(mark).toBe(initialsOf(name))
    expect(mark).toBe(expected)
  })
})
