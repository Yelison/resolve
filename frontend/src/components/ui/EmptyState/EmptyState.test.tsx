import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('muestra título, descripción y acción con el nivel de encabezado pedido', () => {
    render(
      <EmptyState
        title="Todavía no hay tickets"
        description="Crea tu primera solicitud para empezar."
        action={<button>Crear ticket</button>}
        headingLevel={3}
      />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no hay tickets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear ticket' })).toBeInTheDocument()
  })

  it('anuncia los errores solo cuando se pide', () => {
    const { rerender } = render(<EmptyState kind="error" title="No pudimos cargar los tickets" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    rerender(<EmptyState kind="error" title="No pudimos cargar los tickets" live />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los tickets')
  })
})
