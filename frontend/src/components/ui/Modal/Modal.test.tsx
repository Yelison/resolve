import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

// El comportamiento del diálogo (foco, Escape, fondo, cierre nativo) lo prueba @yelison/forma-ui. Aquí solo lo que
// Resolve necesita del paquete y conserva de #107: que una pulsación que empieza en el fondo y se suelta dentro no
// cierra (el e2e `dialog-backdrop.spec.ts` lo comprueba también en el navegador) y que el scroll queda bloqueado.
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
      />
    </>
  )
}

describe('Modal del paquete en Resolve', () => {
  it('se etiqueta con su título y descripción y bloquea el scroll de la página', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar este ticket?' })
    expect(dialog).toHaveAccessibleDescription('Esta acción eliminará el ticket y su historial.')
    // La clase la define `base.css` del paquete, que `global.css` importa.
    expect(document.documentElement).toHaveClass('forma-scroll-locked')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(document.documentElement).not.toHaveClass('forma-scroll-locked')
  })

  it('no se cierra si una pulsación en el fondo se suelta dentro del diálogo', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.pointerDown(dialog)
    fireEvent.pointerUp(screen.getByText('¿Eliminar este ticket?'))
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('se cierra con una pulsación completa en el fondo', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.pointerDown(dialog)
    fireEvent.pointerUp(dialog)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
