import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DonutChart, type DonutSegment } from './DonutChart'

const segments: DonutSegment[] = [
  { id: 'email', label: 'Correo', value: 56, color: 1, valueText: '45,5 % · 56 tickets' },
  { id: 'chat', label: 'Chat', value: 41, color: 2, valueText: '33,3 % · 41 tickets' },
  { id: 'web', label: 'Web', value: 26, color: 4, valueText: '21,1 % · 26 tickets' },
]

describe('DonutChart', () => {
  it('dibuja un sector por segmento con valor y los colores que se le piden', () => {
    const { container } = render(<DonutChart label="Solicitudes por canal" segments={segments} centerValue="123" />)
    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(3)
    expect(paths[0]!.getAttribute('class')).toMatch(/color1/)
    expect(paths[2]!.getAttribute('class')).toMatch(/color4/)
  })

  it('el color sigue al segmento y no a su posición', () => {
    const { container } = render(<DonutChart label="Canales" segments={[...segments].reverse()} />)
    const classes = [...container.querySelectorAll('svg path')].map((path) => path.getAttribute('class'))
    expect(classes[0]).toMatch(/color4/)
    expect(classes[2]).toMatch(/color1/)
  })

  it('se nombra con su etiqueta y se describe con los valores exactos', () => {
    render(<DonutChart label="Solicitudes por canal" segments={segments} />)
    const chart = screen.getByRole('img', { name: 'Solicitudes por canal' })
    expect(chart).toHaveAccessibleDescription(/3 segmentos: Correo 45,5 % · 56 tickets; Chat 33,3 %/)
  })

  it('ofrece los valores en la tabla alternativa, que el botón muestra y oculta', async () => {
    const user = userEvent.setup()
    render(<DonutChart label="Solicitudes por canal" segments={segments} valueColumn="Solicitudes" />)
    const table = screen.getByRole('table', { hidden: true, name: 'Solicitudes por canal' })
    expect(within(table).getByRole('columnheader', { hidden: true, name: 'Solicitudes' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { hidden: true, name: 'Web' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { hidden: true, name: '21,1 % · 26 tickets' })).toBeInTheDocument()
    const wrap = table.parentElement!
    expect(wrap).toHaveClass('visually-hidden')
    await user.click(screen.getByRole('button', { name: 'Ver como tabla de Solicitudes por canal' }))
    expect(wrap).not.toHaveClass('visually-hidden')
  })

  it('con el teclado cada segmento enseña su valor exacto en un tooltip', async () => {
    const user = userEvent.setup()
    const { container } = render(<DonutChart label="Solicitudes por canal" segments={segments} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Correo: 45,5 % · 56 tickets' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Correo: 45,5 % · 56 tickets')
    expect(container.querySelector('svg path')!.getAttribute('class')).toMatch(/active/)
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Chat: 33,3 % · 41 tickets')
  })

  it('con el puntero señala el segmento y su tooltip', async () => {
    const user = userEvent.setup()
    render(<DonutChart label="Solicitudes por canal" segments={segments} />)
    await user.hover(screen.getByRole('button', { name: /^Web:/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Web: 21,1 % · 26 tickets')
  })

  it('con un único segmento dibuja el anillo completo', () => {
    const { container } = render(<DonutChart label="Canal" segments={[segments[0]!]} />)
    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(1)
    expect(paths[0]!.getAttribute('d')).not.toContain('L')
  })

  it('un segmento de valor 0 sale en la leyenda y la tabla, pero no en el anillo ni en el teclado', () => {
    const { container } = render(
      <DonutChart label="Canales" segments={[...segments, { id: 'phone', label: 'Teléfono', value: 0, color: 3 }]} />,
    )
    expect(container.querySelectorAll('svg path')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /^Teléfono/ })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { hidden: true, name: 'Teléfono' })).toBeInTheDocument()
  })

  it('muestra un mensaje sin datos cuando no hay segmentos o todos valen 0', () => {
    const { rerender } = render(<DonutChart label="Solicitudes por canal" segments={[]} />)
    expect(screen.getByText('Solicitudes por canal: sin datos en este periodo')).toBeInTheDocument()
    rerender(<DonutChart label="Solicitudes por canal" segments={[{ id: 'a', label: 'A', value: 0, color: 1 }]} />)
    expect(screen.getByText('Solicitudes por canal: sin datos en este periodo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('deja que los nombres largos se partan en la leyenda', () => {
    const long = 'Soporte técnico de la región norte con un nombre larguísimo '.repeat(3).trim()
    const { container } = render(
      <DonutChart label="Canales" segments={[{ id: 'a', label: long, value: 3, color: 1 }, ...segments]} />,
    )
    expect(within(container.querySelector('ul')!).getByText(long)).toHaveClass('legendLabel')
  })

  it('acepta la rampa secuencial: sector y cuadro de leyenda con la clase del paso', () => {
    const ramp: DonutSegment[] = (['seq1', 'seq2', 'seq3', 'seq4'] as const).map((color, index) => ({
      id: color,
      label: `Paso ${index + 1}`,
      value: 4 - index,
      color,
    }))
    const { container } = render(<DonutChart label="Prioridad" segments={ramp} />)
    const paths = [...container.querySelectorAll('svg path')].map((path) => path.getAttribute('class'))
    expect(paths.map((c) => /colorseq(\d)/.exec(c ?? '')?.[1])).toEqual(['1', '2', '3', '4'])
    const swatches = [...container.querySelectorAll('ul span[class*="swatch"]')].map((el) => el.getAttribute('class'))
    expect(swatches[2]).toMatch(/colorseq3/)
    expect(swatches[3]).toMatch(/colorseq4/)
  })
})
