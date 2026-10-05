import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('expone nombre, rango y valor', () => {
    render(<ProgressBar label="Correo" value={62} />)
    const bar = screen.getByRole('progressbar', { name: 'Correo' })
    expect(bar).toHaveAttribute('aria-valuenow', '62')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '62 %')
  })

  it('calcula el porcentaje respecto a max y usa valueText', () => {
    render(<ProgressBar label="Cuota" value={30} max={120} valueText="30 de 120 tickets" />)
    const bar = screen.getByRole('progressbar', { name: 'Cuota' })
    expect(bar).toHaveAttribute('aria-valuetext', '30 de 120 tickets')
    expect(bar.firstElementChild).toHaveStyle({ width: '25%' })
    expect(screen.getByText('30 de 120 tickets')).toBeInTheDocument()
  })

  it('limita los valores fuera de rango', () => {
    const { rerender } = render(<ProgressBar label="Uso" value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    rerender(<ProgressBar label="Uso" value={-5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
