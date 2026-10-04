import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, type MenuItem } from './Menu'

function renderMenu(overrides: Partial<Record<string, () => void>> = {}) {
  const items: MenuItem[] = [
    { id: 'assign', label: 'Asignar responsable', onSelect: overrides.assign ?? vi.fn() },
    { id: 'priority', label: 'Cambiar prioridad', onSelect: vi.fn(), disabled: true },
    { id: 'resolve', label: 'Marcar como resuelto', onSelect: overrides.resolve ?? vi.fn() },
    { id: 'delete', label: 'Eliminar ticket', tone: 'danger', onSelect: vi.fn() },
  ]
  render(
    <>
      <Menu label="Acciones del ticket" items={items}>
        {(trigger) => <button {...trigger}>Acciones</button>}
      </Menu>
      <p>Fuera</p>
    </>,
  )
  return screen.getByRole('button', { name: 'Acciones' })
}

describe('Menu', () => {
  it('abre con el teclado y enfoca el primer elemento', async () => {
    const trigger = renderMenu()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Acciones del ticket' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
  })

  it('salta los elementos deshabilitados, da la vuelta y admite búsqueda por letra', async () => {
    const trigger = renderMenu()
    await userEvent.click(trigger)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Marcar como resuelto' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
    await userEvent.keyboard('e')
    expect(screen.getByRole('menuitem', { name: 'Eliminar ticket' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
  })

  it('ejecuta la acción, se cierra y devuelve el foco', async () => {
    const resolve = vi.fn()
    const trigger = renderMenu({ resolve })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))
    expect(resolve).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('se cierra con Escape y al pulsar fuera', async () => {
    const trigger = renderMenu()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await userEvent.click(screen.getByText('Fuera'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Menu dentro de un dialog modal', () => {
  it('se monta dentro del dialog para seguir visible en el top layer', async () => {
    render(
      <dialog open>
        <Menu label="Acciones" items={[{ id: 'a', label: 'Una', onSelect: vi.fn() }]}>
          {(trigger) => <button {...trigger}>Abrir</button>}
        </Menu>
      </dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('menu').closest('dialog')).not.toBeNull()
  })
})
