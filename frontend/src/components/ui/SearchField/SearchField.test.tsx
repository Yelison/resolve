import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchField } from './SearchField'

function Harness() {
  const [value, setValue] = useState('')
  return <SearchField label="Buscar tickets" value={value} onValueChange={setValue} placeholder="Buscar…" />
}

describe('SearchField', () => {
  it('es un campo de búsqueda etiquetado que se borra con Escape', async () => {
    render(<Harness />)
    const input = screen.getByRole('searchbox', { name: 'Buscar tickets' })
    await userEvent.type(input, 'pago')
    expect(input).toHaveValue('pago')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })
})
