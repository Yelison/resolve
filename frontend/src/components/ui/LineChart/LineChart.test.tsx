import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LineChart, type LineChartPoint } from './LineChart'

const points: LineChartPoint[] = [
  { key: 'a', label: 'lunes, 28 sept', shortLabel: '28', value: 4 },
  { key: 'b', label: 'martes, 29 sept', shortLabel: '29', value: 9 },
  { key: 'c', label: 'miércoles, 30 sept', shortLabel: '30', value: 10 },
]

const many = (count: number): LineChartPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `d${index}`,
    label: `Día ${index + 1}`,
    shortLabel: String(index + 1),
    value: index,
  }))

describe('LineChart', () => {
  it('dibuja una línea con un vértice por punto, sube con el valor y parte de 0', () => {
    const { container } = render(<LineChart label="Pendientes acumulados" points={points} />)
    const vertices = container.querySelector('polyline')!.getAttribute('points')!.split(' ')
    expect(vertices).toHaveLength(3)
    const ys = vertices.map((vertex) => Number(vertex.split(',')[1]))
    expect(ys[0]).toBeGreaterThan(ys[1]!)
    expect(ys[1]).toBeGreaterThan(ys[2]!)
    // El eje incluye el 0 y llega a un valor redondo por encima del máximo.
    const axis = [...container.querySelectorAll('[class*="yLabel"]')].map((node) => node.textContent)
    expect(axis[0]).toBe('0')
    expect(Number(axis[axis.length - 1])).toBeGreaterThanOrEqual(10)
  })

  it('se nombra con su etiqueta, se describe con un resumen y enlaza la tabla como detalle', () => {
    render(<LineChart label="Pendientes acumulados" points={points} />)
    const chart = screen.getByRole('img', { name: 'Pendientes acumulados' })
    expect(chart).toHaveAccessibleDescription(/3 valores\. Último 10 en miércoles, 30 sept\. Máximo 10.*mínimo 4/)
    expect(chart.getAttribute('aria-details')).toBe(screen.getByRole('table', { hidden: true }).parentElement?.id)
  })

  it('no mete los marcadores dentro de la imagen: la imagen no tiene hijos interactivos', () => {
    render(<LineChart label="Pendientes acumulados" points={points} />)
    expect(within(screen.getByRole('img', { name: 'Pendientes acumulados' })).queryAllByRole('button')).toHaveLength(0)
  })

  it('ofrece los valores exactos en la tabla alternativa y el botón la muestra y oculta', async () => {
    const user = userEvent.setup()
    render(<LineChart label="Pendientes acumulados" points={points} valueColumn="Pendientes" />)
    const table = screen.getByRole('table', { hidden: true, name: 'Pendientes acumulados' })
    expect(within(table).getByRole('columnheader', { hidden: true, name: 'Pendientes' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { hidden: true, name: 'martes, 29 sept' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { hidden: true, name: '9' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver como tabla de Pendientes acumulados' }))
    expect(table.parentElement).not.toHaveClass('visually-hidden')
  })

  it('con teclado se entra por el último punto y su tooltip da el valor exacto', async () => {
    const user = userEvent.setup()
    render(<LineChart label="Pendientes acumulados" points={points} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'miércoles, 30 sept: 10' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('miércoles, 30 sept: 10')
  })

  it('las flechas, Inicio y Fin recorren los puntos y Tab pasa a la tabla y sale del gráfico', async () => {
    const user = userEvent.setup()
    render(
      <>
        <LineChart label="Pendientes acumulados" points={points} />
        <button type="button">Siguiente</button>
      </>,
    )
    await user.tab()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'martes, 29 sept: 9' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('martes, 29 sept: 9')
    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'lunes, 28 sept: 4' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'miércoles, 30 sept: 10' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Ver como tabla de Pendientes acumulados' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus()
  })

  it('con 90 puntos solo hay una parada de tabulación', () => {
    render(<LineChart label="Pendientes acumulados" points={many(90)} />)
    const stops = screen.getAllByRole('button', { name: /^Día / }).filter((button) => button.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAccessibleName('Día 90: 89')
  })

  it('con el puntero muestra el tooltip del punto señalado', async () => {
    const user = userEvent.setup()
    render(<LineChart label="Pendientes acumulados" points={points} />)
    await user.hover(screen.getByRole('button', { name: 'martes, 29 sept: 9' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('martes, 29 sept: 9')
  })

  it('muestra la etiqueta del último valor cuando se pide', () => {
    render(<LineChart label="Pendientes acumulados" points={points} endLabel="+10 pendientes" />)
    expect(screen.getByText('+10 pendientes')).toBeInTheDocument()
  })

  it('dibuja la línea del 0 y mantiene los puntos dentro del dibujo con valores negativos', () => {
    const negative = [
      { key: 'a', label: 'A', value: -6 },
      { key: 'b', label: 'B', value: 2 },
    ]
    const { container } = render(<LineChart label="Saldo" points={negative} />)
    const ys = container
      .querySelector('polyline')!
      .getAttribute('points')!
      .split(' ')
      .map((vertex) => Number(vertex.split(',')[1]))
    ys.forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    })
    expect(container.querySelector('[class*="zero"]')).not.toBeNull()
  })

  it('con todos los valores en 0 dibuja una línea recta en la base sin dividir por cero', () => {
    const flat = many(5).map((point) => ({ ...point, value: 0 }))
    const { container } = render(<LineChart label="Saldo" points={flat} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('con un solo punto dibuja el punto y no la línea', () => {
    const { container } = render(<LineChart label="Saldo" points={[points[0]!]} />)
    expect(container.querySelector('polyline')).toBeNull()
    expect(screen.getAllByRole('button', { name: /lunes/ })).toHaveLength(1)
  })

  it('muestra un mensaje sin datos cuando no hay puntos', () => {
    render(<LineChart label="Pendientes acumulados" points={[]} />)
    expect(screen.getByText('Pendientes acumulados: sin datos en este periodo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('pega al borde la última etiqueta del eje cuando, centrada, se saldría del gráfico', () => {
    const { container } = render(<LineChart label="Pendientes acumulados" points={many(90)} />)
    const labels = [...container.querySelectorAll<HTMLElement>('[class*="xLabel"]')]
    expect(labels[labels.length - 1]).toHaveTextContent('90')
    expect(labels[labels.length - 1]!.style.right).toBe('0px')
  })
})
