import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DotPlot, type DotPlotRow } from './DotPlot'

const rows: DotPlotRow[] = [
  { key: 'laura', label: 'Laura Méndez', value: 14 },
  { key: 'daniel', label: 'Daniel Santos', value: 18 },
  { key: 'pablo', label: 'Pablo Viejo', value: 45 },
]
const target = { value: 30, label: 'objetivo 30 min' }
const minutes = (n: number) => `${n} min`

const plot = (props: Partial<Parameters<typeof DotPlot>[0]> = {}) => (
  <DotPlot
    label="Primera respuesta frente al objetivo"
    rows={rows}
    target={target}
    valueFormatter={minutes}
    tickFormatter={String}
    valueColumn="Primera respuesta"
    {...props}
  />
)

describe('DotPlot', () => {
  it('dibuja un punto por fila, más a la derecha cuanto mayor es el valor', () => {
    const { container } = render(plot())
    const lefts = [...container.querySelectorAll<HTMLElement>('button')]
      .filter((button) => button.className.includes('hit'))
      .map((button) => Number.parseFloat(button.style.left))
    expect(lefts).toHaveLength(3)
    expect(lefts[0]).toBeLessThan(lefts[1]!)
    expect(lefts[1]).toBeLessThan(lefts[2]!)
  })

  it('marca con color y con texto a quien supera el objetivo, y solo a esa persona', () => {
    const { container } = render(plot())
    const items = screen.getAllByRole('listitem')
    expect(within(items[2]!).getByText(/por encima del objetivo/)).toBeInTheDocument()
    expect(within(items[0]!).queryByText(/por encima del objetivo/)).not.toBeInTheDocument()
    expect(within(items[1]!).queryByText(/por encima del objetivo/)).not.toBeInTheDocument()
    const dots = [...container.querySelectorAll('[class*="dot"]')]
    expect(dots[2]!.className).toMatch(/over/)
    expect(dots[0]!.className).not.toMatch(/over/)
  })

  it('el valor igual al objetivo cuenta como dentro del objetivo', () => {
    render(plot({ rows: [{ key: 'a', label: 'Ana', value: 30 }] }))
    expect(screen.queryByText(/por encima del objetivo/)).not.toBeInTheDocument()
  })

  it('dibuja la línea del objetivo y la nombra bajo el eje', () => {
    const { container } = render(plot())
    expect(container.querySelectorAll('[class*="target"]:not([class*="Label"]):not([class*="Row"])')).toHaveLength(3)
    expect(screen.getByText('objetivo 30 min')).toBeInTheDocument()
  })

  it('se nombra con su etiqueta, se describe con un resumen y enlaza la tabla como detalle', () => {
    render(plot())
    const chart = screen.getByRole('group', { name: 'Primera respuesta frente al objetivo' })
    expect(chart).toHaveAccessibleDescription(/3 filas; 1 por encima del objetivo: Pablo Viejo\. objetivo 30 min/)
    expect(chart.getAttribute('aria-details')).toBe(screen.getByRole('table', { hidden: true }).parentElement?.id)
  })

  it('la tabla alternativa lleva el valor y el estado frente al objetivo de cada fila', async () => {
    const user = userEvent.setup()
    render(plot())
    const table = screen.getByRole('table', { hidden: true, name: 'Primera respuesta frente al objetivo' })
    const pablo = within(table).getByRole('row', { hidden: true, name: /Pablo Viejo/ })
    expect(within(pablo).getByRole('cell', { hidden: true, name: '45 min' })).toBeInTheDocument()
    expect(within(pablo).getByRole('cell', { hidden: true, name: 'por encima del objetivo' })).toBeInTheDocument()
    const laura = within(table).getByRole('row', { hidden: true, name: /Laura Méndez/ })
    expect(within(laura).getByRole('cell', { hidden: true, name: 'dentro del objetivo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver como tabla de Primera respuesta frente al objetivo' }))
    expect(table.parentElement).not.toHaveClass('visually-hidden')
  })

  it('con el teclado cada punto enseña su valor exacto en un tooltip', async () => {
    const user = userEvent.setup()
    render(plot())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Laura Méndez: 14 min' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Laura Méndez: 14 min')
    await user.tab()
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Pablo Viejo: 45 min, por encima del objetivo')
  })

  it('con el puntero enseña el tooltip del punto señalado', async () => {
    const user = userEvent.setup()
    render(plot())
    await user.hover(screen.getByRole('button', { name: /^Daniel Santos/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Daniel Santos: 18 min')
  })

  it('deja los nombres largos enteros en el texto, sin recortarlos', () => {
    const long = 'Alejandra Fernández de la Fuente y Montenegro, responsable de la cuenta de clientes corporativos'
    render(plot({ rows: [{ key: 'a', label: long, value: 20 }] }))
    expect(screen.getAllByText(long)[0]).toHaveClass('name')
  })

  it('con un valor mayor que el objetivo amplía el eje para que quepan ambos', () => {
    const { container } = render(plot({ rows: [{ key: 'a', label: 'Ana', value: 200 }] }))
    const ticks = [...container.querySelectorAll('[class*="tick"]')].map((node) => Number(node.textContent))
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(150)
    expect(container.innerHTML).not.toMatch(/NaN/)
  })

  it('muestra un mensaje sin datos cuando no hay filas', () => {
    render(plot({ rows: [] }))
    expect(screen.getByText('Primera respuesta frente al objetivo: sin datos en este periodo')).toBeInTheDocument()
  })

  it('con todos los valores dentro del objetivo ancla al borde la etiqueta del objetivo, que cae en el extremo del eje', () => {
    const { container } = render(
      plot({
        rows: [
          { key: 'a', label: 'Ana', value: 20 },
          { key: 'b', label: 'Beto', value: 28 },
        ],
      }),
    )
    const label = container.querySelector<HTMLElement>('[class*="targetLabel"]')!
    expect(label).toHaveTextContent('objetivo 30 min')
    // Sin anclar, `translateX(-50%)` la sacaría medio ancho del eje por la derecha.
    expect(label.style.right).toBe('0px')
    expect(label.style.transform).toBe('')
    const ticks = [...container.querySelectorAll<HTMLElement>('span[class*="tick"]')]
    expect(ticks.every((tick) => tick.style.left !== '' || tick.style.right !== '')).toBe(true)
  })

  it('ancla al borde izquierdo una marca del eje en 0 que, centrada, se saldría', () => {
    const { container } = render(plot())
    const first = container.querySelector<HTMLElement>('span[class*="tick"]')!
    expect(first).toHaveTextContent('0')
    expect(first.style.left).toBe('0px')
  })
})
