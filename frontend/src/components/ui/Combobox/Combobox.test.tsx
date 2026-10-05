import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Combobox, type ComboboxOption } from './Combobox'

const all: ComboboxOption[] = [
  { value: 'c-1', label: 'María Pérez', description: 'Acme Studio' },
  { value: 'c-2', label: 'Carlos Ruiz', description: 'Northstar' },
]

function Harness() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ComboboxOption | null>(null)
  const options = all.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
  return (
    <Combobox
      label="Cliente"
      query={query}
      onQueryChange={setQuery}
      options={options}
      selected={selected}
      onSelect={setSelected}
      emptyText="Ningún cliente coincide"
    />
  )
}

describe('Combobox', () => {
  it('filtra al escribir y elige con el teclado', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Cliente' })
    await userEvent.type(input, 'car')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id)
    await userEvent.keyboard('{Enter}')
    expect(input).toHaveValue('Carlos Ruiz')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('elige con el puntero y cierra con Escape', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Cliente' })
    await userEvent.click(input)
    await userEvent.click(screen.getByRole('option', { name: /María Pérez/ }))
    expect(input).toHaveValue('María Pérez')
    await userEvent.click(input)
    expect(screen.getByRole('option', { name: /María Pérez/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('aria-controls solo apunta al listbox mientras está abierto', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Cliente' })
    expect(input).not.toHaveAttribute('aria-controls')
    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    await userEvent.keyboard('{Escape}')
    expect(input).not.toHaveAttribute('aria-controls')
  })

  it('avisa cuando no hay coincidencias', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Cliente' }), 'zzz')
    expect(screen.getByText('Ningún cliente coincide')).toBeInTheDocument()
  })
})
