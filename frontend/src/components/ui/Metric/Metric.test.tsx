import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Metric } from './Metric'

describe('Metric', () => {
  it('asocia la etiqueta con su valor', () => {
    render(<Metric label="Tickets abiertos" value="24" detail="8 nuevos hoy" />)
    expect(screen.getByRole('term')).toHaveTextContent('Tickets abiertos')
    const [value, detail] = screen.getAllByRole('definition')
    expect(value).toHaveTextContent('24')
    expect(detail).toHaveTextContent('8 nuevos hoy')
  })
})
