import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert } from './Alert'

describe('Alert', () => {
  it('no interrumpe por defecto', () => {
    render(<Alert title="Información importante">Un mensaje breve.</Alert>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('usa alert para errores y status para el resto cuando es dinámico', () => {
    const { rerender } = render(<Alert tone="red" title="No se pudo guardar" live />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
    rerender(<Alert tone="green" title="Guardado" live />)
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
  })
})
