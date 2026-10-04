import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { iconPaths } from './paths'

describe('Icon', () => {
  it('es decorativo por defecto', () => {
    const { container } = render(<Icon name="search" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
  })

  it('se anuncia como imagen cuando recibe una etiqueta', () => {
    render(<Icon name="bell" label="Notificaciones" />)
    expect(screen.getByRole('img', { name: 'Notificaciones' })).toBeInTheDocument()
  })

  it('dibuja los trazados del diseño con el color actual y el tamaño pedido', () => {
    const { container } = render(<Icon name="ticket" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(container.querySelectorAll('path')).toHaveLength(iconPaths.ticket.length)
  })
})
