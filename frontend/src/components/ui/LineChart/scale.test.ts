import { describe, expect, it } from 'vitest'
import { niceScale } from './scale'

describe('niceScale', () => {
  it('redondea el máximo a un salto redondo y parte de 0', () => {
    expect(niceScale([3, 9, 47])).toEqual({ min: 0, max: 60, ticks: [0, 20, 40, 60] })
  })

  it('incluye el 0 y amplía hacia abajo con valores negativos', () => {
    const scale = niceScale([-8, -3, 4])
    expect(scale.min).toBeLessThanOrEqual(-8)
    expect(scale.max).toBeGreaterThanOrEqual(4)
    expect(scale.ticks).toContain(0)
  })

  it('con todo en 0 devuelve un eje válido', () => {
    expect(niceScale([0, 0, 0])).toEqual({ min: 0, max: 1, ticks: [0, 1] })
  })

  it('no produce decimales con saltos enteros', () => {
    expect(niceScale([1, 2, 3, 12]).ticks.every(Number.isInteger)).toBe(true)
  })
})
