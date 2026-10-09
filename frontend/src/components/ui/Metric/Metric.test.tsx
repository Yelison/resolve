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

  it('coloca el gráfico entre el valor y el detalle sin cambiar lo que se lee', () => {
    render(<Metric label="Solicitudes" value="123" detail="13 más" chart={<span data-testid="chart">gráfico</span>} />)
    expect(screen.getByRole('term')).toHaveTextContent('Solicitudes')
    const [value, chart, detail] = screen.getAllByRole('definition')
    expect(value).toHaveTextContent('123')
    expect(chart).toContainElement(screen.getByTestId('chart'))
    expect(detail).toHaveTextContent('13 más')
  })

  it('sin gráfico no añade ningún contenedor de más', () => {
    render(<Metric label="Solicitudes" value="123" />)
    expect(screen.getAllByRole('definition')).toHaveLength(1)
  })
})
