import { afterEach, describe, expect, it } from 'vitest'
import { focusPageHeading, focusPageHeadingIfFocusLost } from './focusPageHeading'

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusPageHeadingIfFocusLost', () => {
  it('enfoca el h1 cuando el foco quedó en el body', async () => {
    document.body.innerHTML = '<h1>Equipo</h1><button>Otro</button>'
    focusPageHeadingIfFocusLost()
    await tick()
    expect(document.querySelector('h1')).toHaveFocus()
  })

  it('no mueve el foco si ya está en otro elemento', async () => {
    document.body.innerHTML = '<h1>Equipo</h1><button>Otro</button>'
    const button = document.querySelector('button')!
    button.focus()
    focusPageHeadingIfFocusLost()
    await tick()
    expect(button).toHaveFocus()
  })

  it('sin título en la página no hace nada', async () => {
    document.body.innerHTML = '<button>Otro</button>'
    focusPageHeadingIfFocusLost()
    await tick()
    expect(document.body).toHaveFocus()
  })
})

describe('focusPageHeading', () => {
  it('enfoca el h1 aunque el foco esté en otro elemento', () => {
    document.body.innerHTML = '<h1>Equipo</h1><button>Otro</button>'
    document.querySelector('button')!.focus()
    focusPageHeading()
    expect(document.querySelector('h1')).toHaveFocus()
  })
})
