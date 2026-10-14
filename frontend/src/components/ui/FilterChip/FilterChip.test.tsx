import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Menu } from '../Menu/Menu'
import { FilterChip } from './FilterChip'

// El componente es de @yelison/forma-ui. Lo que se fija aquí es el contrato con Resolve: un `FilterChip` dentro de un
// `Menu` recibe `aria-haspopup="menu"` por `{...trigger}` y por eso es un disparador (chevron, sin `aria-pressed`).
describe('FilterChip como disparador de un Menu', () => {
  const items = [{ id: 'a', label: 'Abierto', onSelect: () => {} }]

  it.each([false, true])('con selected=%s pinta el chevron y no lleva aria-pressed', (selected) => {
    render(
      <Menu label="Filtrar por estado" items={items}>
        {(trigger) => (
          <FilterChip selected={selected} {...trigger}>
            Estado
          </FilterChip>
        )}
      </Menu>,
    )
    const chip = screen.getByRole('button', { name: 'Estado' })
    expect(chip).toHaveAttribute('aria-haspopup', 'menu')
    expect(chip).not.toHaveAttribute('aria-pressed')
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sin aria-haspopup es un conmutador: aria-pressed y sin chevron', () => {
    render(<FilterChip selected>Archivados</FilterChip>)
    const chip = screen.getByRole('button', { name: 'Archivados' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.querySelector('svg')).toBeNull()
  })
})
