import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'

const series = [{ id: 'requests', label: 'Solicitudes' }]
const points = [
  { key: 'mon', label: 'Lunes', shortLabel: 'L', values: { requests: 44 } },
  { key: 'tue', label: 'Martes', shortLabel: 'M', values: { requests: 61 } },
]

describe('BarChart', () => {
  it('incluye todos los valores en la tabla alternativa', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const table = screen.getByRole('table', { hidden: true, name: 'Solicitudes por día' })
    expect(within(table).getByRole('rowheader', { hidden: true, name: 'Lunes' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { hidden: true, name: '44' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { hidden: true, name: '61' })).toBeInTheDocument()
  })

  it('expone el gráfico como imagen descrita por la tabla', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const chart = screen.getByRole('img', { name: 'Solicitudes por día' })
    const table = screen.getByRole('table', { hidden: true })
    expect(chart.getAttribute('aria-describedby')).toBe(table.parentElement?.id)
  })

  it('el botón muestra y oculta la tabla', async () => {
    const user = userEvent.setup()
    render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const button = screen.getByRole('button', { name: 'Ver como tabla' })
    const wrap = screen.getByRole('table', { hidden: true }).parentElement
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(wrap).toHaveClass('visually-hidden')

    await user.click(button)
    expect(screen.getByRole('button', { name: 'Ocultar tabla' })).toHaveAttribute('aria-expanded', 'true')
    expect(wrap).not.toHaveClass('visually-hidden')

    await user.click(screen.getByRole('button', { name: 'Ocultar tabla' }))
    expect(wrap).toHaveClass('visually-hidden')
  })

  it('muestra un mensaje cuando no hay puntos', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={[]} />)
    expect(screen.getByText('Sin datos en este periodo')).toBeInTheDocument()
    expect(screen.queryByRole('table', { hidden: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('aplica valueFormatter en la tabla, los títulos y las etiquetas', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={points} valueFormatter={(n) => `${n} sol.`} />)
    expect(screen.getByRole('cell', { hidden: true, name: '44 sol.' })).toBeInTheDocument()
    expect(document.querySelector('title')?.textContent).toBe('Lunes · Solicitudes: 44 sol.')
    expect(screen.getAllByText('61 sol.').length).toBeGreaterThan(1)
  })

  it('con varias series muestra una leyenda y una columna por serie', () => {
    render(
      <BarChart
        label="Comparativa"
        series={[
          { id: 'a', label: 'Actual' },
          { id: 'b', label: 'Anterior', color: 'muted' },
        ]}
        points={[{ key: 'x', label: 'Semana 1', values: { a: 10, b: 4 } }]}
      />,
    )
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByRole('columnheader', { hidden: true })).toHaveLength(3)
    expect(screen.getAllByText('Anterior')).toHaveLength(2) // leyenda + cabecera de la tabla
  })
})
