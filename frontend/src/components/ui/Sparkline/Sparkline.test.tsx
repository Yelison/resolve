import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'
import { sparklinePoints } from './points'

describe('sparklinePoints', () => {
  it('lleva el mínimo abajo y el máximo arriba, dentro del margen', () => {
    const points = sparklinePoints([0, 5, 10], 120, 36, 6)
    expect(points[0]).toEqual({ x: 6, y: 30 })
    expect(points[2]).toEqual({ x: 114, y: 6 })
    expect(points[1]!.y).toBe(18)
  })

  it('con todos los valores iguales dibuja una línea recta a media altura, sin dividir por cero', () => {
    const points = sparklinePoints([0, 0, 0, 0], 120, 36, 6)
    expect(points.map((point) => point.y)).toEqual([18, 18, 18, 18])
    expect(points.every((point) => Number.isFinite(point.x))).toBe(true)
  })

  it('con un único valor lo centra', () => {
    expect(sparklinePoints([7], 120, 36, 6)).toEqual([{ x: 60, y: 18 }])
  })

  it('admite valores negativos', () => {
    const points = sparklinePoints([-4, 0, 4], 120, 36, 6)
    expect(points[0]!.y).toBeGreaterThan(points[2]!.y)
  })
})

describe('Sparkline', () => {
  it('es decorativo si no tiene etiqueta', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
  })

  it('con etiqueta se expone como imagen con ese nombre', () => {
    const { getByRole } = render(<Sparkline values={[1, 3, 2]} label="Solicitudes por día" />)
    expect(getByRole('img', { name: 'Solicitudes por día' })).toBeInTheDocument()
  })

  it('dibuja la línea y un punto final de 8 px de diámetro en la última posición', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />)
    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(3)
    const dot = container.querySelector('circle')!
    expect(Number(dot.getAttribute('r')) * 2).toBeGreaterThanOrEqual(8)
    expect(dot.getAttribute('cx')).toBe('114')
  })

  it('con un solo valor no dibuja línea y con ninguno no dibuja nada', () => {
    const { container, rerender } = render(<Sparkline values={[4]} />)
    expect(container.querySelector('polyline')).toBeNull()
    expect(container.querySelector('circle')).not.toBeNull()
    rerender(<Sparkline values={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('usa el color de la serie pedida', () => {
    const { container } = render(<Sparkline values={[1, 2]} color={2} />)
    expect(container.querySelector('svg')!.getAttribute('class')).toMatch(/color2/)
  })
})
