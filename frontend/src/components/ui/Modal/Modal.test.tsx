import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Eliminar</button>
      <Modal
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="¿Eliminar este ticket?"
        description="Esta acción eliminará el ticket y su historial."
        footer={<button onClick={() => setOpen(false)}>Cancelar</button>}
      />
    </>
  )
}

describe('Modal', () => {
  it('se etiqueta con su título y descripción', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar este ticket?' })
    expect(dialog).toHaveAccessibleDescription('Esta acción eliminará el ticket y su historial.')
    expect(document.documentElement).toHaveClass('scroll-locked')
  })

  it('se cierra con Escape y devuelve el foco al disparador', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Eliminar' })
    await userEvent.click(trigger)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.documentElement).not.toHaveClass('scroll-locked')
  })

  it('se cierra al pulsar el fondo pero no al pulsar el contenido', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await userEvent.click(screen.getByText('¿Eliminar este ticket?'))
    expect(onClose).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    fireEvent.pointerDown(screen.getByText('¿Eliminar este ticket?'))
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('sincroniza el estado cuando el diálogo se cierra de forma nativa', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    ;(screen.getByRole('dialog') as HTMLDialogElement).close()
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('no avisa dos veces cuando el padre lo cierra', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
