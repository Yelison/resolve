import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Input } from '../Input/Input'
import { Select } from '../Select/Select'
import { Textarea } from '../Textarea/Textarea'

describe('Input', () => {
  it('asocia la etiqueta y la ayuda al control', () => {
    render(<Input label="Correo" hint="Usaremos este correo para responderte." />)
    const input = screen.getByRole('textbox', { name: 'Correo' })
    expect(input).toHaveAccessibleDescription('Usaremos este correo para responderte.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('marca el error, lo describe y lo anuncia', () => {
    render(<Input label="Correo" hint="Obligatorio" error="Escribe un correo válido" />)
    const input = screen.getByRole('textbox', { name: 'Correo' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Escribe un correo válido Obligatorio')
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo válido')
  })

  it('conserva las descripciones propias junto a la ayuda', () => {
    render(
      <>
        <p id="policy">Nunca compartimos tu correo.</p>
        <Input label="Correo" hint="Obligatorio" aria-describedby="policy" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Correo' })).toHaveAccessibleDescription(
      'Obligatorio Nunca compartimos tu correo.',
    )
  })

  it('respeta un id propio', () => {
    render(<Input label="Asunto" id="subject" />)
    expect(screen.getByLabelText('Asunto')).toHaveAttribute('id', 'subject')
  })

  it('reenvía la ref al input', () => {
    let node: HTMLInputElement | null = null
    render(
      <Input
        label="Asunto"
        ref={(element) => {
          node = element
        }}
      />,
    )
    expect(node).toBeInstanceOf(HTMLInputElement)
  })
})

describe('Select', () => {
  it('es un select nativo etiquetado', async () => {
    render(
      <Select label="Prioridad" defaultValue="">
        <option value="" disabled>
          Selecciona una opción
        </option>
        <option value="high">Alta</option>
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Prioridad' })
    await userEvent.selectOptions(select, 'Alta')
    expect(select).toHaveValue('high')
  })
})

describe('Textarea', () => {
  it('admite escritura y error', async () => {
    render(<Textarea label="Descripción" error="Cuéntanos qué ocurre" />)
    const textarea = screen.getByRole('textbox', { name: 'Descripción' })
    await userEvent.type(textarea, 'No puedo entrar')
    expect(textarea).toHaveValue('No puedo entrar')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
  })
})
