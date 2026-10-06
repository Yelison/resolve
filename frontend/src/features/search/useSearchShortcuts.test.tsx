import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSearchShortcuts } from './useSearchShortcuts'

function Harness({ open = false, onOpen }: { open?: boolean; onOpen: () => void }) {
  useSearchShortcuts(open, onOpen)
  return (
    <>
      <input aria-label="Asunto" />
      <textarea aria-label="Mensaje" />
      <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor" />
      <button>Botón</button>
    </>
  )
}

describe('useSearchShortcuts', () => {
  it('abre con Ctrl+K y con ⌘K, también desde un campo, y evita el atajo del navegador', () => {
    const onOpen = vi.fn()
    const { getByLabelText } = render(<Harness onOpen={onOpen} />)
    expect(fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })).toBe(false)
    fireEvent.keyDown(getByLabelText('Asunto'), { key: 'K', metaKey: true })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('con la búsqueda abierta no vuelve a abrirla, pero sigue evitando el atajo del navegador', () => {
    const onOpen = vi.fn()
    render(<Harness open onOpen={onOpen} />)
    expect(fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })).toBe(false)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('abre con / cuando el foco está en el cuerpo o en un botón, también con Mayús (Mayús+7)', () => {
    const onOpen = vi.fn()
    const { getByRole } = render(<Harness onOpen={onOpen} />)
    fireEvent.keyDown(document.body, { key: '/' })
    fireEvent.keyDown(getByRole('button', { name: 'Botón' }), { key: '/', shiftKey: true })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('no roba la / al escribir en un campo, un área de texto o un editor', () => {
    const onOpen = vi.fn()
    const { getByLabelText } = render(<Harness onOpen={onOpen} />)
    for (const label of ['Asunto', 'Mensaje', 'Editor']) {
      expect(fireEvent.keyDown(getByLabelText(label), { key: '/' })).toBe(true)
    }
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('no abre con / si hay otro diálogo abierto, con modificadores ni durante una composición', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    fireEvent.keyDown(document.body, { key: '/', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: '/', altKey: true })
    fireEvent.keyDown(document.body, { key: '/', isComposing: true })
    fireEvent.keyDown(document.body, { key: '/', repeat: true })
    const dialog = document.body.appendChild(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    fireEvent.keyDown(document.body, { key: '/' })
    dialog.remove()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('Ctrl+K no abre la búsqueda sobre otro diálogo abierto, pero evita el atajo del navegador', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    const dialog = document.body.appendChild(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    expect(fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })).toBe(false)
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    expect(onOpen).not.toHaveBeenCalled()
    dialog.remove()
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
