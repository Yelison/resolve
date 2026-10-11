import { describe, expect, it } from 'vitest'
import { pulseCells, type PulseMetrics } from './pulse'

const base: PulseMetrics = {
  open: 132,
  openedToday: 18,
  resolvedToday: 64,
  resolvedYesterday: 71,
  unassignedOver4Hours: 9,
  firstResponseMinutes: 42,
  firstResponseTargetMinutes: 30,
  views: { unassigned: 27 },
}

const cell = (metrics: PulseMetrics, id: string) => pulseCells(metrics).find((item) => item.id === id)!

describe('pulseCells', () => {
  it('trae los cuatro datos en el orden del diseño, cada uno con su destino', () => {
    expect(pulseCells(base).map((item) => [item.label, item.to])).toEqual([
      ['Tickets abiertos', '/tickets'],
      ['Sin responsable', '/tickets?view=unassigned'],
      ['Primera respuesta', '/tickets?status=open&sort=createdAt,asc'],
      ['Resueltos hoy', '/tickets?view=resolved'],
    ])
  })

  it('avisa en rojo, con texto, de los que llevan más de 4 h sin responsable', () => {
    expect(cell(base, 'unassigned')).toMatchObject({ value: '27', detail: '9 llevan más de 4 h', tone: 'danger' })
    expect(cell({ ...base, unassignedOver4Hours: 1 }, 'unassigned').detail).toBe('1 lleva más de 4 h')
  })

  it('con sin responsable recientes avisa en ámbar y sin ninguno lo dice en verde', () => {
    expect(cell({ ...base, unassignedOver4Hours: 0 }, 'unassigned')).toMatchObject({
      detail: 'Asígnalos desde la bandeja',
      tone: 'warning',
    })
    expect(cell({ ...base, unassignedOver4Hours: 0, views: { unassigned: 0 } }, 'unassigned')).toMatchObject({
      detail: 'Todos tienen responsable',
      tone: 'good',
    })
  })

  it('compara la primera respuesta con el objetivo, también cuando coincide', () => {
    expect(cell(base, 'firstResponse')).toMatchObject({ value: '42 min', tone: 'danger' })
    expect(cell(base, 'firstResponse').detail).toContain('Por encima del objetivo')
    expect(cell({ ...base, firstResponseMinutes: 30 }, 'firstResponse')).toMatchObject({ tone: 'good' })
    expect(cell({ ...base, firstResponseMinutes: 30 }, 'firstResponse').detail).toContain('Dentro del objetivo')
    expect(cell({ ...base, firstResponseMinutes: 18 }, 'firstResponse').detail).toContain('Dentro del objetivo')
  })

  it('sin primera respuesta no inventa un veredicto', () => {
    expect(cell({ ...base, firstResponseMinutes: null }, 'firstResponse')).toMatchObject({
      value: 'Sin datos',
      tone: 'neutral',
    })
  })

  it('los resueltos de hoy se comparan con ayer, y bajar avisa en ámbar con texto', () => {
    expect(cell(base, 'resolved')).toMatchObject({
      value: '64',
      detail: '7 menos que ayer (10 %)',
      arrow: '↓',
      tone: 'warning',
    })
    expect(cell({ ...base, resolvedToday: 80 }, 'resolved')).toMatchObject({ arrow: '↑', tone: 'good' })
    expect(cell({ ...base, resolvedToday: 71 }, 'resolved')).toMatchObject({
      detail: 'Igual que ayer',
      tone: 'neutral',
    })
  })

  it('reserva en cada celda un detalle tan largo como el más largo que puede mostrar', () => {
    const scenarios: PulseMetrics[] = [
      base,
      { ...base, unassignedOver4Hours: 0 },
      { ...base, unassignedOver4Hours: 0, views: { unassigned: 0 } },
      { ...base, unassignedOver4Hours: 100 },
      { ...base, firstResponseMinutes: null },
      { ...base, firstResponseMinutes: 10 },
      { ...base, resolvedToday: 300, resolvedYesterday: 100 },
      { ...base, resolvedToday: 1, resolvedYesterday: 2 },
      { ...base, openedToday: 1 },
      { ...base, openedToday: 999 },
    ]
    for (const scenario of scenarios) {
      for (const item of pulseCells(scenario)) {
        const shown = `${item.arrow ? `${item.arrow} ` : ''}${item.detail}`
        expect(item.reserve.length, `${item.id}: «${shown}»`).toBeGreaterThanOrEqual(shown.length)
      }
    }
  })
})
