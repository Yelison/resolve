import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tabs } from './Tabs'

const items = [
  { id: 'conversation', label: 'Conversación', content: 'Mensajes' },
  { id: 'activity', label: 'Actividad', content: 'Historial' },
  { id: 'files', label: 'Archivos', content: 'Adjuntos' },
]

describe('Tabs', () => {
  it('relaciona pestañas y paneles', () => {
    render(<Tabs label="Vista del ticket" items={items} />)
    expect(screen.getByRole('tablist', { name: 'Vista del ticket' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Conversación' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Conversación' })).toHaveTextContent('Mensajes')
  })

  it('se recorre con flechas, Inicio y Fin y activa al moverse', async () => {
    const onChange = vi.fn()
    render(<Tabs label="Vista del ticket" items={items} onChange={onChange} />)
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Historial')
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Conversación' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Archivos' })).toHaveAttribute('aria-selected', 'true')
    expect(onChange).toHaveBeenLastCalledWith('files')
  })

  it('solo la pestaña activa está en el orden de tabulación', () => {
    render(<Tabs label="Vista del ticket" items={items} defaultValue="activity" />)
    expect(screen.getByRole('tab', { name: 'Actividad' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Conversación' })).toHaveAttribute('tabindex', '-1')
  })
})
