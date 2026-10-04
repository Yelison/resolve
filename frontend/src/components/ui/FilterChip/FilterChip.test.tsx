import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FilterChip } from './FilterChip'

describe('FilterChip', () => {
  it('es un botón con su etiqueta y un chevron decorativo', () => {
    render(<FilterChip>Estado: Todos</FilterChip>)
    const chip = screen.getByRole('button', { name: 'Estado: Todos' })
    expect(chip).toHaveAttribute('type', 'button')
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('admite atributos de disparador de menú', () => {
    render(
      <FilterChip selected aria-haspopup="menu" aria-expanded={false}>
        Estado: Abierto
      </FilterChip>,
    )
    expect(screen.getByRole('button', { name: 'Estado: Abierto' })).toHaveAttribute('aria-haspopup', 'menu')
  })
})
