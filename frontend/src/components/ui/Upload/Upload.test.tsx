import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Upload } from './Upload'
import { validateFiles } from './validateFiles'

const png = (name: string, size: number) => {
  const file = new File(['x'], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('validateFiles', () => {
  it('separa archivos válidos y explica los rechazos', () => {
    const result = validateFiles([png('ok.png', 100), png('grande.png', 11 * 1024 * 1024), new File(['x'], 'a.exe')], {
      accept: ['image/png'],
      maxSize: 10 * 1024 * 1024,
    })
    expect(result.accepted.map((file) => file.name)).toEqual(['ok.png'])
    expect(result.errors).toEqual(['grande.png supera el límite de 10 MB', 'a.exe: formato no admitido'])
  })
})

describe('Upload', () => {
  it('entrega los archivos elegidos con el selector', async () => {
    const onFiles = vi.fn()
    render(<Upload onFiles={onFiles} />)
    const input = screen.getByLabelText(/Arrastra archivos/)
    await userEvent.upload(input, png('captura.png', 1000))
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'captura.png' })])
  })

  it('anuncia los archivos rechazados al soltarlos', () => {
    const onFiles = vi.fn()
    render(<Upload onFiles={onFiles} maxSize={500} />)
    const zone = screen.getByText(/Arrastra archivos/).closest('label')!
    fireEvent.drop(zone, { dataTransfer: { files: [png('captura.png', 1000)] } })
    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('captura.png supera el límite de 500 B')
    expect(screen.getByLabelText(/Arrastra archivos/)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Upload con un solo archivo', () => {
  it('usa el primero y avisa', () => {
    const onFiles = vi.fn()
    render(<Upload onFiles={onFiles} multiple={false} />)
    const zone = screen.getByText(/Arrastra archivos/).closest('label')!
    fireEvent.drop(zone, { dataTransfer: { files: [png('a.png', 10), png('b.png', 10)] } })
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' })])
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se admite un archivo; se usó el primero')
  })
})
