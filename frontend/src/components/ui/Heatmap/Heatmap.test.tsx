import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Heatmap, type HeatmapColumn, type HeatmapRow } from './Heatmap'

const rows: HeatmapRow[] = [
  { key: 'mon', label: 'lun' },
  { key: 'tue', label: 'mar' },
]
const columns: HeatmapColumn[] = [
  { key: '0', label: '0', name: '0–2 h' },
  { key: '2', label: '2', name: '2–4 h' },
  { key: '4', label: '4', name: '4–6 h' },
]
const values = [
  [0, 10, 40],
  [1, 20, 30],
]
const cellText = (value: number) => `${value} solicitudes`

function renderMap(overrides: Partial<Parameters<typeof Heatmap>[0]> = {}) {
  return render(
    <Heatmap
      label="Cuándo llegan las solicitudes"
      rows={rows}
      columns={columns}
      values={values}
      rowColumn="Día"
      cellText={cellText}
      {...overrides}
    />,
  )
}

describe('Heatmap', () => {
  it('dibuja una celda por fila y columna con su paso', () => {
    renderMap()
    const cells = screen.getAllByRole('gridcell')
    expect(cells).toHaveLength(6)
    expect(cells.map((cell) => cell.getAttribute('data-step'))).toEqual(['0', '1', '4', '1', '2', '3'])
  })

  it('se nombra con su etiqueta y cada celda con su fila, su franja y su valor', () => {
    renderMap()
    const grid = screen.getByRole('grid', { name: 'Cuándo llegan las solicitudes' })
    expect(grid).toHaveAccessibleDescription(/2 filas por 3 columnas.*tabla alternativa/)
    expect(within(grid).getByRole('gridcell', { name: 'lun 2–4 h: 10 solicitudes' })).toBeInTheDocument()
    expect(within(grid).getByRole('rowheader', { name: 'mar' })).toBeInTheDocument()
    expect(within(grid).getByRole('columnheader', { name: '4–6 h' })).toBeInTheDocument()
  })

  it('la tabla alternativa tiene una fila por día y una columna por franja', async () => {
    const user = userEvent.setup()
    renderMap()
    const table = screen.getByRole('table', { hidden: true, name: 'Cuándo llegan las solicitudes' })
    expect(within(table).getByRole('columnheader', { hidden: true, name: 'Día' })).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('columnheader', { hidden: true })
        .map((th) => th.textContent),
    ).toEqual(['Día', '0–2 h', '2–4 h', '4–6 h'])
    expect(within(table).getByRole('cell', { hidden: true, name: '40 solicitudes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver como tabla de Cuándo llegan las solicitudes' }))
    expect(screen.getByRole('table', { name: 'Cuándo llegan las solicitudes' })).toBeVisible()
  })

  it('el valor 0 es una celda vacía y las ausentes en `values` también', () => {
    renderMap({ values: [[0, 10], []] })
    expect(screen.getAllByRole('gridcell').map((cell) => cell.getAttribute('data-step'))).toEqual([
      '0',
      '4',
      '0',
      '0',
      '0',
      '0',
    ])
  })

  it('con teclado entra con una sola parada de Tab y se recorre con las flechas', async () => {
    const user = userEvent.setup()
    renderMap()
    const cells = screen.getAllByRole('gridcell')
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)

    await user.tab()
    expect(cells[0]).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('lun 0–2 h: 0 solicitudes')

    await user.keyboard('{ArrowRight}')
    expect(cells[1]).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('lun 2–4 h: 10 solicitudes')

    await user.keyboard('{ArrowDown}')
    expect(cells[4]).toHaveFocus()
    await user.keyboard('{End}')
    expect(cells[5]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(cells[3]).toHaveFocus()
    await user.keyboard('{Control>}{Home}{/Control}')
    expect(cells[0]).toHaveFocus()
    await user.keyboard('{Control>}{End}{/Control}')
    expect(cells[5]).toHaveFocus()
    // En los bordes no se sale de la cuadrícula.
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(cells[5]).toHaveFocus()

    // Shift+Tab sale del mapa: la siguiente parada no es otra celda.
    await user.tab()
    expect(cells.every((cell) => cell !== document.activeElement)).toBe(true)
  })

  it('al volver con Tab recuerda la última celda', async () => {
    const user = userEvent.setup()
    renderMap()
    const cells = screen.getAllByRole('gridcell')
    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowDown}')
    await user.tab()
    await user.tab({ shift: true })
    expect(cells[4]).toHaveFocus()
  })

  it('muestra el tooltip con el puntero y la leyenda con los pasos', async () => {
    const user = userEvent.setup()
    const { container } = renderMap()
    await user.hover(screen.getByRole('gridcell', { name: 'mar 4–6 h: 30 solicitudes' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('mar 4–6 h: 30 solicitudes')
    const legend = container.querySelector('[aria-hidden="true"]')!
    expect(legend).toHaveTextContent('MenosMás')
    expect(legend.querySelectorAll('span[class*="swatch"]')).toHaveLength(5)
  })

  it('acepta los extremos de la leyenda', () => {
    const { container } = renderMap({ legend: { low: 'Poco', high: 'Mucho' } })
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('PocoMucho')
  })

  it('sin datos muestra un mensaje en lugar de una cuadrícula vacía', () => {
    renderMap({
      values: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    })
    expect(screen.getByRole('status')).toHaveTextContent('Cuándo llegan las solicitudes: sin datos en este periodo')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { hidden: true })).not.toBeInTheDocument()
  })

  it('sin filas o sin columnas también es un vacío', () => {
    const { rerender } = renderMap({ rows: [], values: [] })
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(<Heatmap label="X" rows={rows} columns={[]} values={[[], []]} />)
    expect(screen.getByRole('status')).toHaveTextContent('X: sin datos')
  })

  it('con datos densos (84 celdas) mantiene una sola parada de Tab', () => {
    const dense = Array.from({ length: 7 }, (_, r) => Array.from({ length: 12 }, (_, c) => 1 + r * 12 + c))
    renderMap({
      rows: Array.from({ length: 7 }, (_, i) => ({ key: String(i), label: `d${i}` })),
      columns: Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: String(i * 2) })),
      values: dense,
    })
    const cells = screen.getAllByRole('gridcell')
    expect(cells).toHaveLength(84)
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)
    expect(new Set(cells.map((cell) => cell.getAttribute('data-step')))).toEqual(new Set(['1', '2', '3', '4']))
  })

  it('su tabla alternativa es ancha: conserva el ancho de cada columna y se desplaza en su contenedor', () => {
    renderMap()
    expect(screen.getByRole('table', { hidden: true })).toHaveClass('wide')
  })
})
