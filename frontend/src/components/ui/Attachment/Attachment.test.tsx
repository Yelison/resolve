import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Attachment } from './Attachment'

describe('Attachment', () => {
  it('muestra tamaño y un enlace de descarga con nombre único', () => {
    render(<Attachment name="captura-error.png" size={245_760} href="/files/1" />)
    expect(screen.getByText(/240 KB/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Descargar captura-error.png' })).toHaveAttribute('href', '/files/1')
  })

  it('expone el progreso de subida', () => {
    render(<Attachment name="captura-error.png" size={245_760} status="uploading" progress={64} />)
    expect(screen.getByRole('progressbar', { name: 'Subiendo captura-error.png' })).toHaveValue(64)
    expect(screen.getByText('Subiendo… 64 %')).toBeInTheDocument()
  })

  it('anuncia el error y permite reintentar', async () => {
    const onRetry = vi.fn()
    render(<Attachment name="captura-error.png" size={245_760} status="error" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo subir')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar captura-error.png' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
