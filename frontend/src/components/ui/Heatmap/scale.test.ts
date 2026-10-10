import { describe, expect, it } from 'vitest'
import { heatStep } from './scale'

describe('heatStep', () => {
  it('0 y los valores inválidos son una celda vacía', () => {
    expect(heatStep(0, 100)).toBe(0)
    expect(heatStep(-3, 100)).toBe(0)
    expect(heatStep(5, 0)).toBe(0)
    expect(heatStep(Number.NaN, 10)).toBe(0)
  })

  it('reparte el rango en cuatro pasos y el máximo es el paso 4', () => {
    expect([1, 25, 26, 50, 51, 75, 76, 100].map((value) => heatStep(value, 100))).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('un valor positivo diminuto nunca se confunde con una celda vacía', () => {
    expect(heatStep(1, 1320)).toBe(1)
  })
})
