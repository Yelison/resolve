import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

const items = [
  { id: 'conversation', label: 'Conversación', content: 'Mensajes' },
  { id: 'activity', label: 'Actividad', content: 'Historial' },
  { id: 'files', label: 'Archivos', content: 'Adjuntos' },
]

// El paquete prueba el recorrido con flechas, Inicio y Fin, la activación al moverse y el padre que rechaza una pestaña.
// Este caso fija un detalle que Resolve hereda de él y que documenta el ADR 0002: con un padre controlado que rechaza una
// pestaña, las flechas parten de la pestaña seleccionada, no de la enfocada.
describe('Tabs (comportamiento heredado del paquete)', () => {
  it('con un padre que rechaza una pestaña, las flechas parten de la seleccionada y no de la enfocada', async () => {
    function RefusesActivity() {
      const [value, setValue] = useState('conversation')
      return (
        <Tabs
          label="Vista del ticket"
          items={items}
          value={value}
          onChange={(id) => id !== 'activity' && setValue(id)}
        />
      )
    }
    render(<RefusesActivity />)
    await userEvent.tab()

    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Conversación' })).toHaveAttribute('aria-selected', 'true')

    // La seleccionada sigue siendo Conversación: otra flecha a la derecha vuelve a Actividad, no avanza a Archivos.
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Archivos' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Mensajes')
  })
})
