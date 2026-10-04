import { describe, expect, it } from 'vitest'
import { computePosition } from './position'

const viewport = { width: 1024, height: 768 }
const tooltip = { width: 100, height: 34 }

describe('computePosition', () => {
  it('centra a la derecha del ancla', () => {
    const anchor = { top: 100, left: 16, width: 44, height: 44 }
    expect(computePosition(anchor, tooltip, 'right', viewport)).toEqual({ top: 105, left: 68, placement: 'right' })
  })

  it('pasa a la izquierda si no cabe a la derecha', () => {
    const anchor = { top: 100, left: 960, width: 44, height: 44 }
    expect(computePosition(anchor, tooltip, 'right', viewport)).toMatchObject({ left: 852, placement: 'left' })
  })

  it('se ajusta al borde superior del viewport', () => {
    const anchor = { top: 0, left: 16, width: 44, height: 20 }
    expect(computePosition(anchor, tooltip, 'right', viewport).top).toBe(8)
  })

  it('alinea menús al final del ancla y los abre hacia arriba si no caben debajo', () => {
    const menu = { width: 248, height: 120 }
    const anchor = { top: 700, left: 900, width: 44, height: 44 }
    expect(computePosition(anchor, menu, 'bottom-end', viewport)).toEqual({
      top: 572,
      left: 696,
      placement: 'top-end',
    })
  })

  it('nunca deja el elemento fuera del viewport aunque sea más ancho que el espacio', () => {
    const anchor = { top: 100, left: 300, width: 44, height: 44 }
    const position = computePosition(anchor, { width: 400, height: 40 }, 'bottom-start', { width: 320, height: 640 })
    expect(position.left).toBe(8)
  })
})
