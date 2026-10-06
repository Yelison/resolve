import { describe, expect, it, vi } from 'vitest'
import { compareResolved, newToday, requestPoints } from './overviewData'

describe('compareResolved', () => {
  it('con más resueltos que ayer da la diferencia y el porcentaje', () => {
    expect(compareResolved(38, 34)).toEqual({ text: '4 más que ayer (12 %)', arrow: '↑', trend: 'positive' })
  })

  it('con menos resueltos que ayer da la diferencia en negativo', () => {
    expect(compareResolved(30, 40)).toEqual({ text: '10 menos que ayer (25 %)', arrow: '↓', trend: 'negative' })
  })

  it('con ayer = 0 no inventa un porcentaje', () => {
    expect(compareResolved(5, 0)).toEqual({ text: '5 más que ayer', arrow: '↑', trend: 'positive' })
  })

  it('omite el porcentaje si redondea a 0', () => {
    expect(compareResolved(202, 201)).toEqual({ text: '1 más que ayer', arrow: '↑', trend: 'positive' })
    expect(compareResolved(200, 201)).toEqual({ text: '1 menos que ayer', arrow: '↓', trend: 'negative' })
  })

  it('sin diferencia no hay flecha ni tendencia', () => {
    expect(compareResolved(7, 7)).toEqual({ text: 'Igual que ayer', arrow: null, trend: 'neutral' })
    expect(compareResolved(0, 0)).toEqual({ text: 'Igual que ayer', arrow: null, trend: 'neutral' })
  })
})

describe('newToday', () => {
  it('concuerda en singular y plural', () => {
    expect([newToday(0), newToday(1), newToday(8)]).toEqual(['0 nuevos hoy', '1 nuevo hoy', '8 nuevos hoy'])
  })
})

describe('requestPoints', () => {
  it('etiqueta cada día de la semana sin depender de la zona del navegador', () => {
    // Los tests corren en UTC (`globalSetup`), donde la lectura ingenua con fecha local también acertaría; en Bogotá
    // (UTC−5) `new Date('2026-09-28').getDay()` da domingo. Node aplica el cambio de `TZ` en tiempo de ejecución.
    vi.stubEnv('TZ', 'America/Bogota')
    try {
      expectWeekLabels()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

function expectWeekLabels() {
  const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
  const points = requestPoints(days.map((date, index) => ({ date, created: index, resolved: 0 })))
  expect(points.map((point) => point.shortLabel)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  expect(points[0]).toMatchObject({ key: '2026-09-28', label: 'lunes, 28 sept', values: { created: 0 } })
  expect(points[6]!.values).toEqual({ created: 6 })
}
