import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Select } from './Select'

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
