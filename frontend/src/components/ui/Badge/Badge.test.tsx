import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('muestra su contenido y admite atributos nativos', () => {
    render(
      <Badge tone="red" title="Prioridad">
        Urgente
      </Badge>,
    )
    expect(screen.getByText('Urgente')).toHaveAttribute('title', 'Prioridad')
  })
})
