import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FirstResponseBar } from './FirstResponseBar'

const left = (container: HTMLElement, selector: string) =>
  Number.parseFloat(container.querySelector<HTMLElement>(selector)!.style.left)

describe('FirstResponseBar', () => {
  it('rellena la barra según el valor y coloca las marcas del periodo anterior y del objetivo en su sitio', () => {
    const { container } = render(<FirstResponseBar value={38} previous={45} target={60} />)
    const fill = Number.parseFloat(container.querySelector<HTMLElement>('[class*="fill"]')!.style.width)
    const previous = left(container, '[class*="previous"]:not([class*="Glyph"])')
    const target = left(container, '[class*="target"]:not([class*="Glyph"])')
    expect(fill).toBeLessThan(previous)
    expect(previous).toBeLessThan(target)
    // La escala es 60 × 1,25 = 75: el objetivo cae al 80 %.
    expect(target).toBeCloseTo(80, 1)
  })

  it('nombra la marca anterior y el objetivo con texto legible', () => {
    render(<FirstResponseBar value={38} previous={45} target={60} />)
    expect(screen.getByText('antes 45')).toBeInTheDocument()
    expect(screen.getByText(/^objetivo 60\smin$/)).toBeInTheDocument()
  })

  it('sin valor no dibuja el relleno y sin periodo anterior no dibuja su marca ni su texto', () => {
    const { container } = render(<FirstResponseBar value={null} previous={null} target={30} />)
    expect(container.querySelector('[class*="fill"]')).toBeNull()
    expect(container.querySelector('[class*="previous"]')).toBeNull()
    expect(screen.queryByText(/antes/)).not.toBeInTheDocument()
    expect(screen.getByText(/objetivo 30/)).toBeInTheDocument()
  })

  it('amplía la escala cuando el valor supera al objetivo y no se sale de la barra', () => {
    const { container } = render(<FirstResponseBar value={120} previous={20} target={30} />)
    const fill = Number.parseFloat(container.querySelector<HTMLElement>('[class*="fill"]')!.style.width)
    expect(fill).toBeLessThanOrEqual(100)
    expect(left(container, '[class*="target"]:not([class*="Glyph"])')).toBeLessThan(fill)
  })

  it('la barra es decorativa y las marcas están en una lista de texto', () => {
    const { container } = render(<FirstResponseBar value={10} previous={20} target={30} />)
    expect(container.querySelector('[class*="track"]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('con todo en 0 no divide por cero', () => {
    const { container } = render(<FirstResponseBar value={0} previous={0} target={0} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
})
