import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Editor, type EditorMode, type EditorProps } from './Editor'

function Harness(props: Partial<EditorProps>) {
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<EditorMode>('reply')
  return (
    <Editor
      value={value}
      onChange={setValue}
      mode={mode}
      onModeChange={setMode}
      onSubmit={() => {}}
      onAttach={() => {}}
      {...props}
    />
  )
}

describe('Editor', () => {
  it('etiqueta el texto según el modo y lo cambia con los radios', async () => {
    render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'Respuesta al cliente' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Nota interna' }))
    expect(screen.getByRole('textbox', { name: 'Nota interna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeInTheDocument()
  })

  it('solo permite enviar con contenido y admite Ctrl + Enter', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Enviar respuesta' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), 'Hola María{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Enviar respuesta' })).toBeEnabled()
  })

  it('aplica formato a la selección', async () => {
    render(<Harness />)
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox')
    await userEvent.type(textarea, 'Hola María')
    textarea.setSelectionRange(5, 10)
    await userEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(textarea).toHaveValue('Hola **María**')
  })

  it('la barra de formato es una sola parada de tabulación con flechas', async () => {
    render(<Harness />)
    const toolbar = screen.getByRole('toolbar', { name: 'Formato' })
    const bold = screen.getByRole('button', { name: 'Negrita' })
    bold.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Cursiva' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Adjuntar archivo' })).toHaveFocus()
    expect(toolbar.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })

  it('anuncia el error de envío conservando el borrador', () => {
    render(<Harness status="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Error al enviar · Borrador guardado')
  })

  it('bloquea el reenvío mientras envía', () => {
    render(<Harness status="sending" />)
    expect(screen.getByRole('button', { name: 'Enviando…' })).toHaveAttribute('aria-busy', 'true')
  })
})
