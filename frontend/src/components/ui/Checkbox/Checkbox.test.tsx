import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Radio } from '../Radio/Radio'
import { Switch } from '../Switch/Switch'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('se marca al pulsar la etiqueta', async () => {
    render(<Checkbox label="Recordarme" />)
    await userEvent.click(screen.getByText('Recordarme'))
    expect(screen.getByRole('checkbox', { name: 'Recordarme' })).toBeChecked()
  })

  it('mantiene el nombre accesible con la etiqueta oculta', () => {
    render(<Checkbox label="Seleccionar ticket #1048" hideLabel />)
    expect(screen.getByRole('checkbox', { name: 'Seleccionar ticket #1048' })).toBeInTheDocument()
  })

  it('refleja el estado mixto y conserva la ref externa', () => {
    const ref = createRef<HTMLInputElement>()
    const { rerender } = render(<Checkbox label="Todos" indeterminate ref={ref} />)
    expect(ref.current?.indeterminate).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Todos' })).toBePartiallyChecked()
    rerender(<Checkbox label="Todos" ref={ref} />)
    expect(ref.current?.indeterminate).toBe(false)
  })
})

describe('Radio', () => {
  it('solo permite una opción por grupo', async () => {
    render(
      <fieldset>
        <legend>Canal</legend>
        <Radio name="channel" value="email" label="Correo" />
        <Radio name="channel" value="chat" label="Chat" />
      </fieldset>,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Correo' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Chat' }))
    expect(screen.getByRole('radio', { name: 'Chat' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Correo' })).not.toBeChecked()
  })
})

describe('Switch', () => {
  it('se expone como interruptor y cambia con el teclado', async () => {
    render(<Switch label="Notificaciones por correo" />)
    const control = screen.getByRole('switch', { name: 'Notificaciones por correo' })
    control.focus()
    await userEvent.keyboard(' ')
    expect(control).toBeChecked()
  })
})
