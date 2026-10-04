import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('expone un estado de carga legible y oculta las líneas', () => {
    const { container } = render(<Skeleton lines={3} label="Cargando tickets…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tickets…')
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
  })
})
