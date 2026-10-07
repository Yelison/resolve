import { describe, expect, it } from 'vitest'
import { sectorPath, sliceAngles } from './geometry'

const full = Math.PI * 2

describe('sliceAngles', () => {
  it('reparte la vuelta en proporción a los valores', () => {
    const slices = sliceAngles([50, 25, 25], 0.1)
    expect(slices.map((slice) => slice.end - slice.start)).toEqual([full / 2, full / 4, full / 4])
    expect(slices[0]!.start).toBe(0)
    expect(slices[2]!.end).toBeCloseTo(full, 10)
  })

  it('da un ángulo mínimo a un valor diminuto y se lo descuenta a los demás sin pasarse de la vuelta', () => {
    const slices = sliceAngles([1000, 1], 0.2)
    expect(slices[1]!.end - slices[1]!.start).toBeCloseTo(0.2, 10)
    expect(slices[1]!.end).toBeCloseTo(full, 10)
    expect(slices[0]!.end - slices[0]!.start).toBeCloseTo(full - 0.2, 10)
  })

  it('no dibuja los valores 0 y no divide por cero con un total 0', () => {
    const zero = sliceAngles([10, 0, 10], 0.1)
    expect(zero[1]!.end - zero[1]!.start).toBe(0)
    expect(sliceAngles([0, 0], 0.1).every((slice) => slice.end === slice.start)).toBe(true)
  })
})

/** Puntos (x, y) de las órdenes M, L y A del trazado, para medir distancias. */
function endpoints(d: string): [number, number][] {
  return [...d.matchAll(/[MLA][^MLAZ]*/g)].map(([command = '']) => {
    const numbers = command.slice(1).trim().split(/\s+/).map(Number)
    return [numbers[numbers.length - 2]!, numbers[numbers.length - 1]!] as [number, number]
  })
}

describe('sectorPath', () => {
  const size = 168
  const base = { outer: 84, inner: 63, gap: 2, corner: 4 }

  it('traza un sector cerrado dentro del cuadro del gráfico', () => {
    const d = sectorPath(size, { ...base, start: 0, end: Math.PI / 2 })
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    for (const [x, y] of endpoints(d)) {
      expect(x).toBeGreaterThanOrEqual(-0.01)
      expect(x).toBeLessThanOrEqual(size + 0.01)
      expect(y).toBeGreaterThanOrEqual(-0.01)
      expect(y).toBeLessThanOrEqual(size + 0.01)
    }
  })

  it('deja 2 px entre el borde final de un sector y el inicial del siguiente', () => {
    const first = endpoints(sectorPath(size, { ...base, start: 0, end: Math.PI }))
    const second = endpoints(sectorPath(size, { ...base, start: Math.PI, end: Math.PI * 2 }))
    // El límite cae en el eje vertical, bajo el centro: los bordes son rectas verticales a un píxel de x = 84. Los
    // puntos de ese borde son los que quedan por debajo del anillo interior (y > 84 + 50) y a menos de 3 px del eje.
    const edge = (points: [number, number][]) =>
      points.filter(([x, y]) => y > 84 + 50 && Math.abs(x - 84) < 3).map(([x]) => x)
    expect(Math.min(...edge(first)) - 84).toBeCloseTo(1, 1)
    expect(Math.max(...edge(second)) - 84).toBeCloseTo(-1, 1)
  })

  it('un sector de vuelta completa es un anillo con dos círculos y sin esquinas', () => {
    const d = sectorPath(size, { ...base, start: 0, end: Math.PI * 2 })
    expect(d.match(/M /g)).toHaveLength(2)
    expect(d).not.toContain('L')
  })

  it('con un sector muy estrecho reduce las esquinas en lugar de producir valores no numéricos', () => {
    const d = sectorPath(size, { ...base, start: 0, end: 0.05 })
    expect(d).not.toMatch(/NaN|Infinity/)
  })

  it('marca como arco grande el que pasa de media vuelta', () => {
    const d = sectorPath(size, { ...base, start: 0, end: Math.PI * 1.5 })
    expect(d).toMatch(/A 84 84 0 1 1/)
    expect(sectorPath(size, { ...base, start: 0, end: Math.PI / 2 })).toMatch(/A 84 84 0 0 1/)
  })
})
