import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('describe el gráfico con un resumen y enlaza la tabla como detalle', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const chart = screen.getByRole('img', { name: 'Solicitudes por día' })
    expect(chart).toHaveAccessibleDescription(/2 valores\. Máximo 61 en Martes\..*tabla alternativa/)
    const table = screen.getByRole('table', { hidden: true })
    expect(chart.getAttribute('aria-details')).toBe(table.parentElement?.id)
    expect(chart).not.toHaveAttribute('aria-describedby', table.parentElement?.id)
    // El resumen no debe leerse además como texto suelto antes del gráfico.
    expect(document.getElementById(chart.getAttribute('aria-describedby') ?? '')).toHaveAttribute('hidden')
  })

  it('el botón muestra y oculta la tabla', async () => {
    const user = userEvent.setup()
    render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const button = screen.getByRole('button', { name: 'Ver como tabla de Solicitudes por día' })
    const wrap = screen.getByRole('table', { hidden: true }).parentElement
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(wrap).toHaveClass('visually-hidden')

    await user.click(button)
    expect(screen.getByRole('button', { name: 'Ocultar tabla de Solicitudes por día' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(wrap).not.toHaveClass('visually-hidden')

    await user.click(screen.getByRole('button', { name: 'Ocultar tabla de Solicitudes por día' }))
    expect(wrap).toHaveClass('visually-hidden')
  })

  it('muestra un mensaje cuando no hay puntos', () => {
    render(<BarChart label="Solicitudes por día" series={series} points={[]} />)
    expect(screen.getByText('Solicitudes por día: sin datos en este periodo')).toBeInTheDocument()
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

  it('dibuja cada barra con una altura proporcional a su valor', () => {
    const { container } = render(<BarChart label="Solicitudes por día" series={series} points={points} />)
    const ratios = [...container.querySelectorAll('svg')].map((svg) => Number(svg.style.getPropertyValue('--ratio')))
    expect(ratios[1]).toBe(1)
    expect(ratios[0]).toBeCloseTo(44 / 61)
  })

  it('pinta con la clase de color pedida para cada serie', () => {
    const { container } = render(
      <BarChart
        label="Comparativa"
        series={[
          { id: 'a', label: 'Actual', color: 'muted' },
          { id: 'b', label: 'Anterior' },
        ]}
        points={[{ key: 'x', label: 'Semana 1', values: { a: 10, b: 4 } }]}
      />,
    )
    const [first, second] = [...container.querySelectorAll('rect')]
    expect(first).toHaveClass('muted')
    expect(second).toHaveClass('muted') // sin color explícito, la 2.ª serie usa el tono secundario por defecto
    expect(first).not.toHaveClass('brand')
  })
})

describe('BarChart con muchos puntos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function renderAtWidth(width: number, count: number, withShortLabel = true) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect)
    const many = Array.from({ length: count }, (_, index) => ({
      key: `d${index + 1}`,
      label: `${index + 1} de julio`,
      shortLabel: withShortLabel ? String(index + 1) : undefined,
      values: { requests: 900 + index },
    }))
    return render(<BarChart label="Solicitudes" series={series} points={many} />)
  }

  const axisTexts = (container: HTMLElement) => [...container.querySelectorAll('.axis')].map((el) => el.textContent)

  it('90 puntos en 256 px: separación mínima, sin cifras y con el eje aclarado', () => {
    const { container } = renderAtWidth(256, 90)
    expect(container.querySelector<HTMLElement>('.columns')?.style.columnGap).toBe('1px')
    expect(container.querySelectorAll('.value')).toHaveLength(0)
    const labels = axisTexts(container)
    expect(labels[0]).toBe('1')
    expect(labels.length).toBeGreaterThan(5)
    expect(labels.length).toBeLessThan(30)
    expect(container.querySelectorAll('title')).toHaveLength(90) // el valor sigue en cada barra
  })

  it('30 puntos en 256 px: una etiqueta cada varios puntos', () => {
    const { container } = renderAtWidth(256, 30)
    expect(container.querySelector<HTMLElement>('.columns')?.style.columnGap).toBe('2px')
    const labels = axisTexts(container)
    expect(labels.length).toBeLessThan(30)
    expect(labels.slice(0, 2)).toEqual(['1', '4'])
  })

  it('sin shortLabel y 7 puntos en 256 px aclara el eje en vez de recortar', () => {
    const { container } = renderAtWidth(256, 7, false)
    expect(axisTexts(container).length).toBeLessThan(7)
  })

  it('7 puntos en 1100 px: todas las etiquetas y las cifras', () => {
    const { container } = renderAtWidth(1100, 7)
    expect(axisTexts(container)).toHaveLength(7)
    expect(container.querySelectorAll('.value')).toHaveLength(7)
  })

  it('mide el ancho aunque se monte sin puntos y reciba datos después', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1100 } as DOMRect)
    const { container, rerender } = render(<BarChart label="Solicitudes" series={series} points={[]} />)
    const week = Array.from({ length: 30 }, (_, index) => ({
      key: `k${index}`,
      label: `Día ${index + 1}`,
      values: { requests: 1000 + index },
    }))
    rerender(<BarChart label="Solicitudes" series={series} points={week} />)
    // Con el ancho de reserva (300 px) estas cifras de 4 dígitos no cabrían; a 1100 px sí.
    expect(container.querySelectorAll('.value')).toHaveLength(30)
  })

  it('pinta cada serie con el color de la paleta de gráficos que se le pide', () => {
    const { container } = render(
      <BarChart
        label="Solicitudes y resueltos"
        series={[
          { id: 'a', label: 'Solicitudes', color: 'chart1' },
          { id: 'b', label: 'Resueltos', color: 'chart2' },
        ]}
        points={[{ key: 'mon', label: 'Lunes', values: { a: 4, b: 2 } }]}
      />,
    )
    const bars = [...container.querySelectorAll('rect')]
    expect(bars[0]!.getAttribute('class')).toMatch(/chart1/)
    expect(bars[1]!.getAttribute('class')).toMatch(/chart2/)
  })
})
