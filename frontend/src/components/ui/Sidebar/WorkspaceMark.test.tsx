import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceMark } from './WorkspaceMark'

describe('WorkspaceMark', () => {
  it('con color lo lleva en `data-color` y muestra las iniciales', () => {
    const { container } = render(<WorkspaceMark name="Acme Studio" color="orange" />)
    const mark = container.firstElementChild!
    expect(mark).toHaveAttribute('data-color', 'orange')
    expect(mark).toHaveTextContent('AS')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  it('sin color (la sesión carga o son datos antiguos) conserva el estilo neutro: sin `data-color`', () => {
    const { container } = render(<WorkspaceMark name="Acme Studio" />)
    expect(container.firstElementChild).not.toHaveAttribute('data-color')
  })
})
